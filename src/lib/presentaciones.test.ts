import { describe, expect, it } from 'vitest'
import { cantidadBase, textoPresentacion, textoUnidades } from './presentaciones'
import { leerNumero } from './formato'

describe('cantidadBase', () => {
  it('pasa a la unidad base', () => {
    expect(cantidadBase(2, 10)).toBe(20)
    expect(cantidadBase(3, 4.5)).toBe(13.5)
    expect(cantidadBase(0.1, 0.2)).toBe(0.02)
    expect(cantidadBase(7)).toBe(7)
  })
})

describe('textoPresentacion', () => {
  it('muestra la presentación con su equivalencia', () => {
    const kg = { nombre: 'kg', tipo: 'peso' }
    expect(textoPresentacion({ nombre: 'Caja', factor_a_base: 18, aproximada: false }, kg)).toBe(
      'caja de 18 kg',
    )
    expect(textoPresentacion({ nombre: 'Pieza', factor_a_base: 4.5, aproximada: true }, kg)).toBe(
      'pieza de ≈4,5 kg',
    )
    expect(
      textoUnidades({ nombre: 'atado', tipo: 'unidad' }, [
        { nombre: 'Jaula', factor_a_base: 12, aproximada: false },
      ]),
    ).toBe('atado · jaula de 12')
    expect(textoUnidades(kg, [])).toBe('kg')
  })
})

describe('leerNumero', () => {
  it.each([
    ['4,5', 4.5],
    ['4.5', 4.5],
    ['1.200', 1200],
    ['1.200,50', 1200.5],
    ['$ 2.900', 2900],
    ['18', 18],
    [' 0,25 ', 0.25],
    [12, 12],
  ])('%s → %s', (texto, esperado) => {
    expect(leerNumero(texto)).toBe(esperado)
  })

  it.each([
    ['', null],
    ['abc', null],
    ['1,2,3', null],
    [null, null],
  ])('%s → null', (texto, esperado) => {
    expect(leerNumero(texto)).toBe(esperado)
  })
})
