import { describe, expect, it } from 'vitest'
import {
  alertasDeAumento,
  aumentoProveedor,
  gastoPorProducto,
  metricasProveedores,
  variaciones,
  type PrecioHistorico,
  type RenglonRecibido,
} from './metricas'

const ahora = new Date('2026-09-30T12:00:00Z')
const hace = (dias: number) => new Date(ahora.getTime() - dias * 86_400_000).toISOString()
const precio = (
  producto: string,
  dias: number,
  valor: number,
  proveedor = 'tito',
): PrecioHistorico => ({
  producto_id: producto,
  proveedor_id: proveedor,
  precio_base: valor,
  fecha: hace(dias),
})

describe('variaciones (30 días)', () => {
  it('compara el último precio con el que regía hace 30 días', () => {
    const v = variaciones(
      [
        precio('tomate', 60, 2000),
        precio('tomate', 40, 2400),
        precio('tomate', 10, 2600),
        precio('tomate', 2, 2900),
      ],
      ahora,
    )
    expect(v.get('tomate')).toMatchObject({ ultimo: 2900, anterior: 2400, variacionPct: 20.8 })
    expect(v.get('tomate')?.serie).toHaveLength(4)
  })

  it('si no había precio antes, contra el primero de la ventana; con uno solo, sin variación', () => {
    const v = variaciones(
      [precio('papa', 20, 800), precio('papa', 3, 900), precio('cebolla', 5, 1100)],
      ahora,
    )
    expect(v.get('papa')?.variacionPct).toBe(12.5)
    expect(v.get('cebolla')).toMatchObject({ anterior: null, variacionPct: null })
  })
})

describe('aumento del proveedor', () => {
  const vars = variaciones(
    [
      precio('tomate', 40, 2000),
      precio('tomate', 2, 2400),
      precio('papa', 40, 1000),
      precio('papa', 2, 1000),
    ],
    ahora,
  )
  const renglon = (producto: string, cantidad: number, p: number): RenglonRecibido => ({
    proveedor_id: 'tito',
    producto_id: producto,
    recepcion_id: 'r',
    recibido_at: hace(2),
    pedido_id: null,
    enviado_at: null,
    cantidad_pedida_base: null,
    cantidad_base: cantidad,
    precio_unit_base: p,
    resultado: 'ok',
  })

  it('pondera por lo gastado: el tomate (+20%) pesa 3 veces más que la papa (0%)', () => {
    const gasto = gastoPorProducto([renglon('tomate', 25, 2400), renglon('papa', 20, 1000)], ahora)
    expect(gasto.get('tomate')).toBe(60000)
    expect(aumentoProveedor('tito', vars, gasto)).toBe(15) // (20 × 60000 + 0 × 20000) / 80000
  })

  it('sin gasto registrado, promedio simple; sin variaciones, null', () => {
    expect(aumentoProveedor('tito', vars, new Map())).toBe(10)
    expect(aumentoProveedor('otro', vars, new Map())).toBeNull()
  })
})

describe('cumplimiento y demora', () => {
  const r = (p: Partial<RenglonRecibido>): RenglonRecibido => ({
    proveedor_id: 'tito',
    producto_id: 'x',
    recepcion_id: 'r1',
    recibido_at: hace(1),
    pedido_id: 'p1',
    enviado_at: hace(3),
    cantidad_pedida_base: 10,
    cantidad_base: 10,
    precio_unit_base: 1,
    resultado: 'ok',
    ...p,
  })

  it('cuenta renglones pedidos que llegaron completos y promedia la demora por recepción', () => {
    const m = metricasProveedores(
      [
        r({}),
        r({ resultado: 'precio_subio' }),
        r({ resultado: 'faltante' }),
        r({ recepcion_id: 'r2', pedido_id: 'p2', recibido_at: hace(5), enviado_at: hace(6) }),
        r({ recepcion_id: 'r3', pedido_id: null, enviado_at: null, cantidad_pedida_base: null }), // sin pedido: no cuenta
        r({ recepcion_id: 'r4', pedido_id: 'p9', recibido_at: hace(45) }), // fuera de los 30 días
      ],
      ahora,
    )
    expect(m.get('tito')).toEqual({ pedidos: 2, cumplimiento: 75, demora: 1.5 })
  })
})

describe('alertas de aumento', () => {
  const precios = [
    precio('tomate', 20, 2400),
    precio('tomate', 2, 2900), // +20,8%
    precio('papa', 20, 1000),
    precio('papa', 3, 1080, 'cuyo'), // +8%
    precio('vacio', 30, 14000, 'jorge'),
    precio('vacio', 12, 16000, 'jorge'), // subió, pero hace 12 días
  ]
  const umbral = (prov: Record<string, number> = {}, prod: Record<string, number> = {}) => ({
    general: 10,
    proveedor: (id: string) => prov[id] ?? null,
    producto: (id: string) => prod[id] ?? null,
  })

  it('avisa lo que subió más que el umbral general en la semana', () => {
    expect(
      alertasDeAumento(precios, umbral(), ahora).map((a) => [a.producto_id, a.variacionPct]),
    ).toEqual([['tomate', 20.8]])
  })

  it('el umbral del proveedor y el del producto mandan', () => {
    expect(alertasDeAumento(precios, umbral({ tito: 25 }), ahora)).toEqual([])
    expect(alertasDeAumento(precios, umbral({ cuyo: 5 }), ahora).map((a) => a.producto_id)).toEqual(
      ['tomate', 'papa'],
    )
    expect(
      alertasDeAumento(precios, umbral({ tito: 25 }, { tomate: 5 }), ahora).map(
        (a) => a.producto_id,
      ),
    ).toEqual(['tomate'])
  })
})

describe('saltos raros (cambió la unidad)', () => {
  const precios = [
    precio('cajas', 40, 280),
    precio('cajas', 2, 287974),
    precio('papel', 40, 1000),
    precio('papel', 2, 1100),
  ]
  it('no cuentan como aumento: se marcan y quedan fuera del promedio y de las alertas', () => {
    const v = variaciones(precios, ahora)
    expect(v.get('cajas')?.saltoRaro).toBe(true)
    expect(v.get('papel')?.saltoRaro).toBe(false)
    expect(aumentoProveedor('tito', v, new Map())).toBe(10)
    const alertas = alertasDeAumento(
      precios,
      { general: 5, proveedor: () => null, producto: () => null },
      ahora,
    )
    expect(alertas.map((a) => a.producto_id)).toEqual(['papel'])
  })
})
