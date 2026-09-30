import { createContext, useContext } from 'react'
import type { Alerta, MetricasProveedor, PrecioHistorico, VariacionProducto } from './metricas'

export type DatosControl = {
  precios: PrecioHistorico[]
  variaciones: Map<string, VariacionProducto>
  gasto: Map<string, number>
  metricas: Map<string, MetricasProveedor>
  aumentoDe: (proveedorId: string) => number | null
  alertas: Alerta[]
}

export type ValorControl =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; datos: DatosControl }

export const ContextoControl = createContext<ValorControl | null>(null)

export function useControl(): ValorControl {
  const valor = useContext(ContextoControl)
  if (!valor) throw new Error('useControl se usa dentro de <ControlProvider>')
  return valor
}
