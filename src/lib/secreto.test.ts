import { describe, expect, it } from 'vitest'
import { limpiarSecreto } from './secreto'

describe('limpiarSecreto', () => {
  it('una clave bien pegada queda igual', () => {
    expect(limpiarSecreto('CLAVE', 'eyJabc.def-123_x')).toEqual({
      valor: 'eyJabc.def-123_x',
      corregido: false,
    })
  })

  it.each([
    ['con salto de línea al final', 'eyJabc.def\n'],
    ['con espacios alrededor', '  eyJabc.def  '],
    ['entre comillas', '"eyJabc.def"'],
    ['el renglón entero del archivo', 'CLAVE=eyJabc.def'],
    ['renglón entero, con comillas y salto', 'CLAVE="eyJabc.def"\r\n'],
    ['partida en dos líneas', 'eyJabc\n.def'],
    [
      'varios renglones del archivo, con el de la clave entre ellos',
      'VITE_SENTRY_DSN=https://x@sentry.io/1\nCLAVE=eyJabc.def\nOTRA=zzz\n',
    ],
    ['el renglón de la clave y uno vacío después', 'CLAVE=eyJabc.def\n\n'],
  ])('%s', (_caso, crudo) => {
    expect(limpiarSecreto('CLAVE', crudo)).toEqual({ valor: 'eyJabc.def', corregido: true })
  })

  it('si falta, queda vacía', () => {
    expect(limpiarSecreto('CLAVE', undefined)).toEqual({ valor: '', corregido: false })
  })
})
