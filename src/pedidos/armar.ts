// De un pedido (ids) a lo que se muestra y se manda: nombres, cantidades, estimado y mensaje.

import type { Catalogo } from '../catalogo/tipos'
import { estimado, mensajeWhatsapp, textoCantidad, textoEstimado } from './logica'
import type { ItemPedido } from './tipos'

export type RenglonVista = {
  id: string
  producto: string
  cantidad: number
  cantidadTexto: string
  factor: number
  precioBase: number | null
}

export function renglones(
  items: readonly Pick<
    ItemPedido,
    'id' | 'producto_id' | 'presentacion_id' | 'cantidad' | 'precio_estimado_base'
  >[],
  catalogo: Catalogo,
): RenglonVista[] {
  return items.map((i) => {
    const producto = catalogo.productos.find((p) => p.id === i.producto_id)
    const unidad = catalogo.unidades.find((u) => u.id === producto?.unidad_base_id)
    const presentacion = i.presentacion_id
      ? catalogo.presentaciones.find((p) => p.id === i.presentacion_id)
      : null
    return {
      id: i.id,
      producto: producto?.nombre ?? 'Producto',
      cantidad: i.cantidad,
      cantidadTexto: unidad ? textoCantidad(i.cantidad, unidad, presentacion) : String(i.cantidad),
      factor: presentacion?.factor_a_base ?? 1,
      precioBase: i.precio_estimado_base,
    }
  })
}

export function resumenEstimado(lista: readonly RenglonVista[]): string {
  return textoEstimado(lista.length, estimado(lista))
}

export function mensajeDelPedido(
  lista: readonly RenglonVista[],
  datos: { organizacion: string; local: string | null; observaciones?: string | null },
): string {
  return mensajeWhatsapp({
    organizacion: datos.organizacion,
    local: datos.local,
    renglones: lista.map((r) => ({ producto: r.producto, cantidad: r.cantidadTexto })),
    observaciones: datos.observaciones ?? '',
  })
}
