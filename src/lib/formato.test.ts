import { describe, expect, it } from 'vitest'
import { cantidad, numero, pesos, porcentaje } from './formato'

describe('pesos', () => {
  it('agrupa miles con punto y no muestra centavos', () => {
    expect(pesos(14200)).toBe('$14.200')
    expect(pesos(1400)).toBe('$1.400')
    expect(pesos(186300)).toBe('$186.300')
    expect(pesos(1234567)).toBe('$1.234.567')
    expect(pesos(999)).toBe('$999')
    expect(pesos(0)).toBe('$0')
  })

  it('redondea los centavos', () => {
    expect(pesos(14199.6)).toBe('$14.200')
  })

  it('muestra el signo antes del $', () => {
    expect(pesos(-3500)).toBe('-$3.500')
  })

  it('no rompe con valores inválidos', () => {
    expect(pesos(Number.NaN)).toBe('—')
  })
})

describe('cantidad', () => {
  it('usa coma decimal y saca ceros de más', () => {
    expect(cantidad(11.6, 'kg')).toBe('11,6 kg')
    expect(cantidad(20, 'kg')).toBe('20 kg')
    expect(cantidad(4.5, 'kg')).toBe('4,5 kg')
    expect(cantidad(0.25, 'kg')).toBe('0,25 kg')
    expect(cantidad(1500, 'g')).toBe('1.500 g')
  })
})

describe('porcentaje', () => {
  it('lleva signo y un decimal', () => {
    expect(porcentaje(9.3)).toBe('+9,3%')
    expect(porcentaje(21)).toBe('+21%')
    expect(porcentaje(-2.04)).toBe('-2%')
    expect(porcentaje(0)).toBe('0%')
    expect(porcentaje(0.04)).toBe('0%')
    expect(porcentaje(-0.04)).toBe('0%')
  })
})

describe('numero', () => {
  it('no muestra -0', () => {
    expect(numero(-0.001)).toBe('0')
  })
})
