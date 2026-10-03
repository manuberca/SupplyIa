import { describe, expect, it } from 'vitest'
import { primerosPasos, type Avance } from './primeros-pasos'

const nuevo: Avance = {
  rol: 'admin',
  productos: 0,
  equipo: 1,
  hayPedidos: false,
  hayRecepciones: false,
  instalada: false,
}

describe('primerosPasos', () => {
  it('un bar recién creado tiene todo por hacer, en orden', () => {
    const pasos = primerosPasos(nuevo)
    expect(pasos.map((p) => p.clave)).toEqual([
      'catalogo',
      'equipo',
      'pedido',
      'recepcion',
      'instalar',
    ])
    expect(pasos.every((p) => !p.hecho)).toBe(true)
  })

  it('va tildando lo que ya está', () => {
    const pasos = primerosPasos({ ...nuevo, productos: 12, equipo: 3, hayPedidos: true })
    expect(pasos.filter((p) => p.hecho).map((p) => p.clave)).toEqual([
      'catalogo',
      'equipo',
      'pedido',
    ])
  })

  it('administración sola no cuenta como equipo', () => {
    expect(primerosPasos({ ...nuevo, equipo: 1 }).find((p) => p.clave === 'equipo')?.hecho).toBe(
      false,
    )
  })

  it('a cada rol le aparece solo lo que puede hacer', () => {
    expect(primerosPasos({ ...nuevo, rol: 'encargado', equipo: null }).map((p) => p.clave)).toEqual(
      ['catalogo', 'pedido', 'recepcion', 'instalar'],
    )
    expect(primerosPasos({ ...nuevo, rol: 'recepcion', equipo: null }).map((p) => p.clave)).toEqual(
      ['recepcion', 'instalar'],
    )
  })
})
