import { describe, expect, it } from 'vitest'
import { validarRemito, type LineaLeida } from './validar'

const linea = (p: Partial<LineaLeida>): LineaLeida => ({
  texto: 'Producto',
  cantidad: 1,
  unidad: 'kg',
  precioUnit: 100,
  descuentoLinea: null,
  subtotal: 100,
  confianza: 'alta',
  observacion: '',
  ...p,
})
const sinTotales = { subtotalNeto: null, descuentoGlobal: null, iva: null, percepciones: null }

describe('validarRemito', () => {
  it('un remito que cierra queda OK', () => {
    const v = validarRemito(
      [
        linea({ cantidad: 12, precioUnit: 14200, subtotal: 170400 }),
        linea({ cantidad: 5, precioUnit: 7900, subtotal: 39500 }),
      ],
      { ...sinTotales, total: 209900 },
    )
    expect(v.estado).toBe('OK')
    expect(v.sumaLineas).toBe(209900)
  })

  it('una factura A con IVA discriminado cierra', () => {
    const v = validarRemito([linea({ cantidad: 33, precioUnit: 13200, subtotal: 435600 })], {
      subtotalNeto: 435600,
      descuentoGlobal: 0,
      iva: 91476,
      percepciones: 0,
      total: 527076,
    })
    expect(v.estado).toBe('OK')
  })

  it('acepta el IVA no discriminado (total = neto × 1,21)', () => {
    const v = validarRemito([linea({ cantidad: 10, precioUnit: 1000, subtotal: 10000 })], {
      ...sinTotales,
      total: 12100,
    })
    expect(v.estado).toBe('OK')
    expect(v.observaciones[0]).toMatch(/IVA no está discriminado/)
  })

  it('marca para revisar cuando las cuentas no cierran', () => {
    const v = validarRemito([linea({ cantidad: 10, precioUnit: 1000, subtotal: 10000 })], {
      ...sinTotales,
      total: 50000,
    })
    expect(v.estado).toBe('Revisar')
    expect(v.observaciones[0]).toMatch(/Las cuentas no cierran/)
  })

  it('detecta un renglón cuyo cantidad × precio no da el subtotal', () => {
    const v = validarRemito([linea({ cantidad: 54, precioUnit: 96694, subtotal: 1613003 })], {
      ...sinTotales,
      total: 1613003,
    })
    expect(v.lineas[0]?.confianza).toBe('baja')
    expect(v.estado).toBe('Revisar')
  })

  it('corrige precio y subtotal invertidos', () => {
    const v = validarRemito([linea({ cantidad: 2, precioUnit: 3000, subtotal: 1500 })], {
      ...sinTotales,
      total: 3000,
    })
    expect(v.lineas[0]).toMatchObject({ precioUnit: 1500, subtotal: 3000 })
    expect(v.estado).toBe('OK')
  })

  it('calcula el precio si solo hay subtotal', () => {
    const v = validarRemito([linea({ cantidad: 4, precioUnit: null, subtotal: 1000 })], {
      ...sinTotales,
      total: 1000,
    })
    expect(v.lineas[0]?.precioUnit).toBe(250)
  })

  it('acepta promos sin cargo y descuentos de línea', () => {
    const v = validarRemito(
      [
        linea({ cantidad: 3, precioUnit: 1000, descuentoLinea: 10, subtotal: 2700 }),
        linea({ cantidad: 1, precioUnit: 1000, descuentoLinea: 100, subtotal: 0 }),
      ],
      { ...sinTotales, total: 2700 },
    )
    expect(v.lineas[1]?.esPromo).toBe(true)
    expect(v.estado).toBe('OK')
  })

  it('un subtotal en 0 que no es promo queda dudoso', () => {
    const v = validarRemito([linea({ cantidad: 5, precioUnit: 11500, subtotal: 0 })], {
      ...sinTotales,
      total: 57500,
    })
    expect(v.lineas[0]?.confianza).toBe('baja')
  })

  it('un remito sin precios no es un error de lectura', () => {
    const v = validarRemito(
      [linea({ precioUnit: null, subtotal: null }), linea({ precioUnit: null, subtotal: null })],
      {
        ...sinTotales,
        total: null,
      },
    )
    expect(v.esRemitoSinValores).toBe(true)
    expect(v.estado).toBe('OK')
    expect(v.observaciones[0]).toMatch(/Remito sin precios/)
  })

  it('avisa si la suma no da el neto declarado', () => {
    const v = validarRemito([linea({ cantidad: 1, precioUnit: 1000, subtotal: 1000 })], {
      subtotalNeto: 5000,
      descuentoGlobal: 0,
      iva: 1050,
      percepciones: 0,
      total: 6050,
    })
    expect(v.estado).toBe('Revisar')
    expect(v.observaciones[0]).toMatch(/puede faltar o sobrar un renglón/)
  })
})
