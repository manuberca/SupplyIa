// Altas de miembros (SPEC §2): solo administración suma gente a su bar, y solo desde acá, con la
// clave de servicio. Desde la app nadie puede insertar miembros (así nadie se suma solo a un bar
// ni suma a un usuario cualquiera). La persona invitada entra después con su mail.

import * as Sentry from '@sentry/node'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../src/lib/database.types'
import {
  invitacionSchema,
  MAXIMO_MIEMBROS,
  type RespuestaEquipo,
} from '../../../src/equipo/esquemas'
import { ErrorParaMostrar, json, origenPermitido } from '../../lib/http'

export const config = { path: '/api/equipo' }

if (process.env.VITE_SENTRY_DSN) {
  Sentry.init({ dsn: process.env.VITE_SENTRY_DSN, environment: process.env.CONTEXT ?? 'local' })
}

const responder = (cuerpo: RespuestaEquipo, status = 200, origen?: string | null) =>
  json(cuerpo, status, origen)

export default async function handler(req: Request): Promise<Response> {
  const origen = origenPermitido(req)
  if (origen === false) return responder({ ok: false, error: 'Acceso no permitido.' }, 403)
  if (req.method !== 'POST')
    return responder({ ok: false, error: 'Método no permitido.' }, 405, origen)

  const url = process.env.VITE_SUPABASE_URL
  const clavePublica = process.env.VITE_SUPABASE_ANON_KEY
  const claveServicio = process.env.SUPABASE_SERVICE_ROLE_KEY
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

    const cuerpo = invitacionSchema.safeParse(await req.json().catch(() => null))
    if (!cuerpo.success)
      throw new ErrorParaMostrar(cuerpo.error.issues[0]?.message ?? 'Revisá los datos.')
    const { email, nombre, rol, locales } = cuerpo.data

    const servicio = createClient<Database>(url, claveServicio, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

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

    // ─── ¿Ya tiene usuario? Si no, se crea (sin contraseña: entra con el código del mail) ───
    const buscado = await servicio.rpc('usuario_por_email', { p_email: email })
    if (buscado.error) throw buscado.error
    let userId: string | null = buscado.data
    if (!userId) {
      const creado = await servicio.auth.admin.createUser({ email, email_confirm: true })
      if (creado.error || !creado.data.user) throw creado.error ?? new Error('Sin usuario')
      userId = creado.data.user.id
    }

    // ─── ¿Ya está en algún bar? ─────────────────────────────────────────
    const { data: actual, error: errorActual } = await servicio
      .from('miembros')
      .select('org_id, activo')
      .eq('user_id', userId)
      .maybeSingle()
    if (errorActual) throw errorActual
    if (actual && actual.org_id !== yo.org_id)
      throw new ErrorParaMostrar(
        'Ese mail ya se usa en otra cuenta de SupplyIA. Pedile a la persona otro mail.',
        409,
      )
    if (actual?.activo) throw new ErrorParaMostrar('Esa persona ya está en tu equipo.', 409)

    if (actual) {
      // Había sido dada de baja: vuelve con el rol y los locales que se eligieron ahora.
      const { error } = await servicio
        .from('miembros')
        .update({ activo: true, rol, locales, nombre, email })
        .eq('user_id', userId)
      if (error) throw error
      return responder({ ok: true, reactivado: true }, 200, origen)
    }

    const { count } = await servicio
      .from('miembros')
      .select('user_id', { count: 'exact', head: true })
      .eq('org_id', yo.org_id)
    if ((count ?? 0) >= MAXIMO_MIEMBROS)
      throw new ErrorParaMostrar(`El equipo llegó al máximo de ${MAXIMO_MIEMBROS} personas.`)

    const { error } = await servicio
      .from('miembros')
      .insert({ user_id: userId, org_id: yo.org_id, rol, locales, nombre, email })
    if (error) throw error
    return responder({ ok: true, reactivado: false }, 200, origen)
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
