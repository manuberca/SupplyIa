import { z } from 'zod'

export const rolSchema = z.enum(['admin', 'encargado', 'recepcion'])
export type Rol = z.infer<typeof rolSchema>

export type Seccion =
  'inicio' | 'pedir' | 'recibir' | 'proveedores' | 'precios' | 'cuenta' | 'ajustes_org'

// SPEC.md §2. Recepción solo recibe mercadería y ve pedidos en curso (en Inicio).
const PERMISOS: Record<Seccion, readonly Rol[]> = {
  inicio: ['admin', 'encargado', 'recepcion'],
  recibir: ['admin', 'encargado', 'recepcion'],
  cuenta: ['admin', 'encargado', 'recepcion'],
  pedir: ['admin', 'encargado'],
  proveedores: ['admin', 'encargado'],
  precios: ['admin', 'encargado'],
  ajustes_org: ['admin'],
}

export function puede(rol: Rol, seccion: Seccion): boolean {
  return PERMISOS[seccion].includes(rol)
}

export const NOMBRE_ROL: Record<Rol, string> = {
  admin: 'Administración',
  encargado: 'Encargado',
  recepcion: 'Recepción',
}
