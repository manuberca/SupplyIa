// Cálculos del panel de administración (SPEC §10). Funciones puras sobre lo que trae la base
// para el período y los filtros elegidos.

import { esSaltoRaro, type PrecioHistorico } from '../control/metricas'

export type RecepcionPanel = {
  id: string
  local_id: string
  proveedor_id: string
  pedido_id: string | null
  pedido_numero: number | null
  recibido_at: string
  nro_remito: string | null
  total_remito: number | null
  origen: string
  foto_path: string | null
  observaciones: string | null
  items: {
    producto_id: string | null
    cantidad_pedida_base: number | null
    cantidad_base: number | null
    precio_unit_base: number | null
    subtotal: number | null
    resultado: string
  }[]
  diferencias: {
    id: string
    producto_id: string | null
    tipo: string
    monto: number | null
    detalle: string
    estado: string
  }[]
}

export type PedidoPanel = {
  id: string
  numero: number
  estado: string
  local_id: string
  proveedor_id: string
  creado_at: string
  enviado_at: string | null
  pagado_at: string | null
  estimado: number | null
}

const redondear = (n: number) => Math.round(n * 100) / 100

/** Plata de una recepción: el total del remito; si no está, la suma de sus renglones. */
export function montoRecepcion(r: RecepcionPanel): number {
  if (r.total_remito !== null && r.total_remito > 0) return r.total_remito
  return redondear(
    r.items.reduce(
      (s, i) => s + (i.subtotal ?? (i.cantidad_base ?? 0) * (i.precio_unit_base ?? 0)),
      0,
    ),
  )
}

export type Resumen = {
  compras: number
  proveedores: number
  pedidos: number
  enCamino: number
  /** % de renglones pedidos que llegaron completos. null: sin recepciones de pedidos. */
  cumplimiento: number | null
  diferencias: number
  recepcionesConDiferencias: number
}

export function resumen(recepciones: RecepcionPanel[], pedidos: PedidoPanel[]): Resumen {
  const conPedido = recepciones.flatMap((r) =>
    r.items.filter((i) => i.cantidad_pedida_base !== null),
  )
  const completos = conPedido.filter((i) => i.resultado !== 'faltante').length
  const conDiferencias = recepciones.filter((r) => r.diferencias.length > 0)
  return {
    compras: redondear(recepciones.reduce((s, r) => s + montoRecepcion(r), 0)),
    proveedores: new Set(recepciones.map((r) => r.proveedor_id)).size,
    pedidos: pedidos.length,
    enCamino: pedidos.filter((p) => p.estado === 'enviado').length,
    cumplimiento: conPedido.length ? Math.round((completos / conPedido.length) * 100) : null,
    diferencias: redondear(
      conDiferencias.reduce(
        (s, r) => s + r.diferencias.reduce((t, d) => t + Math.abs(d.monto ?? 0), 0),
        0,
      ),
    ),
    recepcionesConDiferencias: conDiferencias.length,
  }
}

export type CambioDePrecio = {
  proveedor_id: string
  producto_id: string
  antes: number
  ahora: number
  variacionPct: number
  fecha: string
  /** Salto de más de ×4: casi seguro otra unidad (no es un aumento). */
  saltoRaro: boolean
}

/** Cada vez que un producto cambió de precio dentro del período, contra su compra anterior. */
export function cambiosDePrecio(
  precios: PrecioHistorico[],
  desde: Date,
  hasta: Date,
): CambioDePrecio[] {
  const porProducto = new Map<string, PrecioHistorico[]>()
  for (const p of precios)
    porProducto.set(p.producto_id, [...(porProducto.get(p.producto_id) ?? []), p])
  const cambios: CambioDePrecio[] = []
  for (const lista of porProducto.values()) {
    const orden = [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha))
    for (let i = 1; i < orden.length; i++) {
      const antes = orden[i - 1]!
      const ahora = orden[i]!
      const t = Date.parse(ahora.fecha)
      if (t < desde.getTime() || t >= hasta.getTime()) continue
      if (antes.precio_base <= 0) continue
      const variacionPct =
        Math.round(((ahora.precio_base - antes.precio_base) / antes.precio_base) * 1000) / 10
      // Menos de 0,1 %: centavos de redondeo del remito, no un cambio de precio.
      if (variacionPct === 0) continue
      cambios.push({
        proveedor_id: ahora.proveedor_id,
        producto_id: ahora.producto_id,
        antes: antes.precio_base,
        ahora: ahora.precio_base,
        variacionPct,
        fecha: ahora.fecha,
        saltoRaro: esSaltoRaro(antes.precio_base, ahora.precio_base),
      })
    }
  }
  return cambios.sort((a, b) => b.fecha.localeCompare(a.fecha))
}

/** Compras por proveedor en el período, de mayor a menor. */
export function comprasPorProveedor(
  recepciones: RecepcionPanel[],
): { proveedor_id: string; monto: number; recepciones: number }[] {
  const acc = new Map<string, { monto: number; recepciones: number }>()
  for (const r of recepciones) {
    const a = acc.get(r.proveedor_id) ?? { monto: 0, recepciones: 0 }
    a.monto += montoRecepcion(r)
    a.recepciones++
    acc.set(r.proveedor_id, a)
  }
  return [...acc]
    .map(([proveedor_id, a]) => ({
      proveedor_id,
      monto: redondear(a.monto),
      recepciones: a.recepciones,
    }))
    .sort((a, b) => b.monto - a.monto)
}

/** Primer y último instante de un mes "2026-09" (hora local). */
export function rangoDelMes(mes: string): { desde: Date; hasta: Date } {
  const [anio, m] = mes.split('-').map(Number) as [number, number]
  return { desde: new Date(anio, m - 1, 1), hasta: new Date(anio, m, 1) }
}
