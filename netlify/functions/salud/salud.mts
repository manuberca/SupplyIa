// Chequeo de salud de las funciones: dice si cada servicio responde con la clave cargada, sin
// mostrar ninguna clave. Lo usa `npm run prod:probar` después de cada deploy. Pide una sesión
// (cualquier miembro activo) para que no lo pueda consultar cualquiera, y no gasta lecturas:
// a Anthropic solo le pide la lista de modelos, que es gratis.

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../src/lib/database.types'
import { secreto } from '../../lib/entorno'
import { json, origenPermitido } from '../../lib/http'

export const config = { path: '/api/salud' }

type Estado = 'ok' | 'falta' | 'falla'
export type RespuestaSalud =
  | {
      ok: true
      supabase: Estado
      anthropic: Estado
      /** Alguna clave estaba mal pegada y se limpió sola: conviene volver a pegarla bien. */
      clavesCorregidas: string[]
      version: string
    }
  | { ok: false; error: string }

export default async function handler(req: Request): Promise<Response> {
  const origen = origenPermitido(req)
  if (origen === false) return json({ ok: false, error: 'Acceso no permitido.' }, 403)
  const url = process.env.VITE_SUPABASE_URL
  const clavePublica = process.env.VITE_SUPABASE_ANON_KEY
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!url || !clavePublica || !token)
    return json(
      { ok: false, error: 'Hace falta una sesión.' } satisfies RespuestaSalud,
      401,
      origen,
    )

  const db = createClient<Database>(url, clavePublica, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: usuario } = await db.auth.getUser(token)
  const { data: miembro } = usuario.user
    ? await db.from('miembros').select('activo').eq('user_id', usuario.user.id).maybeSingle()
    : { data: null }
  if (!miembro?.activo)
    return json(
      { ok: false, error: 'Hace falta una sesión.' } satisfies RespuestaSalud,
      401,
      origen,
    )

  const servicio = secreto('SUPABASE_SERVICE_ROLE_KEY')
  const anthropic = secreto('ANTHROPIC_API_KEY')

  // Supabase con la clave de servicio: una consulta que solo ese rol puede hacer.
  let supabase: Estado = servicio.valor ? 'falla' : 'falta'
  if (servicio.valor) {
    try {
      const cliente = createClient<Database>(url, servicio.valor, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { error } = await cliente.rpc('usuario_por_email', { p_email: 'nadie@supplyia.test' })
      if (!error) supabase = 'ok'
    } catch {
      // Queda en "falla".
    }
  }

  let estadoAnthropic: Estado = anthropic.valor ? 'falla' : 'falta'
  if (anthropic.valor) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/models?limit=1', {
        headers: { 'x-api-key': anthropic.valor, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(8000),
      })
      if (r.ok) estadoAnthropic = 'ok'
    } catch {
      // Queda en "falla".
    }
  }

  const cuerpo: RespuestaSalud = {
    ok: true,
    supabase,
    anthropic: estadoAnthropic,
    clavesCorregidas: [
      ...(servicio.corregido ? ['SUPABASE_SERVICE_ROLE_KEY'] : []),
      ...(anthropic.corregido ? ['ANTHROPIC_API_KEY'] : []),
    ],
    version: (process.env.COMMIT_REF ?? 'local').slice(0, 7),
  }
  return json(cuerpo, 200, origen)
}
