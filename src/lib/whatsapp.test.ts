import { describe, expect, it } from 'vitest'
import { formatearWhatsapp, normalizarWhatsapp, whatsappParaEditar } from './whatsapp'

describe('normalizarWhatsapp', () => {
  it.each([
    ['341 555-1234', '+5493415551234'],
    ['0341 15 555-1234', '+5493415551234'],
    ['341 15 5551234', '+5493415551234'],
    ['+54 9 341 555 1234', '+5493415551234'],
    ['+54 341 555 1234', '+5493415551234'],
    ['5493415551234', '+5493415551234'],
    ['11 15 5555-1234', '+5491155551234'],
    ['011 5555-1234', '+5491155551234'],
    ['3464 15 123456', '+5493464123456'],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarWhatsapp(entrada)).toEqual({ ok: true, numero: esperado })
  })

  it('pide el código de área si falta', () => {
    const r = normalizarWhatsapp('555-1234')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.mensaje).toMatch(/código de área/)
  })

  it('avisa si sobran dígitos o está vacío', () => {
    expect(normalizarWhatsapp('341 555 1234 99').ok).toBe(false)
    const vacio = normalizarWhatsapp('  ')
    expect(!vacio.ok && vacio.mensaje).toMatch(/Escribí el WhatsApp/)
  })
})

describe('formatearWhatsapp', () => {
  it('lo muestra fácil de leer', () => {
    expect(formatearWhatsapp('+5493415551234')).toBe('+54 9 341 555-1234')
    expect(formatearWhatsapp('+5491155551234')).toBe('+54 9 11 5555-1234')
    expect(whatsappParaEditar('+5493415551234')).toBe('341 555-1234')
  })
})
