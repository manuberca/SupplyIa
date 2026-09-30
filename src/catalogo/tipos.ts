export type TipoUnidad = 'peso' | 'volumen' | 'unidad'

export type Unidad = { id: string; nombre: string; tipo: TipoUnidad; archivada: boolean }

export type Proveedor = {
  id: string
  nombre: string
  whatsapp: string
  dias_entrega: number[]
  hora_limite: string | null
  activo: boolean
}

export type PresentacionGuardada = {
  id: string
  producto_id: string
  nombre: string
  factor_a_base: number
  aproximada: boolean
}

export type Producto = {
  id: string
  proveedor_id: string
  nombre: string
  unidad_base_id: string
  activo: boolean
}

export type UltimoPrecio = { producto_id: string; precio_base: number; fecha: string }

export type Catalogo = {
  unidades: Unidad[]
  proveedores: Proveedor[]
  productos: Producto[]
  presentaciones: PresentacionGuardada[]
  precios: Map<string, UltimoPrecio>
}

export const NOMBRE_TIPO: Record<TipoUnidad, string> = {
  peso: 'Se pesa (kg, g)',
  volumen: 'Se mide en litros',
  unidad: 'Se cuenta (unidad, caja, atado)',
}
