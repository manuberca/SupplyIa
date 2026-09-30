import { createContext, useContext } from 'react'
import type { EstadoPedido, Pedido } from './tipos'

export type ValorPedidos = {
  estado: 'cargando' | 'listo' | 'error'
  /** Del local elegido, del más nuevo al más viejo. Incluye los pendientes de subir. */
  pedidos: Pedido[]
  mensajeError: string
  recargar: () => Promise<void>
  cambiarEstado: (
    id: string,
    estado: EstadoPedido,
  ) => Promise<{ ok: true } | { ok: false; mensaje: string }>
}

export const ContextoPedidos = createContext<ValorPedidos | null>(null)

export function usePedidos(): ValorPedidos {
  const valor = useContext(ContextoPedidos)
  if (!valor) throw new Error('usePedidos se usa dentro de <PedidosProvider>')
  return valor
}
