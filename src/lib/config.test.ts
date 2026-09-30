import { describe, expect, it } from 'vitest'
import { revisarConfig } from './config'

const completa = {
  VITE_SUPABASE_URL: 'https://abc.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'x'.repeat(40),
}

describe('revisarConfig', () => {
  it('acepta la configuración completa, sin Sentry', () => {
    const r = revisarConfig(completa)
    expect(r.ok).toBe(true)
  })

  it('acepta el DSN de Sentry si está', () => {
    const r = revisarConfig({ ...completa, VITE_SENTRY_DSN: 'https://k@o1.ingest.sentry.io/2' })
    expect(r.ok && r.config.VITE_SENTRY_DSN).toBe('https://k@o1.ingest.sentry.io/2')
  })

  it('trata las variables vacías como faltantes', () => {
    const r = revisarConfig({
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      VITE_SENTRY_DSN: '',
    })
    expect(r).toEqual({
      ok: false,
      faltantes: ['Falta VITE_SUPABASE_URL', 'Falta VITE_SUPABASE_ANON_KEY'],
    })
  })

  it('dice qué falta cuando no hay nada', () => {
    const r = revisarConfig({})
    expect(r.ok).toBe(false)
    expect(!r.ok && r.faltantes).toEqual([
      'Falta VITE_SUPABASE_URL',
      'Falta VITE_SUPABASE_ANON_KEY',
    ])
  })
})
