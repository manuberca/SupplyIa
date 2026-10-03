import { describe, expect, it } from 'vitest'
import { redondearParaPedir, sugerirPedido, type CompraAnterior } from './sugerido'

const compra = (
  dia: number,
  items: [producto: string, cantidad: number, presentacion?: string][],
): CompraAnterior => ({
  fecha: `2026-09-${String(dia).padStart(2, '0')}T10:00:00Z`,
  items: items.map(([productoId, cantidad, presentacionId = null]) => ({
    productoId,
    cantidad,
    presentacionId: presentacionId as string | null,
  })),
})

describe('sugerirPedido', () => {
  it('con una sola compra todavía no sugiere nada', () => {
    expect(sugerirPedido([compra(1, [['tomate', 10]])])).toEqual({ sugerencias: [], compras: 1 })
  })

  it('sugiere lo habitual, con la cantidad del medio', () => {
    const { sugerencias, compras } = sugerirPedido([
      compra(1, [
        ['tomate', 10],
        ['papa', 20],
      ]),
      compra(8, [
        ['tomate', 12],
        ['papa', 20],
        ['rúcula', 3],
      ]),
      compra(15, [
        ['tomate', 30],
        ['papa', 25],
      ]),
      compra(22, [['tomate', 12]]),
    ])
    expect(compras).toBe(4)
    // Tomate: 10, 12, 12, 30 → 12 (una compra grande no lo distorsiona). Papa: 20, 20, 25 → 20.
    // La rúcula vino una sola vez: no se sugiere.
    expect(sugerencias).toEqual([
      { productoId: 'tomate', cantidad: 12, presentacionId: null, veces: 4, habitual: true },
      { productoId: 'papa', cantidad: 20, presentacionId: null, veces: 3, habitual: true },
    ])
  })

  it('lo que se compra cada tanto guía la cantidad, pero no entra en "usar sugerido"', () => {
    const { sugerencias } = sugerirPedido([
      compra(1, [
        ['papa', 20],
        ['zapallo', 4],
      ]),
      compra(4, [['papa', 20]]),
      compra(8, [['papa', 20]]),
      compra(11, [
        ['papa', 20],
        ['zapallo', 6],
      ]),
      compra(15, [['papa', 20]]),
      compra(18, [['papa', 20]]),
    ])
    expect(sugerencias.map((s) => [s.productoId, s.cantidad, s.habitual])).toEqual([
      ['papa', 20, true],
      ['zapallo', 5, false],
    ])
  })

  it('mira solo las últimas 6 compras', () => {
    const viejas = [1, 2, 3].map((d) => compra(d, [['viejo', 5]]))
    const nuevas = [10, 11, 12, 13, 14, 15].map((d) => compra(d, [['nuevo', 2]]))
    expect(sugerirPedido([...viejas, ...nuevas]).sugerencias.map((s) => s.productoId)).toEqual([
      'nuevo',
    ])
  })

  it('usa la presentación más pedida y no mezcla cantidades de otra', () => {
    const { sugerencias } = sugerirPedido([
      compra(1, [['tomate', 2, 'caja']]),
      compra(8, [['tomate', 36]]), // esa vez se pidió por kg
      compra(15, [['tomate', 3, 'caja']]),
      compra(22, [['tomate', 2, 'caja']]),
    ])
    expect(sugerencias).toEqual([
      { productoId: 'tomate', cantidad: 2, presentacionId: 'caja', veces: 4, habitual: true },
    ])
  })

  it('si sale de lo recibido (sin pedidos), redondea a un número cómodo para pedir', () => {
    const { sugerencias } = sugerirPedido(
      [
        compra(1, [
          ['vacío', 11.6],
          ['ajo', 1.3],
        ]),
        compra(8, [
          ['vacío', 12.2],
          ['ajo', 1.2],
        ]),
      ],
      { redondear: true },
    )
    expect(sugerencias.map((s) => [s.productoId, s.cantidad])).toEqual([
      ['vacío', 12],
      ['ajo', 1.5],
    ])
  })

  it('redondearParaPedir', () => {
    expect([0.2, 1.3, 2.74, 2.76, 3.4, 11.6].map(redondearParaPedir)).toEqual([
      0.5, 1.5, 2.5, 3, 3, 12,
    ])
  })
})
