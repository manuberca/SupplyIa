// Datos del panel de administración para un período y filtros (todo de a páginas: Supabase
// corta en 1.000 filas y un mes de un bar puede pasarlas).

import type { PrecioHistorico } from '../control/metricas'
import { SIN_CONEXION } from '../lib/errores-auth'
import { reportar } from '../lib/errores'
import { todasLasFilas } from '../lib/paginar'
import { supabase } from '../lib/supabase'
import type { PedidoPanel, RecepcionPanel } from './resumen'

export type Filtros = {
  desde: Date
  hasta: Date
  localId: string | null
  proveedorId: string | null
}

export type DatosPanel = {
  recepciones: RecepcionPanel[]
  pedidos: PedidoPanel[]
  /** Pedidos esperando pago (sin importar la fecha), con lo que llegó. */
  aPagar: (PedidoPanel & { monto: number | null; recibido_at: string | null })[]
  /** Precios del período y de antes (para saber el anterior a cada cambio). */
  precios: PrecioHistorico[]
}

const HISTORIA_PREVIA_DIAS = 180

export async function cargarPanel(f: Filtros): Promise<DatosPanel | { error: string }> {
  const desde = f.desde.toISOString()
  const hasta = f.hasta.toISOString()
  const desdePrecios = new Date(f.desde.getTime() - HISTORIA_PREVIA_DIAS * 86_400_000).toISOString()

  const [recepciones, pedidos, aPagar, precios] = await Promise.all([
    todasLasFilas((a, b) => {
      let q = supabase
        .from('recepciones')
        .select(
          'id, local_id, proveedor_id, pedido_id, recibido_at, nro_remito, total_remito, origen, foto_path, observaciones, pedidos ( numero ), recepcion_items ( producto_id, cantidad_pedida_base, cantidad_base, precio_unit_base, subtotal, resultado ), diferencias ( id, producto_id, tipo, monto, detalle, estado )',
        )
        .gte('recibido_at', desde)
        .lt('recibido_at', hasta)
      if (f.localId) q = q.eq('local_id', f.localId)
      if (f.proveedorId) q = q.eq('proveedor_id', f.proveedorId)
      return q.order('recibido_at', { ascending: false }).order('id').range(a, b)
    }),
    todasLasFilas((a, b) => {
      let q = supabase
        .from('pedidos')
        .select(
          'id, numero, estado, local_id, proveedor_id, creado_at, enviado_at, pagado_at, pedido_items ( cantidad, precio_estimado_base, presentacion_id, presentaciones ( factor_a_base ) )',
        )
        .gte('creado_at', desde)
        .lt('creado_at', hasta)
      if (f.localId) q = q.eq('local_id', f.localId)
      if (f.proveedorId) q = q.eq('proveedor_id', f.proveedorId)
      return q.order('creado_at', { ascending: false }).order('id').range(a, b)
    }),
    todasLasFilas((a, b) => {
      let q = supabase
        .from('pedidos')
        .select(
          'id, numero, estado, local_id, proveedor_id, creado_at, enviado_at, pagado_at, recepciones ( recibido_at, total_remito, recepcion_items ( subtotal, cantidad_base, precio_unit_base ) )',
        )
        .in('estado', ['a_pagar', 'revisar'])
      if (f.localId) q = q.eq('local_id', f.localId)
      if (f.proveedorId) q = q.eq('proveedor_id', f.proveedorId)
      return q.order('creado_at').order('id').range(a, b)
    }),
    todasLasFilas((a, b) => {
      let q = supabase
        .from('precios')
        .select('producto_id, proveedor_id, precio_base, fecha')
        .gte('fecha', desdePrecios)
        .lt('fecha', hasta)
      if (f.proveedorId) q = q.eq('proveedor_id', f.proveedorId)
      return q.order('fecha').order('id').range(a, b)
    }),
  ])

  const error = recepciones.error ?? pedidos.error ?? aPagar.error ?? precios.error
  if (error) {
    const sinRed = !navigator.onLine || /fetch/i.test(error.message)
    if (!sinRed) reportar(error, 'No se pudo cargar el panel')
    return { error: sinRed ? SIN_CONEXION : 'No pudimos cargar el panel. Probá de nuevo.' }
  }

  const estimado = (
    items: {
      cantidad: number
      precio_estimado_base: number | null
      presentaciones: { factor_a_base: number } | null
    }[],
  ) => {
    const conPrecio = items.filter((i) => i.precio_estimado_base !== null)
    return conPrecio.length
      ? Math.round(
          conPrecio.reduce(
            (s, i) =>
              s + i.cantidad * (i.presentaciones?.factor_a_base ?? 1) * i.precio_estimado_base!,
            0,
          ),
        )
      : null
  }

  return {
    recepciones: recepciones.data.map(({ pedidos: ped, recepcion_items, diferencias, ...r }) => ({
      ...r,
      pedido_numero: ped?.numero ?? null,
      items: recepcion_items,
      diferencias,
    })),
    pedidos: pedidos.data.map(({ pedido_items, ...p }) => ({
      ...p,
      estimado: estimado(pedido_items),
    })),
    aPagar: aPagar.data.map(({ recepciones: recs, ...p }) => {
      const ultima = [...recs].sort((x, y) => y.recibido_at.localeCompare(x.recibido_at))[0]
      const monto = ultima
        ? (ultima.total_remito ??
          Math.round(
            ultima.recepcion_items.reduce(
              (s, i) => s + (i.subtotal ?? (i.cantidad_base ?? 0) * (i.precio_unit_base ?? 0)),
              0,
            ),
          ))
        : null
      return { ...p, estimado: null, monto, recibido_at: ultima?.recibido_at ?? null }
    }),
    precios: precios.data,
  }
}
