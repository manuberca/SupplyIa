export type TipoUnidad = 'peso' | 'volumen' | 'unidad'

export type Unidad = { id: string; nombre: string; tipo: TipoUnidad; archivada: boolean }

export type Proveedor = {
  id: string
  nombre: string
  whatsapp: string
  dias_entrega: number[]
  hora_limite: string | null
  umbral_alerta_pct: number | null
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
  umbral_alerta_pct: number | null
  activo: boolean
}

export type UltimoPrecio = { producto_id: string; precio_base: number; fecha: string }

export type Ajustes = {
  umbral_alerta_pct: number
  tolerancia_peso_pct: number
  tolerancia_unidad_pct: number
}

export const AJUSTES_POR_DEFECTO: Ajustes = {
  umbral_alerta_pct: 10,
  tolerancia_peso_pct: 10,
  tolerancia_unidad_pct: 0,
}

export type Catalogo = {
  ajustes: Ajustes
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
