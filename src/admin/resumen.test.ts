import { describe, expect, it } from 'vitest'
import {
  cambiosDePrecio,
  comprasPorProveedor,
  montoRecepcion,
  rangoDelMes,
  resumen,
  type PedidoPanel,
  type RecepcionPanel,
} from './resumen'

const recepcion = (p: Partial<RecepcionPanel>): RecepcionPanel => ({
  id: 'r',
  local_id: 'l',
  proveedor_id: 'tito',
  pedido_id: null,
  pedido_numero: null,
  recibido_at: '2026-09-10T12:00:00Z',
  nro_remito: null,
  total_remito: null,
  origen: 'manual',
  foto_path: null,
  observaciones: null,
  items: [],
  diferencias: [],
  ...p,
})
const item = (p: Partial<RecepcionPanel['items'][number]>) => ({
  producto_id: 'x',
  cantidad_pedida_base: null,
  cantidad_base: 1,
  precio_unit_base: 100,
  subtotal: null,
  resultado: 'ok',
  ...p,
})
const pedido = (estado: string): PedidoPanel => ({
  id: estado,
  numero: 1,
  estado,
  local_id: 'l',
  proveedor_id: 'tito',
  creado_at: '2026-09-10',
  enviado_at: null,
  pagado_at: null,
  estimado: null,
})

describe('montoRecepcion', () => {
  it('usa el total del remito; si no, suma los renglones', () => {
    expect(montoRecepcion(recepcion({ total_remito: 5000, items: [item({ subtotal: 10 })] }))).toBe(
      5000,
    )
    expect(
      montoRecepcion(
        recepcion({
          items: [item({ subtotal: 1500 }), item({ cantidad_base: 2, precio_unit_base: 250 })],
        }),
      ),
    ).toBe(2000)
  })
})

describe('resumen', () => {
  it('compras, proveedores, pedidos, en camino, cumplimiento y diferencias', () => {
    const r = resumen(
      [
        recepcion({
          total_remito: 100000,
          items: [
            item({ cantidad_pedida_base: 10 }),
            item({ cantidad_pedida_base: 5, resultado: 'faltante' }),
          ],
          diferencias: [
            {
              id: 'd',
              producto_id: 'x',
              tipo: 'faltante',
              monto: 74000,
              detalle: '',
              estado: 'pendiente',
            },
          ],
        }),
        recepcion({
          proveedor_id: 'jorge',
          total_remito: 50000,
          items: [
            item({ cantidad_pedida_base: 3 }),
            item({ cantidad_pedida_base: 1, resultado: 'precio_subio' }),
          ],
          diferencias: [
            {
              id: 'e',
              producto_id: 'x',
              tipo: 'precio',
              monto: -6600,
              detalle: '',
              estado: 'reclamado',
            },
          ],
        }),
        recepcion({ total_remito: 25000 }),
      ],
      [pedido('enviado'), pedido('enviado'), pedido('a_pagar')],
    )
    expect(r).toEqual({
      compras: 175000,
      proveedores: 2,
      pedidos: 3,
      enCamino: 2,
      cumplimiento: 75,
      diferencias: 80600,
      recepcionesConDiferencias: 2,
    })
  })
})

describe('cambiosDePrecio', () => {
  const p = (producto: string, fecha: string, precio: number) => ({
    producto_id: producto,
    proveedor_id: 'tito',
    precio_base: precio,
    fecha,
  })
  it('cada cambio dentro del período, contra la compra anterior (aunque sea de antes)', () => {
    const { desde, hasta } = rangoDelMes('2026-09')
    const c = cambiosDePrecio(
      [
        p('tomate', '2026-08-20T10:00:00Z', 2400),
        p('tomate', '2026-09-26T10:00:00Z', 2900),
        p('papa', '2026-09-05T10:00:00Z', 900),
        p('papa', '2026-09-20T10:00:00Z', 900),
        p('cajas', '2026-09-01T10:00:00Z', 280),
        p('cajas', '2026-09-18T10:00:00Z', 287974),
        p('vacio', '2026-10-02T10:00:00Z', 15000),
      ],
      desde,
      hasta,
    )
    expect(c.map((x) => [x.producto_id, x.antes, x.ahora, x.variacionPct, x.saltoRaro])).toEqual([
      ['tomate', 2400, 2900, 20.8, false],
      ['cajas', 280, 287974, 102747.9, true],
    ])
  })
  it('centavos de redondeo no son un cambio de precio', () => {
    const { desde, hasta } = rangoDelMes('2026-09')
    const c = cambiosDePrecio(
      [p('sidra', '2026-09-01T10:00:00Z', 39427), p('sidra', '2026-09-28T10:00:00Z', 39427.08)],
      desde,
      hasta,
    )
    expect(c).toEqual([])
  })
})

describe('comprasPorProveedor y rangoDelMes', () => {
  it('ordena de mayor a menor', () => {
    const c = comprasPorProveedor([
      recepcion({ total_remito: 100 }),
      recepcion({ proveedor_id: 'jorge', total_remito: 500 }),
      recepcion({ total_remito: 50 }),
    ])
    expect(c).toEqual([
      { proveedor_id: 'jorge', monto: 500, recepciones: 1 },
      { proveedor_id: 'tito', monto: 150, recepciones: 2 },
    ])
  })
  it('el mes va del día 1 al 1 del mes siguiente', () => {
    const { desde, hasta } = rangoDelMes('2026-12')
    expect([desde.getMonth(), desde.getDate(), hasta.getFullYear(), hasta.getMonth()]).toEqual([
      11, 1, 2027, 0,
    ])
  })
})
