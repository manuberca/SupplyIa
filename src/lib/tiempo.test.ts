import { describe, expect, it } from 'vitest'
import { diaSemana, diasHastaEntrega, hace, textoProximaEntrega } from './tiempo'

// Martes 29 de septiembre de 2026, 10:00
const ahora = new Date(2026, 8, 29, 10, 0)

describe('hace', () => {
  it.each([
    [new Date(2026, 8, 29, 9, 59, 30), 'recién'],
    [new Date(2026, 8, 29, 9, 55), 'hace 5 min'],
    [new Date(2026, 8, 29, 7, 30), 'hace 2 h'],
    [new Date(2026, 8, 28, 22, 0), 'ayer'],
    [new Date(2026, 8, 23, 12, 0), 'hace 6 días'],
    [new Date(2026, 5, 29, 12, 0), 'hace 3 meses'],
  ])('%s → %s', (fecha, esperado) => {
    expect(hace(fecha, ahora)).toBe(esperado)
  })
})

describe('entregas', () => {
  it('el martes es el día 2', () => {
    expect(diaSemana(ahora)).toBe(2)
  })

  it('cuenta los días hasta la próxima entrega', () => {
    expect(diasHastaEntrega([2, 5], ahora)).toBe(0)
    expect(diasHastaEntrega([3], ahora)).toBe(1)
    expect(diasHastaEntrega([1], ahora)).toBe(6)
    expect(diasHastaEntrega([], ahora)).toBeNull()
  })

  it('lo dice en castellano', () => {
    expect(textoProximaEntrega([2], ahora)).toBe('Entrega hoy')
    expect(textoProximaEntrega([3], ahora)).toBe('Entrega mañana')
    expect(textoProximaEntrega([4, 6], ahora)).toBe('Entrega el jueves')
    expect(textoProximaEntrega([1], ahora)).toBe('Entrega el lunes')
    expect(textoProximaEntrega([], ahora)).toBe('Sin días fijos')
  })
})
