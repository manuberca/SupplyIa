import { describe, expect, it } from 'vitest'
import { AJUSTES_POR_DEFECTO, type Catalogo } from '../catalogo/tipos'
import { borradorDesdePedido } from './borrador'

const producto = (id: string, activo = true) => ({
  id,
  proveedor_id: 'prov',
  nombre: id,
  unidad_base_id: 'kg',
  umbral_alerta_pct: null,
  activo,
})
const catalogo: Catalogo = {
  ajustes: AJUSTES_POR_DEFECTO,
  unidades: [{ id: 'kg', nombre: 'kg', tipo: 'peso', archivada: false }],
  proveedores: [],
  productos: [producto('tomate'), producto('papa'), producto('viejo', false)],
  presentaciones: [
    { id: 'caja', producto_id: 'tomate', nombre: 'Caja', factor_a_base: 18, aproximada: false },
  ],
  precios: new Map(),
}

describe('borradorDesdePedido', () => {
  it('copia cantidades y presentaciones, con los números como se escriben acá', () => {
    const { borrador, omitidos } = borradorDesdePedido(
      [
        { producto_id: 'tomate', presentacion_id: 'caja', cantidad: 2 },
        { producto_id: 'papa', presentacion_id: null, cantidad: 12.5 },
      ],
      catalogo,
    )
    expect(borrador).toEqual({
      cantidades: {
        tomate: { texto: '2', presentacionId: 'caja' },
        papa: { texto: '12,5', presentacionId: null },
      },
      observaciones: '',
    })
    expect(omitidos).toEqual([])
  })

  it('deja afuera lo que ya no se puede pedir igual, y lo avisa', () => {
    const { borrador, omitidos } = borradorDesdePedido(
      [
        { producto_id: 'viejo', presentacion_id: null, cantidad: 1 },
        { producto_id: 'papa', presentacion_id: 'bolsa-que-ya-no-existe', cantidad: 3 },
        { producto_id: 'borrado', presentacion_id: null, cantidad: 1 },
        { producto_id: 'tomate', presentacion_id: null, cantidad: 4 },
      ],
      catalogo,
    )
    expect(Object.keys(borrador.cantidades)).toEqual(['tomate'])
    expect(omitidos).toEqual(['viejo', 'papa', 'Un producto que ya no está'])
  })
})
