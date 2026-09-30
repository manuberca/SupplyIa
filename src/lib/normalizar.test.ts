import { describe, expect, it } from 'vitest'
import { normalizar, normalizarUnidad } from './normalizar'

describe('normalizar', () => {
  it('ignora mayúsculas, tildes y espacios de más', () => {
    expect(normalizar('  Verdulería   DON Tito ')).toBe('verduleria don tito')
    expect(normalizar('Ñoquis')).toBe('ñoquis')
    expect(normalizar(null)).toBe('')
  })
})

describe('normalizarUnidad (igual que privado.normalizar_unidad en la base)', () => {
  it.each([
    ['Kilos', 'kg'],
    ['KG', 'kg'],
    ['kgs', 'kg'],
    ['Gramos', 'g'],
    ['grs', 'g'],
    ['Litros', 'lt'],
    ['l', 'lt'],
    ['u', 'unidad'],
    ['Unidades', 'unidad'],
    ['Cajas', 'caja'],
    ['cajón', 'cajon'],
    ['Cajones', 'cajon'],
    ['bidones', 'bidon'],
    ['Bidón', 'bidon'],
    ['atados', 'atado'],
    ['Maples', 'maple'],
    ['Barriles', 'barril'],
    ['paquetes', 'paquete'],
    ['gas', 'gas'],
    ['Six Pack', 'six pack'],
    ['  Docenas ', 'docena'],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarUnidad(entrada)).toBe(esperado)
  })
})
