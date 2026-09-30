export type EstadoPedido =
  | 'borrador'
  | 'enviado'
  | 'recibido_parcial'
  | 'revisar'
  | 'a_pagar'
  | 'pagado'
  | 'no_llego'
  | 'cancelado'

export type ItemPedido = {
  id: string
  producto_id: string
  presentacion_id: string | null
  cantidad: number
  precio_estimado_base: number | null
}

/** Un pedido como lo muestra la app: los de la base y los que esperan en la cola del celular. */
export type Pedido = {
  id: string
  numero: number | null
  estado: EstadoPedido
  local_id: string
  proveedor_id: string
  observaciones: string | null
  creado_at: string
  items: ItemPedido[]
  /** null si ya está en la base. */
  subida: null | { error: string | null }
}

export const ESTADOS: Record<EstadoPedido, { texto: string; clase: string }> = {
  borrador: { texto: 'Borrador', clase: 'pastilla--gris' },
  enviado: { texto: 'En camino', clase: 'pastilla--info' },
  recibido_parcial: { texto: 'Llegó en parte', clase: 'pastilla--atencion' },
  revisar: { texto: 'Revisar', clase: 'pastilla--atencion' },
  a_pagar: { texto: 'A pagar', clase: 'pastilla--ok' },
  pagado: { texto: 'Pagado', clase: 'pastilla--gris' },
  no_llego: { texto: 'No llegó', clase: 'pastilla--error' },
  cancelado: { texto: 'Cancelado', clase: 'pastilla--gris' },
}

/** Los que todavía esperan algo: se muestran en "Pedidos en curso". */
export const EN_CURSO: readonly EstadoPedido[] = [
  'enviado',
  'recibido_parcial',
  'revisar',
  'a_pagar',
  'no_llego',
]

export function numeroPedido(numero: number | null): string {
  return numero === null ? 'Sin número' : `#${String(numero).padStart(4, '0')}`
}
