import { describe, expect, it } from 'vitest'
import { convieneEnderezar, mejorLectura } from './enderezar'
import type { Lectura } from './lectura'

const linea = (
  confianza: 'alta' | 'media' | 'baja',
  esPromo = false,
): Lectura['lineas'][number] => ({
  texto: 'x',
  productoId: null,
  cantidad: 1,
  unidad: 'u',
  precioUnit: 1,
  descuentoLinea: null,
  subtotal: 1,
  confianza,
  observacion: '',
  esPromo,
})
const lectura = (giro: Lectura['giro'], confianzas: ('alta' | 'media' | 'baja')[]): Lectura => ({
  giro,
  nroRemito: null,
  fecha: null,
  proveedorDetectado: null,
  totales: {
    subtotalNeto: null,
    descuentoGlobal: null,
    iva: null,
    percepciones: null,
    total: null,
  },
  lineas: confianzas.map((c) => linea(c)),
  validacion: { estado: 'OK', observaciones: [] },
  observaciones: '',
  incompleta: false,
})

describe('convieneEnderezar', () => {
  it('derecha: nunca', () => {
    expect(convieneEnderezar(lectura(0, ['baja', 'baja', 'baja']))).toBeNull()
  })
  it('de costado pero bien leída: no se gasta otra lectura', () => {
    expect(convieneEnderezar(lectura(90, ['alta', 'alta', 'media', 'alta']))).toBeNull()
    expect(convieneEnderezar(lectura(270, ['alta', 'baja', 'alta', 'alta']))).toBeNull()
  })
  it('de costado y con varios renglones dudosos: sí, con el giro que dijo la IA', () => {
    expect(convieneEnderezar(lectura(270, ['baja', 'baja', 'alta', 'alta']))).toBe(270)
    // En una boleta larga hacen falta más dudosos (un cuarto de los renglones).
    const larga = lectura(90, [...Array<'alta'>(10).fill('alta'), 'baja', 'baja'])
    expect(convieneEnderezar(larga)).toBeNull()
  })
  it('de costado y sin ningún renglón leído: sí', () => {
    expect(convieneEnderezar(lectura(180, []))).toBe(180)
  })
})

describe('mejorLectura', () => {
  it('se queda con la que tiene menos renglones dudosos', () => {
    const primera = lectura(270, ['baja', 'baja', 'baja', 'alta'])
    const enderezada = lectura(0, ['alta', 'alta', 'baja', 'alta'])
    expect(mejorLectura(primera, enderezada)).toBe(enderezada)
    expect(mejorLectura(enderezada, primera)).toBe(enderezada)
  })
  it('si la enderezada no leyó nada, vale la primera', () => {
    const primera = lectura(90, ['baja', 'baja'])
    expect(mejorLectura(primera, lectura(0, []))).toBe(primera)
  })
})
