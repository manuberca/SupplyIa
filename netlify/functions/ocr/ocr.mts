// Lectura de remitos con IA (SPEC §7). Basada en netlify/functions/ocr.js de La Bodeguita.
// Exige la sesión de Supabase, respeta el tope de lecturas del mes, arma el contexto con el
// catálogo de ese bar y ese proveedor, lee la foto con Claude (salida estructurada) y controla
// las cuentas antes de responder. La clave de Anthropic vive solo acá (variables de Netlify).
//
// Una boleta muy larga no llega a leerse en el tiempo de una función: se corta antes del límite,
// se responde con los renglones leídos y un pase firmado, y la app pide el resto con ese pase
// (src/recepcion/continuar.ts). Seguir una boleta no cuenta otra lectura en el tope.
//
// Se configura con variables de entorno: OCR_MODEL, OCR_EFFORT y OCR_DEADLINE_MS.

import Anthropic from '@anthropic-ai/sdk'
import * as Sentry from '@sentry/node'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../src/lib/database.types'
import { pedidoLecturaSchema, type RespuestaLectura } from '../../../src/recepcion/lectura'
import { armarLectura } from '../../../src/recepcion/armar-lectura'
import { pistaDelUltimo } from '../../../src/recepcion/continuar'
import { abrirPase, firmarPase, MAX_VUELTAS, VIGENCIA_PASE_MS } from '../../../src/recepcion/pase'
import { iniciarSentry, secreto } from '../../lib/entorno'
import { armarContexto, configuracion, ErrorDeLectura, leerConIA, mensajeDeLaApi } from './lector'

export const config = { path: '/api/ocr' }

iniciarSentry()

class ErrorParaMostrar extends Error {
  constructor(
    mensaje: string,
    readonly status = 400,
  ) {
    super(mensaje)
  }
}

function responder(cuerpo: RespuestaLectura, status = 200, origen?: string | null): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (origen) headers['Access-Control-Allow-Origin'] = origen
  return new Response(JSON.stringify(cuerpo), { status, headers })
}

// Solo responde a la app (y a local). La llave de verdad es la sesión; esto corta el uso desde otras páginas.
function origenPermitido(req: Request): string | null | false {
  const origen = req.headers.get('origin')
  if (!origen) return null // mismo origen: el navegador no lo manda en todos los casos
  const permitidos = [
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
    'http://localhost:5173',
    'http://localhost:4173',
  ]
  return permitidos.includes(origen) ? origen : false
}

/** Mes de Argentina (el tope es por mes calendario del bar). */
function mesActual(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

export default async function handler(req: Request): Promise<Response> {
  const llegada = Date.now()
  const origen = origenPermitido(req)
  if (origen === false) return responder({ ok: false, error: 'Acceso no permitido.' }, 403)
  if (req.method !== 'POST')
    return responder({ ok: false, error: 'Método no permitido.' }, 405, origen)

  const url = process.env.VITE_SUPABASE_URL
  const clavePublica = process.env.VITE_SUPABASE_ANON_KEY
  const claveServicio = secreto('SUPABASE_SERVICE_ROLE_KEY').valor
  if (!url || !clavePublica || !claveServicio || !secreto('ANTHROPIC_API_KEY').valor) {
    Sentry.captureMessage('Falta configurar la función ocr')
    await Sentry.flush(2000)
    return responder(
      {
        ok: false,
        error: 'El lector no está configurado. Cargá el remito a mano y avisale a soporte.',
      },
      500,
      origen,
    )
  }

  let reservada: { org: string; mes: string } | null = null
  const servicio = createClient<Database>(url, claveServicio, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    // ─── Quién es ───────────────────────────────────────────────────────
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) throw new ErrorParaMostrar('Tu sesión venció. Entrá de nuevo.', 401)
    const db = createClient<Database>(url, clavePublica, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: usuario, error: errorUsuario } = await db.auth.getUser(token)
    if (errorUsuario || !usuario.user)
      throw new ErrorParaMostrar('Tu sesión venció. Entrá de nuevo.', 401)
    const { data: miembro } = await db
      .from('miembros')
      .select('org_id, activo')
      .eq('user_id', usuario.user.id)
      .maybeSingle()
    if (!miembro?.activo) throw new ErrorParaMostrar('Tu usuario no está en ningún bar.', 403)

    // ─── Qué manda ──────────────────────────────────────────────────────
    const cuerpo = pedidoLecturaSchema.safeParse(await req.json().catch(() => null))
    if (!cuerpo.success) throw new ErrorParaMostrar('La foto no llegó bien. Sacala de nuevo.')
    const { proveedorId, imagen, alternativa, tipo } = cuerpo.data

    // Boleta larga: sigue una lectura que se cortó por tiempo. El pase lo firmó esta función.
    const pase = cuerpo.data.continuar
      ? await abrirPase(claveServicio, cuerpo.data.continuar)
      : null
    if (
      cuerpo.data.continuar &&
      (!pase ||
        pase.org !== miembro.org_id ||
        pase.proveedor !== proveedorId ||
        pase.vuelta >= MAX_VUELTAS)
    ) {
      throw new ErrorParaMostrar('La lectura se interrumpió. Sacá la foto de nuevo.')
    }

    // Con la sesión del usuario: RLS garantiza que solo ve su catálogo.
    const [proveedor, productos, equivalencias, correcciones] = await Promise.all([
      db.from('proveedores').select('id, nombre').eq('id', proveedorId).maybeSingle(),
      db
        .from('productos')
        .select(
          'id, nombre, unidades ( nombre ), presentaciones ( nombre, factor_a_base, aproximada, activa )',
        )
        .eq('proveedor_id', proveedorId)
        .eq('activo', true)
        .order('nombre'),
      db
        .from('equivalencias')
        .select('texto_remito, producto_id')
        .eq('proveedor_id', proveedorId)
        .limit(200),
      db
        .from('correcciones_ocr')
        .select('campo, detectado, correcto')
        .eq('proveedor_id', proveedorId)
        .order('creado_at', { ascending: false })
        .limit(20),
    ])
    if (!proveedor.data) throw new ErrorParaMostrar('No encontramos ese proveedor.', 404)
    if (productos.error || equivalencias.error || correcciones.error) {
      throw productos.error ?? equivalencias.error ?? correcciones.error
    }

    // ─── Tope del mes ───────────────────────────────────────────────────
    // Seguir una boleta larga no cuenta de nuevo: es la misma lectura.
    let uso: { usadas: number; tope: number }
    if (pase) {
      uso = { usadas: pase.usadas, tope: pase.tope }
    } else {
      const mes = mesActual()
      const { data: reserva, error: errorReserva } = await servicio.rpc('reservar_lectura', {
        p_org: miembro.org_id,
        p_mes: mes,
      })
      if (errorReserva) throw errorReserva
      const reservado = reserva as { ok: boolean; usadas: number; tope: number }
      if (!reservado.ok) {
        throw new ErrorParaMostrar(
          `Llegaste al tope de ${reservado.tope} lecturas con IA de este mes. Cargá el remito a mano; el mes que viene se renueva.`,
          429,
        )
      }
      uso = reservado
      reservada = { org: miembro.org_id, mes }
    }

    // ─── Lectura ────────────────────────────────────────────────────────
    const { contexto, idPorRef } = armarContexto({
      proveedor: proveedor.data.nombre,
      productos: (productos.data ?? []).map((p) => ({
        id: p.id,
        nombre: p.nombre,
        unidad: p.unidades?.nombre ?? 'unidad',
        presentaciones: (p.presentaciones ?? [])
          .filter((x) => x.activa)
          .map((x) => ({ nombre: x.nombre, factor: x.factor_a_base, aproximada: x.aproximada })),
      })),
      equivalencias: (equivalencias.data ?? []).map((e) => ({
        texto: e.texto_remito,
        productoId: e.producto_id,
      })),
      correcciones: correcciones.data ?? [],
    })
    const leido = await leerConIA({
      imagen,
      alternativa,
      tipo,
      contexto,
      continuar: pase ? { desde: pase.desde, ultimo: pase.ultimo } : undefined,
      // Lo que ya se fue en la sesión y el catálogo se descuenta del tiempo de lectura.
      corteMs: configuracion().corteMs - (Date.now() - llegada),
    })
    const lectura = armarLectura(leido.salida, idPorRef)

    // Se cortó por tiempo: el pase para pedir los renglones que faltan.
    const ultimo = leido.salida.items.at(-1)
    const leidos = (pase?.desde ?? 0) + leido.salida.items.length
    const continuar =
      !leido.completa && ultimo
        ? {
            leidos,
            pase: await firmarPase(claveServicio, {
              org: miembro.org_id,
              proveedor: proveedorId,
              desde: leidos,
              ultimo: pistaDelUltimo(ultimo),
              usadas: uso.usadas,
              tope: uso.tope,
              vuelta: (pase?.vuelta ?? 0) + 1,
              vence: Date.now() + VIGENCIA_PASE_MS,
            }),
          }
        : null

    // ¿Ya se cargó este remito?
    let duplicado: { recibidoAt: string } | null = null
    if (lectura.nroRemito) {
      const { data } = await db
        .from('recepciones')
        .select('recibido_at')
        .eq('proveedor_id', proveedorId)
        .eq('nro_remito', lectura.nroRemito)
        .limit(1)
      if (data?.[0]) duplicado = { recibidoAt: data[0].recibido_at }
    }

    console.log(
      JSON.stringify({
        ocr: 'ok',
        modelo: leido.modelo,
        ms: leido.ms,
        renglones: lectura.lineas.length,
        completa: leido.completa,
        desde: pase?.desde ?? 0,
        estado: lectura.validacion.estado,
        tokens: leido.uso,
      }),
    )
    return responder(
      { ok: true, lectura, duplicado, uso: { usadas: uso.usadas, tope: uso.tope }, continuar },
      200,
      origen,
    )
  } catch (error) {
    // Si la lectura no se hizo, no cuenta para el tope.
    if (reservada)
      await servicio.rpc('devolver_lectura', { p_org: reservada.org, p_mes: reservada.mes })
    if (error instanceof ErrorDeLectura)
      return responder({ ok: false, error: error.message }, 422, origen)
    if (error instanceof ErrorParaMostrar)
      return responder({ ok: false, error: error.message }, error.status, origen)
    const mensaje =
      error instanceof Anthropic.APIError || error instanceof Anthropic.APIConnectionError
        ? mensajeDeLaApi(error)
        : 'Algo falló al leer el remito. Probá de nuevo o cargalo a mano.'
    console.error('ocr', error)
    Sentry.captureException(error)
    await Sentry.flush(2000)
    return responder({ ok: false, error: mensaje }, 502, origen)
  }
}
