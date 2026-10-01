import { describe, expect, it } from 'vitest'
import { formaDeClave } from './forma-clave'

const jwt = (datos: object) =>
  `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(datos)).replace(/=+$/, '')}.firma-que-no-se-mira`

describe('formaDeClave', () => {
  it('de un JWT de Supabase dice el rol y el proyecto, nunca la clave', () => {
    const clave = jwt({ iss: 'supabase', ref: 'abcd1234', role: 'service_role' })
    const forma = formaDeClave(clave)
    expect(forma).toEqual({
      largo: clave.length,
      formato: 'jwt',
      rol: 'service_role',
      proyecto: 'abcd1234',
    })
    expect(JSON.stringify(forma)).not.toContain('firma')
  })
  it('distingue la clave pública de la de servicio', () => {
    expect(formaDeClave(jwt({ ref: 'x', role: 'anon' })).rol).toBe('anon')
  })
  it('un pedazo de clave o cualquier otro texto es "otro"', () => {
    expect(formaDeClave('yJhbGciOi.cortada')).toEqual({ largo: 17, formato: 'otro' })
    expect(formaDeClave('eyJ.no-es-base64.x').formato).toBe('otro')
  })
  it('reconoce los otros formatos y la vacía', () => {
    expect(formaDeClave('sb_secret_abc').formato).toBe('sb_secret')
    expect(formaDeClave('sk-ant-usr-abc').formato).toBe('anthropic')
    expect(formaDeClave('')).toEqual({ largo: 0, formato: 'vacía' })
  })
})
