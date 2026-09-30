import { describe, expect, it } from 'vitest'
import { leerDias, textoDias } from './dias'

describe('textoDias', () => {
  it.each([
    [[1, 2, 3, 4, 5, 6], 'Lun a sáb'],
    [[1, 3, 5], 'Lun, mié y vie'],
    [[2, 4], 'Mar y jue'],
    [[6], 'Sáb'],
    [[1, 2, 3, 4, 5, 6, 7], 'Todos los días'],
    [[], 'Sin días fijos'],
    [[5, 1, 3, 3], 'Lun, mié y vie'],
  ])('%j → %s', (dias, esperado) => {
    expect(textoDias(dias)).toBe(esperado)
  })
})

describe('leerDias (planilla de Excel)', () => {
  it.each([
    ['lun a sáb', [1, 2, 3, 4, 5, 6]],
    ['Lunes a Viernes', [1, 2, 3, 4, 5]],
    ['lun-vie', [1, 2, 3, 4, 5]],
    ['L M X J V', [1, 2, 3, 4, 5]],
    ['lunes, miércoles y viernes', [1, 3, 5]],
    ['Mar y Jue', [2, 4]],
    ['sábado', [6]],
    ['todos', [1, 2, 3, 4, 5, 6, 7]],
    ['vie a lun', [1, 5, 6, 7]],
    ['', []],
  ])('%s', (texto, esperado) => {
    expect(leerDias(texto)).toEqual({ ok: true, dias: esperado })
  })

  it('dice qué no entendió', () => {
    const r = leerDias('lun, feriados')
    expect(!r.ok && r.mensaje).toMatch(/No entiendo "feriados"/)
  })
})
