import { useOutletContext } from 'react-router'
import type { DatosPanel } from '../../admin/cargar'
import type { Catalogo } from '../../catalogo/tipos'

export type ContextoPanel = {
  catalogo: Catalogo
  datos: DatosPanel
  periodo: { mes: string; nombre: string; desde: Date; hasta: Date }
  locales: Map<string, string>
  proveedor: (id: string) => string
  /** Vuelve a traer los datos (después de marcar pagado o cambiar una diferencia). */
  recargar: () => Promise<void>
}

export function usePanel(): ContextoPanel {
  return useOutletContext<ContextoPanel>()
}
