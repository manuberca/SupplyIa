import { describe, expect, it } from 'vitest'
import {
  conciliar,
  factorDeUnidad,
  type ProductoConciliable,
  type RenglonRemito,
} from './conciliar'

const kg = { nombre: 'kg', tipo: 'peso' }
const unidad = { nombre: 'unidad', tipo: 'unidad' }
const producto = (id: string, p: Partial<ProductoConciliable> = {}): ProductoConciliable => ({
  id,
  nombre: id,
  unidad: kg,
  presentaciones: [],
  umbral: null,
  precioAnterior: null,
  ...p,
})

// El ejemplo de diseno/Recepcion.dc.html: Frigorífico San Jorge, pedido #0142.
const productos = new Map(
  [
    producto('Vacío', { precioAnterior: 14200 }),
    producto('Matambre', { precioAnterior: 11800 }),
    producto('Chorizo', {
      precioAnterior: 7900,
      presentaciones: [{ id: 'caja', nombre: 'Caja', factor_a_base: 5, aproximada: false }],
    }),
    producto('Entraña', { precioAnterior: 18500 }),
    producto('Lechuga', { unidad, precioAnterior: 1450 }),
  ].map((p) => [p.id, p]),
)
const ajustes = { umbral_alerta_pct: 5, tolerancia_peso_pct: 10, tolerancia_unidad_pct: 0 }
const renglon = (
  productoId: string | null,
  cantidad: number,
  precioUnit: number,
  extra: Partial<RenglonRemito> = {},
): RenglonRemito => ({
  id: `${productoId}-${cantidad}`,
  texto: `${productoId ?? 'algo'} remito`,
  productoId,
  cantidad,
  unidad: 'kg',
  precioUnit,
  subtotal: Math.round(cantidad * precioUnit * 100) / 100,
  ...extra,
})

describe('conciliar (ejemplo del diseño)', () => {
  const c = conciliar({
    productos,
    pedido: [
      { producto_id: 'Vacío', presentacion_id: null, cantidad: 12, precio_estimado_base: 14200 },
      { producto_id: 'Matambre', presentacion_id: null, cantidad: 6, precio_estimado_base: 11800 },
      { producto_id: 'Chorizo', presentacion_id: 'caja', cantidad: 1, precio_estimado_base: 7900 },
      { producto_id: 'Entraña', presentacion_id: null, cantidad: 4, precio_estimado_base: 18500 },
    ],
    remito: [
      renglon('Vacío', 11.6, 14200),
      renglon('Matambre', 6, 12900),
      renglon('Chorizo', 5, 7900),
    ],
    ajustes,
    umbralProveedor: null,
  })
  const fila = (id: string) => c.filas.find((f) => f.productoId === id)!

  it('vacío: 11,6 de 12 kg está dentro de la tolerancia en peso', () => {
    expect(fila('Vacío')).toMatchObject({
      resultado: 'ok',
      pedidoBase: 12,
      llegoBase: 11.6,
      detalle: 'Correcto · dentro del 10% de tolerancia en peso',
    })
  })

  it('matambre: subió 9,3% (umbral 5%) y queda la diferencia de precio', () => {
    expect(fila('Matambre')).toMatchObject({
      resultado: 'precio_subio',
      variacionPct: 9.3,
      detalle: 'Subió 9,3% · antes $11.800/kg',
    })
    expect(c.diferencias).toContainEqual({
      productoId: 'Matambre',
      tipo: 'precio',
      monto: 6600,
      detalle: 'Matambre subió +9,3%: de $11.800 a $12.900 por kg',
    })
  })

  it('chorizo: 1 caja de 5 kg pedida, 5 kg en el remito', () => {
    expect(fila('Chorizo')).toMatchObject({
      resultado: 'ok',
      pedidoBase: 5,
      llegoBase: 5,
      detalle: 'Correcto',
    })
  })

  it('entraña: no vino, faltante con su plata', () => {
    expect(fila('Entraña')).toMatchObject({
      resultado: 'faltante',
      llegoBase: 0,
      detalle: 'No vino en el remito',
    })
    expect(c.diferencias).toContainEqual({
      productoId: 'Entraña',
      tipo: 'faltante',
      monto: 74000,
      detalle: 'No vino Entraña (4 kg)',
    })
  })

  it('resumen, estado y totales', () => {
    expect(c.resumen).toEqual({
      correctos: 2,
      faltantes: 1,
      aumentos: 1,
      excesos: 0,
      noPedidos: 0,
      sinAsignar: 0,
    })
    expect(c.estadoPedido).toBe('revisar')
    expect(c.totalRemito).toBe(11.6 * 14200 + 6 * 12900 + 5 * 7900)
    expect(c.totalPedidoEstimado).toBe(12 * 14200 + 6 * 11800 + 5 * 7900 + 4 * 18500)
  })
})

describe('conciliar (otros casos)', () => {
  it('todo correcto: queda a pagar', () => {
    const c = conciliar({
      productos,
      pedido: [
        { producto_id: 'Vacío', presentacion_id: null, cantidad: 10, precio_estimado_base: null },
      ],
      remito: [renglon('Vacío', 10, 14300)],
      ajustes,
      umbralProveedor: null,
    })
    expect(c.estadoPedido).toBe('a_pagar')
    expect(c.diferencias).toEqual([])
  })

  it('por unidad no hay tolerancia: 5 de 6 lechugas es faltante', () => {
    const c = conciliar({
      productos,
      pedido: [
        { producto_id: 'Lechuga', presentacion_id: null, cantidad: 6, precio_estimado_base: 1450 },
      ],
      remito: [renglon('Lechuga', 5, 1450, { unidad: 'unidades' })],
      ajustes,
      umbralProveedor: null,
    })
    expect(c.filas[0]).toMatchObject({
      resultado: 'faltante',
      detalle: 'Faltó: llegó 5 unidades de 6 unidades',
    })
    expect(c.diferencias[0]).toMatchObject({
      tipo: 'faltante',
      monto: 1450,
      detalle: 'Faltó 1 unidad de Lechuga',
    })
  })

  it('exceso y producto que no estaba en el pedido', () => {
    const c = conciliar({
      productos,
      pedido: [
        { producto_id: 'Vacío', presentacion_id: null, cantidad: 10, precio_estimado_base: 14200 },
      ],
      remito: [renglon('Vacío', 12, 14200), renglon('Matambre', 2, 11800)],
      ajustes,
      umbralProveedor: null,
    })
    expect(c.filas.map((f) => [f.productoId, f.resultado])).toEqual([
      ['Vacío', 'exceso'],
      ['Matambre', 'no_pedido'],
    ])
    expect(c.estadoPedido).toBe('revisar')
  })

  it('el umbral del proveedor manda sobre el general, y el del producto sobre los dos', () => {
    const base = { pedido: null, remito: [renglon('Vacío', 1, 15000)], ajustes }
    // +5,6%: con umbral general 5 alerta; con 10 del proveedor no; con 3 del producto sí.
    expect(conciliar({ ...base, productos, umbralProveedor: null }).diferencias).toHaveLength(1)
    expect(conciliar({ ...base, productos, umbralProveedor: 10 }).diferencias).toHaveLength(0)
    const conUmbral = new Map(productos)
    conUmbral.set('Vacío', { ...productos.get('Vacío')!, umbral: 3 })
    expect(
      conciliar({ ...base, productos: conUmbral, umbralProveedor: 10 }).diferencias,
    ).toHaveLength(1)
  })

  it('renglones sin asignar dejan el pedido para revisar', () => {
    const c = conciliar({
      productos,
      pedido: null,
      remito: [renglon(null, 1, 100)],
      ajustes,
      umbralProveedor: null,
    })
    expect(c.resumen.sinAsignar).toBe(1)
    expect(c.filas[0]?.detalle).toBe('Elegí a qué producto corresponde')
    expect(c.estadoPedido).toBe('revisar')
  })

  it('si las cuentas del remito no cierran, queda para revisar', () => {
    const c = conciliar({
      productos,
      pedido: null,
      remito: [renglon('Vacío', 1, 14200)],
      ajustes,
      umbralProveedor: null,
      cuentasOk: false,
    })
    expect(c.estadoPedido).toBe('revisar')
  })
})

describe('factorDeUnidad', () => {
  const chorizo = productos.get('Chorizo')!
  it('convierte presentaciones y gramos', () => {
    expect(factorDeUnidad('KG', chorizo).factor).toBe(1)
    expect(factorDeUnidad('cajas', chorizo).factor).toBe(5)
    expect(factorDeUnidad('gr', chorizo).factor).toBe(0.001)
    expect(factorDeUnidad(null, chorizo)).toEqual({ factor: 1, aproximada: false, dudosa: false })
    expect(factorDeUnidad('bolsa', chorizo).dudosa).toBe(true)
  })
})
