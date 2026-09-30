import { createContext, useContext } from 'react'
import type { Catalogo } from './tipos'

export type EstadoCatalogo =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; catalogo: Catalogo }

export type ValorCatalogo = { catalogo: EstadoCatalogo; recargar: () => Promise<void> }

export const ContextoCatalogo = createContext<ValorCatalogo | null>(null)

export function useCatalogo(): ValorCatalogo {
  const valor = useContext(ContextoCatalogo)
  if (!valor) throw new Error('useCatalogo se usa dentro de <CatalogoProvider>')
  return valor
}
