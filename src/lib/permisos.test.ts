import { describe, expect, it } from 'vitest'
import { puede, rolSchema } from './permisos'

describe('permisos por rol', () => {
  it('administración entra a todo', () => {
    for (const s of [
      'inicio',
      'pedir',
      'pedidos',
      'recibir',
      'proveedores',
      'precios',
      'cuenta',
      'ajustes_org',
    ] as const) {
      expect(puede('admin', s)).toBe(true)
    }
  })

  it('encargado hace todo menos los ajustes de la organización', () => {
    expect(puede('encargado', 'pedir')).toBe(true)
    expect(puede('encargado', 'proveedores')).toBe(true)
    expect(puede('encargado', 'ajustes_org')).toBe(false)
  })

  it('recepción solo recibe y ve el inicio', () => {
    expect(puede('recepcion', 'inicio')).toBe(true)
    expect(puede('recepcion', 'recibir')).toBe(true)
    expect(puede('recepcion', 'cuenta')).toBe(true)
    expect(puede('recepcion', 'pedidos')).toBe(true)
    expect(puede('recepcion', 'pedir')).toBe(false)
    expect(puede('recepcion', 'proveedores')).toBe(false)
    expect(puede('recepcion', 'precios')).toBe(false)
    expect(puede('recepcion', 'ajustes_org')).toBe(false)
  })

  it('rechaza roles desconocidos', () => {
    expect(rolSchema.safeParse('dueño').success).toBe(false)
  })
})
