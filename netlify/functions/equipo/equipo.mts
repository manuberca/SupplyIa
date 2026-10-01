// Altas de miembros (SPEC §2): solo administración suma gente a su bar, y solo desde acá, con la
// clave de servicio. Desde la app nadie puede insertar miembros (así nadie se suma solo a un bar
// ni suma a un usuario cualquiera). La persona entra con su mail y una contraseña provisoria que
// se devuelve una sola vez (no se mandan mails); administración puede generarle otra si la pierde.

import * as Sentry from '@sentry/node'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../src/lib/database.types'
import { generarClave } from '../../../src/equipo/clave'
import {
  MAXIMO_MIEMBROS,
  pedidoEquipoSchema,
  type RespuestaEquipo,
} from '../../../src/equipo/esquemas'
import { iniciarSentry, secreto } from '../../lib/entorno'
import { ErrorParaMostrar, json, origenPermitido } from '../../lib/http'

export const config = { path: '/api/equipo' }

iniciarSentry()

const responder = (cuerpo: RespuestaEquipo, status = 200, origen?: string | null) =>
  json(cuerpo, status, origen)

export default async function handler(req: Request): Promise<Response> {
  const origen = origenPermitido(req)
  if (origen === false) return responder({ ok: false, error: 'Acceso no permitido.' }, 403)
  if (req.method !== 'POST')
    return responder({ ok: false, error: 'Método no permitido.' }, 405, origen)

  const url = process.env.VITE_SUPABASE_URL
  const clavePublica = process.env.VITE_SUPABASE_ANON_KEY
  const claveServicio = secreto('SUPABASE_SERVICE_ROLE_KEY').valor
  if (!url || !clavePublica || !claveServicio) {
    Sentry.captureMessage('Falta configurar la función equipo')
    await Sentry.flush(2000)
    return responder(
      { ok: false, error: 'Las invitaciones no están configuradas. Avisale a soporte.' },
      500,
      origen,
    )
  }

  try {
    // ─── Quién invita: tiene que ser administración, y activa ───────────
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) throw new ErrorParaMostrar('Tu sesión venció. Entrá de nuevo.', 401)
    const db = createClient<Database>(url, clavePublica, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: usuario, error: errorUsuario } = await db.auth.getUser(token)
    if (errorUsuario || !usuario.user)
      throw new ErrorParaMostrar('Tu sesión venció. Entrá de nuevo.', 401)
    const { data: yo } = await db
      .from('miembros')
      .select('org_id, rol, activo')
      .eq('user_id', usuario.user.id)
      .maybeSingle()
    if (!yo || !yo.activo || yo.rol !== 'admin')
      throw new ErrorParaMostrar('Solo administración puede sumar gente al equipo.', 403)

    const cuerpo = pedidoEquipoSchema.safeParse(await req.json().catch(() => null))
    if (!cuerpo.success)
      throw new ErrorParaMostrar(cuerpo.error.issues[0]?.message ?? 'Revisá los datos.')
    const pedido = cuerpo.data

    const servicio = createClient<Database>(url, claveServicio, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    // La contraseña provisoria se le pone al usuario y se devuelve una sola vez. Queda marcada
    // como provisoria para que la app le recuerde cambiarla.
    const clave = generarClave()
    const conClave = { password: clave, user_metadata: { clave_provisoria: true } }

    // ─── Contraseña nueva para alguien del equipo que la perdió ─────────
    if (pedido.accion === 'nueva_clave') {
      if (pedido.userId === usuario.user.id)
        throw new ErrorParaMostrar('Tu contraseña la cambiás vos, en "Cambiar contraseña".')
      const { data: destino, error: errorDestino } = await servicio
        .from('miembros')
        .select('org_id, activo')
        .eq('user_id', pedido.userId)
        .maybeSingle()
      if (errorDestino) throw errorDestino
      if (!destino || destino.org_id !== yo.org_id || !destino.activo)
        throw new ErrorParaMostrar('Esa persona no está en tu equipo.', 404)
      const { error } = await servicio.auth.admin.updateUserById(pedido.userId, conClave)
      if (error) throw error
      return responder({ ok: true, clave, reactivado: false }, 200, origen)
    }

    const { email, nombre, rol, locales } = pedido

    // ─── Los locales elegidos tienen que ser de este bar y estar activos ───
    // (se controla antes de crear nada, para no dejar usuarios sueltos si el pedido está mal)
    if (locales) {
      const { data: validos, error } = await servicio
        .from('locales')
        .select('id')
        .eq('org_id', yo.org_id)
        .eq('activo', true)
        .in('id', locales)
      if (error) throw error
      if (validos.length !== new Set(locales).size)
        throw new ErrorParaMostrar('Alguno de los locales elegidos no es de tu bar.')
    }

    // ─── ¿Ya está en algún bar? (antes de tocar su usuario) ─────────────
    const buscado = await servicio.rpc('usuario_por_email', { p_email: email })
    if (buscado.error) throw buscado.error
    let userId: string | null = buscado.data
    const { data: actual, error: errorActual } = userId
      ? await servicio.from('miembros').select('org_id, activo').eq('user_id', userId).maybeSingle()
      : { data: null, error: null }
    if (errorActual) throw errorActual
    if (actual && actual.org_id !== yo.org_id)
      throw new ErrorParaMostrar(
        'Ese mail ya se usa en otra cuenta de SupplyIA. Pedile a la persona otro mail.',
        409,
      )
    if (actual?.activo) throw new ErrorParaMostrar('Esa persona ya está en tu equipo.', 409)

    if (!actual) {
      const { count } = await servicio
        .from('miembros')
        .select('user_id', { count: 'exact', head: true })
        .eq('org_id', yo.org_id)
      if ((count ?? 0) >= MAXIMO_MIEMBROS)
        throw new ErrorParaMostrar(`El equipo llegó al máximo de ${MAXIMO_MIEMBROS} personas.`)
    }

    // ─── El usuario, con su contraseña provisoria ───────────────────────
    if (userId) {
      const { error } = await servicio.auth.admin.updateUserById(userId, conClave)
      if (error) throw error
    } else {
      const creado = await servicio.auth.admin.createUser({
        email,
        email_confirm: true,
        ...conClave,
      })
      if (creado.error || !creado.data.user) throw creado.error ?? new Error('Sin usuario')
      userId = creado.data.user.id
    }

    if (actual) {
      // Había sido dada de baja: vuelve con el rol y los locales que se eligieron ahora.
      const { error } = await servicio
        .from('miembros')
        .update({ activo: true, rol, locales, nombre, email })
        .eq('user_id', userId)
      if (error) throw error
      return responder({ ok: true, clave, reactivado: true }, 200, origen)
    }

    const { error } = await servicio
      .from('miembros')
      .insert({ user_id: userId, org_id: yo.org_id, rol, locales, nombre, email })
    if (error) throw error
    return responder({ ok: true, clave, reactivado: false }, 200, origen)
  } catch (error) {
    if (error instanceof ErrorParaMostrar)
      return responder({ ok: false, error: error.message }, error.status, origen)
    console.error('Falló /api/equipo', error)
    Sentry.captureException(error)
    await Sentry.flush(2000)
    return responder(
      { ok: false, error: 'No pudimos sumar a la persona. Probá de nuevo en un rato.' },
      500,
      origen,
    )
  }
}
