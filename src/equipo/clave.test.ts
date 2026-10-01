import { describe, expect, it } from 'vitest'
import { generarClave } from './clave'

describe('generarClave', () => {
  it('tres grupos de cuatro, sin caracteres que se confunden', () => {
    for (let i = 0; i < 200; i++) {
      expect(generarClave()).toMatch(/^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/)
    }
  })

  it('no se repite', () => {
    const claves = new Set(Array.from({ length: 500 }, generarClave))
    expect(claves.size).toBe(500)
  })
})
