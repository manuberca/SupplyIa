import { describe, expect, it } from 'vitest'
import { errorEnUrl, mensajeErrorAuth, SIN_CONEXION } from './errores-auth'

describe('mensajeErrorAuth', () => {
  it('traduce los errores conocidos', () => {
    expect(mensajeErrorAuth({ code: 'invalid_credentials' })).toMatch(/no coinciden/)
    expect(mensajeErrorAuth({ code: 'otp_expired' })).toMatch(/Pedí uno nuevo/)
  })

  it('reconoce un mail sin acceso aunque venga sin código', () => {
    expect(mensajeErrorAuth({ message: 'Signups not allowed for otp' })).toMatch(/no tiene acceso/)
  })

  it('reconoce la falta de conexión', () => {
    expect(mensajeErrorAuth({ name: 'AuthRetryableFetchError', status: 0 })).toBe(SIN_CONEXION)
  })

  it('siempre devuelve algo que leer ante un error desconocido', () => {
    expect(mensajeErrorAuth({ code: 'algo_raro' })).toMatch(/Probá de nuevo/)
  })

  it('sin error no hay mensaje', () => {
    expect(mensajeErrorAuth(null)).toBe('')
  })
})

describe('errorEnUrl', () => {
  it('lee el error del enlace del mail', () => {
    const url = new URL('http://localhost:5173/#error=access_denied&error_code=otp_expired')
    expect(errorEnUrl(url)).toMatch(/venció/)
  })

  it('no inventa errores', () => {
    expect(errorEnUrl(new URL('http://localhost:5173/'))).toBe('')
  })
})
