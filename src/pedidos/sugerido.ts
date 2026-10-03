// Pedido sugerido: "lo de siempre". Para cada producto que el bar le compra seguido a un
// proveedor, la cantidad típica de sus últimas compras. No adivina el consumo ni el stock: mira lo
// que se viene pidiendo, que es lo que el encargado haría de memoria.

export type CompraAnterior = {
  fecha: string
  items: { productoId: string; cantidad: number; presentacionId: string | null }[]
}

export type Sugerencia = {
  productoId: string
  cantidad: number
  presentacionId: string | null
  /** En cuántas de las últimas compras estuvo (para explicar de dónde sale). */
  veces: number
  /** Estuvo en al menos la mitad: entra en "usar sugerido". Si no, solo guía la cantidad. */
  habitual: boolean
}

export type Sugerido = {
  sugerencias: Sugerencia[]
  /** Cuántas compras se miraron. */
  compras: number
}

const ULTIMAS = 6

function mediana(valores: number[]): number {
  const orden = [...valores].sort((a, b) => a - b)
  const medio = Math.floor(orden.length / 2)
  return orden.length % 2 ? orden[medio]! : (orden[medio - 1]! + orden[medio]!) / 2
}

/** Para pedir se usan números redondos: 11,6 kg recibidos se piden como 12; 1,3 como 1,5. */
export function redondearParaPedir(cantidad: number): number {
  if (cantidad >= 3) return Math.round(cantidad)
  return Math.max(0.5, Math.round(cantidad * 2) / 2)
}

/**
 * Para cada producto comprado 2 veces o más en las últimas compras, la cantidad del medio de las
 * que se pidieron en su presentación más usada. Es "habitual" si estuvo en al menos la mitad.
 */
export function sugerirPedido(
  compras: readonly CompraAnterior[],
  opciones: { redondear?: boolean } = {},
): Sugerido {
  const ultimas = [...compras]
    .filter((c) => c.items.length > 0)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, ULTIMAS)
  if (ultimas.length < 2) return { sugerencias: [], compras: ultimas.length }
  const mitad = Math.max(2, Math.ceil(ultimas.length / 2))

  // Por producto, lo pedido en cada compra (de la más nueva a la más vieja).
  const porProducto = new Map<string, { cantidad: number; presentacionId: string | null }[]>()
  for (const compra of ultimas) {
    const vistos = new Set<string>()
    for (const i of compra.items) {
      if (i.cantidad <= 0 || vistos.has(i.productoId)) continue
      vistos.add(i.productoId)
      porProducto.set(i.productoId, [...(porProducto.get(i.productoId) ?? []), i])
    }
  }

  const sugerencias: Sugerencia[] = []
  for (const [productoId, pedidos] of porProducto) {
    if (pedidos.length < 2) continue
    // La presentación más usada; si empatan, la de la compra más reciente.
    const usos = new Map<string | null, number>()
    for (const p of pedidos) usos.set(p.presentacionId, (usos.get(p.presentacionId) ?? 0) + 1)
    const maximo = Math.max(...usos.values())
    const presentacionId = pedidos.find(
      (p) => usos.get(p.presentacionId) === maximo,
    )!.presentacionId
    const tipica = mediana(
      pedidos.filter((p) => p.presentacionId === presentacionId).map((p) => p.cantidad),
    )
    sugerencias.push({
      productoId,
      cantidad: opciones.redondear ? redondearParaPedir(tipica) : Math.round(tipica * 1000) / 1000,
      presentacionId,
      veces: pedidos.length,
      habitual: pedidos.length >= mitad,
    })
  }
  return { sugerencias, compras: ultimas.length }
}
