// Métricas de control (SPEC §6): cuánto subió cada producto y cada proveedor, cumplimiento,
// demora y alertas de aumento. Funciones puras: se calculan en la app con el historial del bar.

const DIA = 24 * 60 * 60 * 1000

export type PrecioHistorico = {
  producto_id: string
  proveedor_id: string
  precio_base: number
  fecha: string
}

/** Un renglón recibido, con lo necesario para gasto, cumplimiento y demora. */
export type RenglonRecibido = {
  proveedor_id: string
  producto_id: string | null
  recepcion_id: string
  recibido_at: string
  /** Si la recepción era de un pedido: cuándo se mandó ese pedido. */
  pedido_id: string | null
  enviado_at: string | null
  cantidad_pedida_base: number | null
  cantidad_base: number | null
  precio_unit_base: number | null
  resultado: string
}

export type VariacionProducto = {
  producto_id: string
  proveedor_id: string
  ultimo: number
  fechaUltimo: string
  /** El precio de referencia: el vigente hace `dias` días (o el primero dentro de la ventana). */
  anterior: number | null
  variacionPct: number | null
  /** Todos los precios del producto, del más viejo al más nuevo (para el gráfico). */
  serie: { fecha: string; precio: number }[]
  /** El precio se multiplicó por más de 4 o cayó a menos de un cuarto: casi seguro cambió la unidad. */
  saltoRaro: boolean
}

/** Un cambio de precio así no es un aumento: es un precio cargado en otra unidad (caja en vez de kg). */
export const esSaltoRaro = (antes: number, despues: number) =>
  antes > 0 && (despues / antes > 4 || despues / antes < 0.25)

const redondear1 = (n: number) => Math.round(n * 10) / 10

/**
 * Variación de cada producto en los últimos `dias`: último precio contra el que regía al
 * empezar la ventana. Si el producto no tenía precio antes, contra el primero de la ventana.
 */
export function variaciones(
  precios: PrecioHistorico[],
  ahora: Date,
  dias = 30,
): Map<string, VariacionProducto> {
  const desde = ahora.getTime() - dias * DIA
  const porProducto = new Map<string, PrecioHistorico[]>()
  for (const p of precios)
    porProducto.set(p.producto_id, [...(porProducto.get(p.producto_id) ?? []), p])

  const resultado = new Map<string, VariacionProducto>()
  for (const [id, lista] of porProducto) {
    const orden = [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha))
    const ultimo = orden.at(-1)!
    const antesDeLaVentana = orden.filter((p) => Date.parse(p.fecha) <= desde).at(-1)
    const enLaVentana = orden.filter((p) => Date.parse(p.fecha) > desde)
    const referencia = antesDeLaVentana ?? (enLaVentana.length > 1 ? enLaVentana[0] : undefined)
    const anterior = referencia && referencia !== ultimo ? referencia.precio_base : null
    resultado.set(id, {
      producto_id: id,
      proveedor_id: ultimo.proveedor_id,
      ultimo: ultimo.precio_base,
      fechaUltimo: ultimo.fecha,
      anterior,
      variacionPct:
        anterior && anterior > 0
          ? redondear1(((ultimo.precio_base - anterior) / anterior) * 100)
          : null,
      serie: orden.map((p) => ({ fecha: p.fecha, precio: p.precio_base })),
      saltoRaro: anterior !== null && esSaltoRaro(anterior, ultimo.precio_base),
    })
  }
  return resultado
}

/** Lo gastado por producto en los últimos `dias` (cantidad recibida × precio). */
export function gastoPorProducto(
  renglones: RenglonRecibido[],
  ahora: Date,
  dias = 30,
): Map<string, number> {
  const desde = ahora.getTime() - dias * DIA
  const gasto = new Map<string, number>()
  for (const r of renglones) {
    if (!r.producto_id || Date.parse(r.recibido_at) <= desde) continue
    const plata = (r.cantidad_base ?? 0) * (r.precio_unit_base ?? 0)
    if (plata > 0) gasto.set(r.producto_id, (gasto.get(r.producto_id) ?? 0) + plata)
  }
  return gasto
}

/**
 * Aumento del proveedor (SPEC §6): promedio de las variaciones de sus productos ponderado por
 * lo gastado en cada uno. Sin gasto registrado (solo precios importados), promedio simple.
 */
export function aumentoProveedor(
  proveedorId: string,
  vars: Map<string, VariacionProducto>,
  gasto: Map<string, number>,
): number | null {
  const suyos = [...vars.values()].filter(
    (v) => v.proveedor_id === proveedorId && v.variacionPct !== null && !v.saltoRaro,
  )
  if (suyos.length === 0) return null
  const pesos = suyos.map((v) => gasto.get(v.producto_id) ?? 0)
  const total = pesos.reduce((s, x) => s + x, 0)
  if (total > 0)
    return redondear1(suyos.reduce((s, v, i) => s + v.variacionPct! * pesos[i]!, 0) / total)
  return redondear1(suyos.reduce((s, v) => s + v.variacionPct!, 0) / suyos.length)
}

export type MetricasProveedor = {
  pedidos: number
  /** % de renglones pedidos que llegaron completos (dentro de la tolerancia). null: sin recepciones de pedidos. */
  cumplimiento: number | null
  /** Días promedio entre que se mandó el pedido y que llegó. */
  demora: number | null
}

/** Cumplimiento y demora de cada proveedor en los últimos `dias` (SPEC §6). */
export function metricasProveedores(
  renglones: RenglonRecibido[],
  ahora: Date,
  dias = 30,
): Map<string, MetricasProveedor> {
  const desde = ahora.getTime() - dias * DIA
  const acc = new Map<
    string,
    {
      pedidos: Set<string>
      pedidosRenglones: number
      completos: number
      demoras: Map<string, number>
    }
  >()
  for (const r of renglones) {
    if (Date.parse(r.recibido_at) <= desde) continue
    const a = acc.get(r.proveedor_id) ?? {
      pedidos: new Set(),
      pedidosRenglones: 0,
      completos: 0,
      demoras: new Map(),
    }
    if (r.pedido_id) {
      a.pedidos.add(r.pedido_id)
      if (r.cantidad_pedida_base !== null) {
        a.pedidosRenglones++
        if (r.resultado !== 'faltante') a.completos++
      }
      if (r.enviado_at) {
        a.demoras.set(r.recepcion_id, (Date.parse(r.recibido_at) - Date.parse(r.enviado_at)) / DIA)
      }
    }
    acc.set(r.proveedor_id, a)
  }
  const resultado = new Map<string, MetricasProveedor>()
  for (const [id, a] of acc) {
    const demoras = [...a.demoras.values()].filter((d) => d >= 0)
    resultado.set(id, {
      pedidos: a.pedidos.size,
      cumplimiento: a.pedidosRenglones
        ? Math.round((a.completos / a.pedidosRenglones) * 100)
        : null,
      demora: demoras.length
        ? redondear1(demoras.reduce((s, d) => s + d, 0) / demoras.length)
        : null,
    })
  }
  return resultado
}

export type Alerta = {
  producto_id: string
  proveedor_id: string
  variacionPct: number
  precio: number
  antes: number
  fecha: string
}

/**
 * Productos que subieron más que su umbral en su última compra de los últimos `dias`
 * (contra el precio anterior). Umbral: el del producto, si no el del proveedor, si no el general.
 */
export function alertasDeAumento(
  precios: PrecioHistorico[],
  umbral: {
    general: number
    proveedor: (id: string) => number | null
    producto: (id: string) => number | null
  },
  ahora: Date,
  dias = 7,
): Alerta[] {
  const desde = ahora.getTime() - dias * DIA
  const porProducto = new Map<string, PrecioHistorico[]>()
  for (const p of precios)
    porProducto.set(p.producto_id, [...(porProducto.get(p.producto_id) ?? []), p])
  const alertas: Alerta[] = []
  for (const [id, lista] of porProducto) {
    const orden = [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha))
    const ultimo = orden.at(-1)!
    const antes = orden.at(-2)
    if (!antes || antes.precio_base <= 0 || Date.parse(ultimo.fecha) <= desde) continue
    if (esSaltoRaro(antes.precio_base, ultimo.precio_base)) continue
    const variacion = redondear1(
      ((ultimo.precio_base - antes.precio_base) / antes.precio_base) * 100,
    )
    const limite = umbral.producto(id) ?? umbral.proveedor(ultimo.proveedor_id) ?? umbral.general
    if (variacion > limite) {
      alertas.push({
        producto_id: id,
        proveedor_id: ultimo.proveedor_id,
        variacionPct: variacion,
        precio: ultimo.precio_base,
        antes: antes.precio_base,
        fecha: ultimo.fecha,
      })
    }
  }
  return alertas.sort((a, b) => b.variacionPct - a.variacionPct)
}
