import { describe, expect, it } from 'vitest'
import { plataformaDe } from './instalar'

describe('plataformaDe', () => {
  it('iPhone y iPad (también el iPad que dice ser Mac)', () => {
    expect(plataformaDe('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('iphone')
    expect(plataformaDe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('iphone')
  })
  it('Android', () => {
    expect(plataformaDe('Mozilla/5.0 (Linux; Android 14; Pixel 7)', 5)).toBe('android')
  })
  it('computadora (Mac sin pantalla táctil, Windows)', () => {
    expect(plataformaDe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('computadora')
    expect(plataformaDe('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('computadora')
  })
})
