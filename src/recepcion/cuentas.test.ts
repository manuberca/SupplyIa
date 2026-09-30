import { describe, expect, it } from 'vitest'
import { chequearCuentas } from './cuentas'

const r = (cantidad: number | null, precio: number | null) => ({ cantidad, precio })

describe('chequearCuentas (total de la boleta contra los renglones)', () => {
  it('sin total, pide cargarlo', () => {
    const c = chequearCuentas([r(2, 2838)], null)
    expect(c.estado).toBe('revisar')
    expect(c.alertas).toEqual(['Falta cargar el total de la boleta.'])
    expect(c.suma).toBe(5676)
  })

  it('total igual a la suma: cierra', () => {
    expect(chequearCuentas([r(2, 2838)], 5676)).toMatchObject({ estado: 'ok', nota: null })
  })

  it('total con IVA 21 % o 10,5 %: cierra y lo explica', () => {
    const c = chequearCuentas([r(10, 1000)], 12100)
    expect(c.estado).toBe('ok')
    expect(c.nota).toBe('La boleta dice $12.100: la diferencia es el IVA, las cuentas cierran.')
    expect(chequearCuentas([r(10, 1000)], 11050).estado).toBe('ok')
  })

  it('tasas mezcladas (entre 10 % y 21,5 %) también cierran', () => {
    expect(chequearCuentas([r(10, 1000)], 11500).estado).toBe('ok')
  })

  it('renglones que suman mucho más que el total: precio por caja en vez de por unidad', () => {
    const c = chequearCuentas([r(12, 18000)], 18000)
    expect(c.estado).toBe('revisar')
    expect(c.alertas[0]).toMatch(/por caja o pack/)
  })

  it('con todos los precios y un total que no cierra, avisa', () => {
    const c = chequearCuentas([r(10, 1000)], 15000)
    expect(c.alertas).toEqual([
      'Las cuentas no cierran: los renglones suman $10.000 y el total dice $15.000.',
    ])
  })

  it('si faltan precios no acusa de más: cuenta los que no tienen precio', () => {
    const c = chequearCuentas([r(10, 1000), r(3, null), r(0, null)], 15000)
    expect(c.estado).toBe('ok')
    expect(c.sinPrecio).toBe(1)
  })
})
