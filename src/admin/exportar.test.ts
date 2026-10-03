import { describe, expect, it } from 'vitest'
import { AJUSTES_POR_DEFECTO, type Catalogo } from '../catalogo/tipos'
import { hojasDelPanel } from './exportar'
import { rangoDelMes } from './resumen'

const catalogo: Catalogo = {
  ajustes: AJUSTES_POR_DEFECTO,
  unidades: [{ id: 'kg', nombre: 'kg', tipo: 'peso', archivada: false }],
  proveedores: [
    {
      id: 'tito',
      nombre: 'Verdulería Don Tito',
      whatsapp: '',
      dias_entrega: [],
      hora_limite: null,
      umbral_alerta_pct: null,
      activo: true,
    },
  ],
  productos: [
    {
      id: 'tomate',
      proveedor_id: 'tito',
      nombre: 'Tomate perita',
      unidad_base_id: 'kg',
      umbral_alerta_pct: null,
      activo: true,
      comparable_id: null,
    },
  ],
  presentaciones: [],
  precios: new Map(),
}

describe('hojasDelPanel', () => {
  const periodo = { nombre: 'Septiembre 2026', ...rangoDelMes('2026-09') }
  const hojas = hojasDelPanel(
    {
      recepciones: [
        {
          id: 'r1',
          local_id: 'centro',
          proveedor_id: 'tito',
          pedido_id: 'p1',
          pedido_numero: 137,
          recibido_at: '2026-09-26T13:00:00Z',
          nro_remito: '0001-123',
          total_remito: 58000,
          origen: 'ia',
          foto_path: null,
          observaciones: null,
          items: [
            {
              producto_id: 'tomate',
              cantidad_pedida_base: 26,
              cantidad_base: 20,
              precio_unit_base: 2900,
              subtotal: 58000,
              resultado: 'faltante',
            },
          ],
          diferencias: [
            {
              id: 'd1',
              producto_id: 'tomate',
              tipo: 'faltante',
              monto: -17400,
              detalle: 'Faltaron 6 kg de tomate',
              estado: 'reclamado',
            },
          ],
        },
      ],
      pedidos: [
        {
          id: 'p1',
          numero: 137,
          estado: 'revisar',
          local_id: 'centro',
          proveedor_id: 'tito',
          creado_at: '2026-09-25T18:00:00Z',
          enviado_at: null,
          pagado_at: null,
          estimado: 75400,
        },
      ],
      aPagar: [],
      precios: [
        {
          producto_id: 'tomate',
          proveedor_id: 'tito',
          precio_base: 2400,
          fecha: '2026-08-20T10:00:00Z',
        },
        {
          producto_id: 'tomate',
          proveedor_id: 'tito',
          precio_base: 2900,
          fecha: '2026-09-26T13:00:00Z',
        },
      ],
    },
    catalogo,
    periodo,
    new Map([['centro', 'Centro']]),
  )
  const hoja = (nombre: string) => hojas.find((h) => h.sheet === nombre)!.data
  const valores = (nombre: string) => hoja(nombre).map((fila) => fila.map((c) => c.value))

  it('arma las siete hojas', () => {
    expect(hojas.map((h) => h.sheet)).toEqual([
      'Resumen',
      'Compras por proveedor',
      'Pedidos',
      'Recepciones',
      'Diferencias',
      'Cambios de precio',
      'A pagar',
    ])
  })

  it('el resumen tiene los mismos números que el panel', () => {
    expect(valores('Resumen').slice(2)).toEqual([
      ['Compras del período', 58000],
      ['Proveedores con compras', 1],
      ['Pedidos hechos', 1],
      ['Pedidos en camino', 0],
      ['Cumplimiento promedio (%)', 0],
      ['Diferencias detectadas', 17400],
      ['Recepciones con diferencias', 1],
    ])
  })

  it('usa los nombres, no los ids, y los estados en castellano', () => {
    expect(valores('Pedidos')[1]!.slice(2)).toEqual([
      'Verdulería Don Tito',
      'Centro',
      'Revisar',
      75400,
    ])
    expect(valores('Diferencias')[1]!.slice(1)).toEqual([
      'Verdulería Don Tito',
      137,
      'Faltaron 6 kg de tomate',
      17400,
      'Reclamado',
    ])
    expect(valores('Cambios de precio')[1]!.slice(1)).toEqual([
      'Verdulería Don Tito',
      'Tomate perita',
      'kg',
      2400,
      2900,
      20.8,
      '',
    ])
  })
})
