import { describe, expect, it } from 'vitest'
import {
  ahorroPosible,
  candidatosParaComparar,
  cantidadPorProducto,
  compararOpciones,
  masBaratoEnOtro,
  type Opcion,
} from './comparar'

const ahora = new Date('2026-10-03T12:00:00Z')
const opcion = (
  productoId: string,
  precio: number | null,
  fecha: string | null = '2026-09-25T10:00:00Z',
): Opcion => ({
  productoId,
  proveedorId: `prov-${productoId}`,
  nombre: productoId,
  precio,
  fecha,
})

describe('compararOpciones', () => {
  it('marca la más barata y cuánto más caras son las demás', () => {
    const c = compararOpciones(
      [opcion('cepro', 16500), opcion('esperanza', 14107), opcion('otro', 15000)],
      ahora,
    )
    expect(c.map((o) => [o.productoId, o.esLaMasBarata, o.masCaraPct])).toEqual([
      ['esperanza', true, 0],
      ['otro', false, 6.3],
      ['cepro', false, 17],
    ])
  })

  it('un precio viejo o que falta no cuenta, y va al final', () => {
    const c = compararOpciones(
      [
        opcion('viejo', 9000, '2026-05-01T10:00:00Z'),
        opcion('a', 12000),
        opcion('sin', null, null),
        opcion('b', 11000),
      ],
      ahora,
    )
    expect(c.map((o) => [o.productoId, o.vigente, o.esLaMasBarata])).toEqual([
      ['b', true, true],
      ['a', true, false],
      ['viejo', false, false],
      ['sin', false, false],
    ])
  })

  it('con un solo precio vigente no hay nada que comparar', () => {
    const c = compararOpciones([opcion('a', 12000), opcion('sin', null, null)], ahora)
    expect(c.some((o) => o.esLaMasBarata)).toBe(false)
    expect(c[0]!.masCaraPct).toBeNull()
  })
})

describe('ahorroPosible', () => {
  const c = compararOpciones([opcion('cepro', 16500), opcion('esperanza', 14107)], ahora)
  it('lo que se hubiera ahorrado comprándole al más barato', () => {
    // 8 kg en el mes: (16.500 − 14.107) × 8 = 19.144
    expect(ahorroPosible(c, 'cepro', 8)).toMatchObject({
      ahorro: 19144,
      mejor: { productoId: 'esperanza' },
    })
  })
  it('si ya se le compra al más barato, o no se compró nada, no hay ahorro', () => {
    expect(ahorroPosible(c, 'esperanza', 8)).toBeNull()
    expect(ahorroPosible(c, 'cepro', 0)).toBeNull()
  })
})

describe('masBaratoEnOtro', () => {
  const prod = (id: string, proveedor_id: string, comparable_id: string | null = 'azul') => ({
    id,
    proveedor_id,
    nombre: id,
    unidad_base_id: 'kg',
    umbral_alerta_pct: null,
    activo: true,
    comparable_id,
  })
  const catalogo = (precios: [string, number][]) => ({
    ajustes: { umbral_alerta_pct: 10, tolerancia_peso_pct: 10, tolerancia_unidad_pct: 0 },
    unidades: [],
    proveedores: [],
    productos: [
      prod('cepro', 'p-cepro'),
      prod('esperanza', 'p-esperanza'),
      prod('suelto', 'p-x', null),
    ],
    presentaciones: [],
    precios: new Map(
      precios.map(([id, precio_base]) => [
        id,
        { producto_id: id, precio_base, fecha: '2026-09-25T10:00:00Z' },
      ]),
    ),
  })
  it('avisa cuando el mismo producto está más barato en otro proveedor', () => {
    const c = catalogo([
      ['cepro', 16500],
      ['esperanza', 14107],
    ])
    expect(masBaratoEnOtro(c.productos[0]!, c, ahora)).toEqual({
      proveedorId: 'p-esperanza',
      precio: 14107,
      menosPct: 14.5,
    })
    // Al que ya es el más barato, o al que no se compara con nada, no le avisa.
    expect(masBaratoEnOtro(c.productos[1]!, c, ahora)).toBeNull()
    expect(masBaratoEnOtro(c.productos[2]!, c, ahora)).toBeNull()
  })
  it('una diferencia de menos de 3 % no justifica cambiar', () => {
    const c = catalogo([
      ['cepro', 14300],
      ['esperanza', 14107],
    ])
    expect(masBaratoEnOtro(c.productos[0]!, c, ahora)).toBeNull()
  })
})

describe('candidatosParaComparar', () => {
  const p = (
    id: string,
    proveedor_id: string,
    nombre: string,
    unidad_base_id = 'kg',
    activo = true,
  ) => ({
    id,
    proveedor_id,
    nombre,
    unidad_base_id,
    activo,
  })
  it('solo de otros proveedores y en la misma unidad, los más parecidos primero', () => {
    const azul = p('1', 'cepro', 'Queso Azul x Kg - LA QUESERA')
    const lista = [
      azul,
      p('2', 'cepro', 'Queso Brie'),
      p('3', 'esperanza', 'Queso Azul LaQuesera'),
      p('4', 'esperanza', 'Harina 0000'),
      p('5', 'esperanza', 'Queso Azul en horma', 'horma'),
      p('6', 'canut', 'Queso Azul archivado', 'kg', false),
    ]
    expect(candidatosParaComparar(azul, lista).map((x) => x.id)).toEqual(['3', '4'])
  })
})

describe('cantidadPorProducto', () => {
  it('suma lo recibido en los últimos 30 días', () => {
    const r = (producto_id: string | null, dia: string, cantidad_base: number | null) => ({
      producto_id,
      recibido_at: `${dia}T10:00:00Z`,
      cantidad_base,
    })
    const c = cantidadPorProducto(
      [
        r('a', '2026-09-10', 5),
        r('a', '2026-09-28', 3),
        r('a', '2026-08-01', 100),
        r('b', '2026-09-20', null),
        r(null, '2026-09-20', 9),
      ],
      ahora,
    )
    expect([...c]).toEqual([['a', 8]])
  })
})
