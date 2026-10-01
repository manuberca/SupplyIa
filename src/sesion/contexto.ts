import { createContext, useContext } from 'react'
import type { Rol } from '../lib/permisos'

export type Local = { id: string; nombre: string }

export type SesionLista = {
  estado: 'lista'
  usuario: { id: string; email: string }
  miembro: { nombre: string; rol: Rol }
  org: { id: string; nombre: string }
  locales: Local[]
  local: Local | null
}

export type Sesion =
  | { estado: 'cargando' }
  | { estado: 'sin_sesion' }
  | { estado: 'sin_membresia'; email: string }
  | { estado: 'error'; mensaje: string }
  | SesionLista

export type ValorSesion = {
  sesion: Sesion
  salir: () => Promise<void>
  elegirLocal: (id: string) => void
  reintentar: () => void
  /** La persona todavía usa la contraseña que le generó administración. */
  claveProvisoria: boolean
  /** Vuelve a traer el bar y los locales sin sacar la pantalla (después de cambiar locales). */
  refrescar: () => Promise<void>
}

export const ContextoSesion = createContext<ValorSesion | null>(null)

export function useSesion(): ValorSesion {
  const valor = useContext(ContextoSesion)
  if (!valor) throw new Error('useSesion se usa dentro de <SesionProvider>')
  return valor
}

/** Para pantallas que solo se muestran con la sesión lista. */
export function useSesionLista(): SesionLista {
  const { sesion } = useSesion()
  if (sesion.estado !== 'lista') throw new Error('Esta pantalla necesita una sesión iniciada')
  return sesion
}
