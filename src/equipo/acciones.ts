// Equipo y locales del bar (Ajustes, solo administración). Las altas de personas pasan por la
// función del servidor; el resto son cambios sobre lo que ya está, con las reglas en la base
// (siempre queda una persona de administración y un local activo; nada se borra).

import { reportar } from '../lib/errores'
import { SIN_CONEXION } from '../lib/errores-auth'
import {
  ERROR_DB_DESCONOCIDO,
  esReintentoDeAlta,
  mensajeErrorDb,
  type ErrorDb,
} from '../lib/errores-db'
import { rolSchema, type Rol } from '../lib/permisos'
import { supabase } from '../lib/supabase'
import { respuestaEquipoSchema, type Invitacion, type RespuestaEquipo } from './esquemas'

export type Resultado = { ok: true } | { ok: false; mensaje: string }

export type Miembro = {
  user_id: string
  nombre: string
  email: string | null
  rol: Rol
  /** null = todos los locales. */
  locales: string[] | null
  activo: boolean
}

export type LocalDelBar = { id: string; nombre: string; activo: boolean }

async function escribir(
  contexto: string,
  paso: () => PromiseLike<{ error: ErrorDb }>,
): Promise<Resultado> {
  if (!navigator.onLine) return { ok: false, mensaje: SIN_CONEXION }
  const { error } = await paso()
  if (!error || esReintentoDeAlta(error)) return { ok: true }
  const mensaje = mensajeErrorDb(error)
  if (mensaje === ERROR_DB_DESCONOCIDO) reportar(error, contexto)
  return { ok: false, mensaje }
}

function errorDeCarga(error: { message: string }, contexto: string): { error: string } {
  const sinRed = !navigator.onLine || /fetch/i.test(error.message)
  if (!sinRed) reportar(error, contexto)
  return { error: sinRed ? SIN_CONEXION : 'No pudimos cargar los datos. Probá de nuevo.' }
}

// ─── Equipo ────────────────────────────────────────────────────────────────

export async function cargarEquipo(): Promise<Miembro[] | { error: string }> {
  const { data, error } = await supabase
    .from('miembros')
    .select('user_id, nombre, email, rol, locales, activo')
    .order('nombre')
  if (error) return errorDeCarga(error, 'Cargar el equipo')
  return data.flatMap((m) => {
    const rol = rolSchema.safeParse(m.rol)
    return rol.success ? [{ ...m, rol: rol.data }] : []
  })
}

async function pedirAlServidor(
  pedido: ({ accion: 'invitar' } & Invitacion) | { accion: 'nueva_clave'; userId: string },
  contexto: string,
  falla: string,
): Promise<RespuestaEquipo> {
  if (!navigator.onLine) return { ok: false, error: SIN_CONEXION }
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, error: 'Tu sesión venció. Entrá de nuevo.' }
  try {
    const respuesta = await fetch('/api/equipo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(pedido),
    })
    const cuerpo: unknown = await respuesta.json().catch(() => null)
    const r = respuestaEquipoSchema.safeParse(cuerpo)
    if (r.success) return r.data
    reportar(new Error(`Respuesta inesperada de /api/equipo (${respuesta.status})`), contexto)
    return { ok: false, error: falla }
  } catch (error) {
    if (!navigator.onLine) return { ok: false, error: SIN_CONEXION }
    reportar(error, contexto)
    return { ok: false, error: falla }
  }
}

/** Suma a una persona al bar (o la vuelve a sumar si había sido dada de baja). */
export function invitar(invitacion: Invitacion) {
  return pedirAlServidor(
    { accion: 'invitar', ...invitacion },
    'Invitar',
    'No pudimos sumar a la persona. Probá de nuevo en un rato.',
  )
}

/** Le genera una contraseña provisoria nueva a alguien del equipo que perdió la suya. */
export function nuevaClave(userId: string) {
  return pedirAlServidor(
    { accion: 'nueva_clave', userId },
    'Nueva contraseña',
    'No pudimos generar la contraseña. Probá de nuevo en un rato.',
  )
}

/** Cambia la contraseña propia (y deja de ser provisoria). */
export async function cambiarMiClave(clave: string): Promise<Resultado> {
  if (!navigator.onLine) return { ok: false, mensaje: SIN_CONEXION }
  const { error } = await supabase.auth.updateUser({
    password: clave,
    data: { clave_provisoria: false },
  })
  if (!error) return { ok: true }
  if (error.code === 'same_password')
    return { ok: false, mensaje: 'Esa es la contraseña que ya tenías. Elegí otra.' }
  if (error.code === 'weak_password')
    return {
      ok: false,
      mensaje: 'Esa contraseña es muy fácil de adivinar. Probá con otra más larga.',
    }
  reportar(error, 'Cambiar contraseña')
  return { ok: false, mensaje: 'No pudimos cambiar la contraseña. Probá de nuevo.' }
}

export function editarMiembro(
  userId: string,
  cambios: { nombre: string; rol: Rol; locales: string[] | null },
) {
  return escribir('Editar miembro', () =>
    supabase.from('miembros').update(cambios).eq('user_id', userId),
  )
}

/** Dar de baja no borra a la persona: pierde el acceso y se la puede reactivar. */
export function cambiarAcceso(userId: string, activo: boolean) {
  return escribir(activo ? 'Reactivar miembro' : 'Dar de baja miembro', () =>
    supabase.from('miembros').update({ activo }).eq('user_id', userId),
  )
}

// ─── Locales ───────────────────────────────────────────────────────────────

/** Todos los del bar, también los archivados (administración los ve todos). */
export async function cargarLocales(): Promise<LocalDelBar[] | { error: string }> {
  const { data, error } = await supabase
    .from('locales')
    .select('id, nombre, activo')
    .order('nombre')
  if (error) return errorDeCarga(error, 'Cargar los locales')
  return data
}

export function crearLocal(orgId: string, local: { id: string; nombre: string }) {
  return escribir('Crear local', () => supabase.from('locales').insert({ ...local, org_id: orgId }))
}

export function renombrarLocal(id: string, nombre: string) {
  return escribir('Renombrar local', () => supabase.from('locales').update({ nombre }).eq('id', id))
}

export function archivarLocal(id: string, archivar: boolean) {
  return escribir(archivar ? 'Archivar local' : 'Reactivar local', () =>
    supabase.from('locales').update({ activo: !archivar }).eq('id', id),
  )
}
