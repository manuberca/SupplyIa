import { createContext, useContext } from 'react'
import type { Operacion, PedidoParaGuardar, RecepcionParaGuardar } from './cola'

export type ValorCola = {
  pendientes: Operacion[]
  enLinea: boolean
  subiendo: boolean
  /** Guarda en el celular y trata de subir enseguida. false si el celular no dejó guardar. */
  agregarPedido: (pedido: PedidoParaGuardar) => Promise<boolean>
  agregarRecepcion: (recepcion: RecepcionParaGuardar) => Promise<boolean>
  reintentar: (id: string) => void
  descartar: (id: string) => Promise<void>
  /** Cambia cada vez que se sube algo, para que las pantallas recarguen. */
  version: number
}

export const ContextoCola = createContext<ValorCola | null>(null)

export function useCola(): ValorCola {
  const valor = useContext(ContextoCola)
  if (!valor) throw new Error('useCola se usa dentro de <ColaProvider>')
  return valor
}
