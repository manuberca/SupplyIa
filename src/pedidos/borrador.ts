// Lo que se va cargando en un pedido queda en el celular hasta enviarlo, así no se pierde
// si se cierra la app o se cambia de pantalla.

import type { Catalogo } from '../catalogo/tipos'
import { numero } from '../lib/formato'
import type { ItemPedido } from './tipos'

export type Borrador = {
  cantidades: Record<string, { texto: string; presentacionId: string | null }>
  observaciones: string
}

const clave = (usuarioId: string, proveedorId: string) =>
  `supplyia.borrador:${usuarioId}:${proveedorId}`

export function leerBorrador(usuarioId: string, proveedorId: string): Borrador | null {
  try {
    const texto = localStorage.getItem(clave(usuarioId, proveedorId))
    return texto ? (JSON.parse(texto) as Borrador) : null
  } catch {
    return null
  }
}

export function guardarBorrador(usuarioId: string, proveedorId: string, b: Borrador) {
  try {
    const vacio =
      !b.observaciones.trim() && Object.values(b.cantidades).every((c) => !c.texto.trim())
    if (vacio) localStorage.removeItem(clave(usuarioId, proveedorId))
    else localStorage.setItem(clave(usuarioId, proveedorId), JSON.stringify(b))
  } catch {
    // Sin almacenamiento el borrador vive solo mientras la pantalla está abierta.
  }
}

export function borrarBorrador(usuarioId: string, proveedorId: string) {
  try {
    localStorage.removeItem(clave(usuarioId, proveedorId))
  } catch {
    // nada que hacer
  }
}

/**
 * Repetir un pedido: las mismas cantidades, para revisarlas y mandarlo de nuevo. Lo que ya no se
 * puede pedir igual (producto archivado, o una presentación que ya no existe) queda afuera y se avisa.
 */
export function borradorDesdePedido(
  items: readonly Pick<ItemPedido, 'producto_id' | 'presentacion_id' | 'cantidad'>[],
  catalogo: Catalogo,
): { borrador: Borrador; omitidos: string[] } {
  const cantidades: Borrador['cantidades'] = {}
  const omitidos: string[] = []
  for (const i of items) {
    const producto = catalogo.productos.find((p) => p.id === i.producto_id)
    const presentacionOk =
      i.presentacion_id === null || catalogo.presentaciones.some((p) => p.id === i.presentacion_id)
    if (!producto?.activo || !presentacionOk || i.cantidad <= 0) {
      omitidos.push(producto?.nombre ?? 'Un producto que ya no está')
      continue
    }
    cantidades[i.producto_id] = { texto: numero(i.cantidad, 3), presentacionId: i.presentacion_id }
  }
  return { borrador: { cantidades, observaciones: '' }, omitidos }
}
