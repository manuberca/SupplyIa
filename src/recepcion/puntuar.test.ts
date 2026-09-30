import { describe, expect, it } from 'vitest'
import type { Lectura } from './lectura'
import { parecido, puntuar } from './puntuar'

const linea = (
  texto: string,
  cantidad: number,
  precioUnit: number,
  productoId: string | null = null,
) => ({
  texto,
  productoId,
  cantidad,
  unidad: 'kg',
  precioUnit,
  descuentoLinea: null,
  subtotal: cantidad * precioUnit,
  confianza: 'alta' as const,
  observacion: '',
  esPromo: false,
})
const lectura = (lineas: Lectura['lineas'], nro = '0023-00008686', total = 3000): Lectura => ({
  nroRemito: nro,
  fecha: null,
  proveedorDetectado: null,
  totales: { subtotalNeto: null, descuentoGlobal: null, iva: null, percepciones: null, total },
  lineas,
  validacion: { estado: 'OK', observaciones: [] },
  observaciones: '',
})
const verdad = {
  nro: '0023-00008686',
  total: 3000,
  items: [
    {
      texto: 'PALADINI J COCIDO X6KG',
      producto: 'Jamón Cocido Paladini',
      cantidad: 1,
      precio: 1000,
      subtotal: 1000,
    },
    { texto: 'Queso Dambo', producto: 'Queso Dambo', cantidad: 2, precio: 1000, subtotal: 2000 },
  ],
}
const nombres: Record<string, string> = { a: 'Jamón Cocido Paladini', b: 'Queso Dambo' }

describe('puntuar', () => {
  it('todo bien: 10 de 10', () => {
    const p = puntuar(
      lectura([linea('Queso Dambo', 2, 1000, 'b'), linea('PALADINI J COCIDO X6KG', 1, 1000, 'a')]),
      verdad,
      (id) => nombres[id],
    )
    expect([p.aciertos, p.campos]).toEqual([10, 10])
    expect(p.sobrantes).toEqual([])
  })

  it('cuenta lo que está mal, lo que falta y lo que sobra', () => {
    const p = puntuar(
      lectura(
        [linea('PALADINI J COCIDO X 6KG', 7, 1000, null), linea('BOLSA', 1, 0)],
        '0023-00008688',
        3100,
      ),
      verdad,
      (id) => nombres[id],
    )
    expect(p.nro).toBe(false)
    expect(p.total).toBe(false)
    expect(p.renglones[0]).toMatchObject({
      encontrado: true,
      cantidad: false,
      precio: true,
      producto: false,
    })
    expect(p.renglones[1]?.encontrado).toBe(false)
    expect(p.sobrantes).toEqual(['BOLSA'])
  })

  it('parecido entre textos', () => {
    expect(parecido('PALADINI J COCIDO X6KG', 'Paladini j. cocido x6kg')).toBe(1)
    expect(parecido('Queso Dambo', 'Queso Provolone')).toBe(0.5)
    expect(parecido('', 'algo')).toBe(0)
  })

  it('si el producto esperado no existe en el catálogo, el producto no se puntúa', () => {
    const p = puntuar(
      lectura([linea('Queso Dambo', 2, 1000, null), linea('PALADINI J COCIDO X6KG', 1, 1000, 'a')]),
      verdad,
      (id) => nombres[id],
      (nombre) => nombre !== 'Queso Dambo',
    )
    expect(p.renglones.find((r) => r.texto === 'Queso Dambo')?.producto).toBeNull()
    expect([p.aciertos, p.campos]).toEqual([9, 9])
  })
})
