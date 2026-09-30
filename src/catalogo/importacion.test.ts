import { describe, expect, it } from 'vitest'
import {
  COLUMNAS_PRODUCTOS,
  COLUMNAS_PROVEEDORES,
  prepararImportacion,
  textoCelda,
  type Celda,
} from './importacion'
import { AJUSTES_POR_DEFECTO, type Catalogo } from './tipos'

const catalogo: Catalogo = {
  ajustes: AJUSTES_POR_DEFECTO,
  unidades: [
    { id: 'u-kg', nombre: 'kg', tipo: 'peso', archivada: false },
    { id: 'u-unidad', nombre: 'unidad', tipo: 'unidad', archivada: false },
    { id: 'u-caja', nombre: 'caja', tipo: 'unidad', archivada: false },
    { id: 'u-vieja', nombre: 'balde', tipo: 'unidad', archivada: true },
  ],
  proveedores: [
    {
      id: 'p-tito',
      nombre: 'Verdulería Don Tito',
      whatsapp: '+5493415550000',
      dias_entrega: [],
      hora_limite: null,
      umbral_alerta_pct: null,
      activo: true,
    },
  ],
  productos: [
    {
      id: 'x-papa',
      proveedor_id: 'p-tito',
      nombre: 'Papa',
      unidad_base_id: 'u-kg',
      umbral_alerta_pct: null,
      activo: true,
    },
  ],
  presentaciones: [],
  precios: new Map(),
}

let n = 0
const ids = () => `id-${++n}`

function importar(proveedores: Celda[][], productos: Celda[][] = []) {
  n = 0
  return prepararImportacion(
    [
      { nombre: 'Proveedores', filas: [[...COLUMNAS_PROVEEDORES], ...proveedores] },
      { nombre: 'Productos', filas: [[...COLUMNAS_PRODUCTOS], ...productos] },
    ],
    catalogo,
    ids,
  )
}

describe('prepararImportacion', () => {
  it('arma proveedores y productos en caja y en kg, con equivalencia y precio', () => {
    const r = importar(
      [['Frigorífico San Jorge', '0341 15 444-1234', 'lun a sáb', 0.75]],
      [
        ['Frigorífico San Jorge', 'Vacío', 'kg', 'Pieza', '≈ 4,5', 'VACIO X KG', '$ 12.500'],
        ['Frigorífico San Jorge', 'Vacío', 'kg', 'Caja', '20', '', ''],
        ['Verdulería Don Tito', 'Lechuga', 'Unidades', 'Jaula', 12, '', 1450],
      ],
    )
    expect(r.errores).toEqual([])
    expect(r.datos.proveedores).toEqual([
      {
        id: 'id-1',
        nombre: 'Frigorífico San Jorge',
        whatsapp: '+5493414441234',
        dias_entrega: [1, 2, 3, 4, 5, 6],
        hora_limite: '18:00',
      },
    ])
    expect(r.datos.productos).toEqual([
      { id: 'id-2', proveedor_id: 'id-1', nombre: 'Vacío', unidad_base_id: 'u-kg' },
      { id: 'id-7', proveedor_id: 'p-tito', nombre: 'Lechuga', unidad_base_id: 'u-unidad' },
    ])
    expect(r.datos.presentaciones.map((p) => [p.nombre, p.factor_a_base, p.aproximada])).toEqual([
      ['Pieza', 4.5, true],
      ['Caja', 20, false],
      ['Jaula', 12, false],
    ])
    expect(r.datos.equivalencias).toEqual([
      { id: 'id-4', proveedor_id: 'id-1', texto_remito: 'VACIO X KG', producto_id: 'id-2' },
    ])
    expect(r.datos.precios.map((p) => [p.producto_id, p.precio_base])).toEqual([
      ['id-2', 12500],
      ['id-7', 1450],
    ])
  })

  it('lo que ya estaba cargado se deja como está y se avisa', () => {
    const r = importar(
      [['verduleria don tito', '341 555-9999', '', '']],
      [['Verdulería Don Tito', 'PAPA', 'kg', 'Bolsa', 25, '', '']],
    )
    expect(r.errores).toEqual([])
    expect(r.avisos.map((a) => a.mensaje)).toEqual([
      '"verduleria don tito" ya estaba cargado: se deja como está.',
      'PAPA (Verdulería Don Tito) ya estaba cargado: se deja como está.',
    ])
    expect(r.datos.proveedores).toEqual([])
    expect(r.datos.productos).toEqual([])
  })

  it('marca los errores por fila, con qué hacer', () => {
    const r = importar(
      [
        ['Lácteos del Sur', '555-1234', '', ''],
        ['Panadería', '341 555-0000', '', ''],
        ['Pescadería', '341 555-2222', 'feriados', ''],
        ['Pescadería', '341 555-3333', '', ''],
      ],
      [
        ['Almacén Fantasma', 'Arroz', 'kg', '', '', '', ''],
        ['Verdulería Don Tito', 'Batata', 'balde', '', '', '', ''],
        ['Verdulería Don Tito', 'Zapallo', 'kg', 'Bolsa', '', '', ''],
        ['Verdulería Don Tito', 'Zanahoria', 'kg', '', '', '', 'caro'],
        ['Verdulería Don Tito', '', 'kg', '', '', '', ''],
        ['Lácteos del Sur', 'Leche', 'lt', '', '', '', ''],
      ],
    )
    expect(r.errores.map((e) => `${e.hoja} ${e.fila}: ${e.mensaje}`)).toEqual([
      'Proveedores 2: Lácteos del Sur: Falta el código de área. Escribilo así: 341 555-1234.',
      'Proveedores 3: Panadería: ese WhatsApp ya lo tiene Verdulería Don Tito.',
      'Proveedores 4: Pescadería: No entiendo "feriados" como día. Escribilo así: "lun a sáb" o "L M X J V".',
      'Proveedores 5: "Pescadería" está repetido en la planilla.',
      'Productos 2: El proveedor "Almacén Fantasma" no está en la hoja Proveedores ni cargado en la app.',
      'Productos 3: Batata: la unidad "balde" no existe. Usá una de estas: kg, unidad, caja (o creala en Ajustes).',
      'Productos 4: Zapallo: poné cuántos kg trae la presentación "Bolsa" (un número mayor a 0).',
      'Productos 5: Zanahoria: el último precio "caro" no es un número.',
      'Productos 6: Falta el nombre del producto.',
      'Productos 7: Leche: el proveedor "Lácteos del Sur" tiene un error en la hoja Proveedores. Corregilo primero.',
    ])
  })

  it('no acepta un producto con dos unidades distintas', () => {
    const r = importar(
      [],
      [
        ['Verdulería Don Tito', 'Cebolla', 'kg', '', '', '', ''],
        ['Verdulería Don Tito', 'Cebolla', 'unidad', '', '', '', ''],
      ],
    )
    expect(r.errores[0]?.mensaje).toMatch(/en otra fila tiene otra unidad/)
  })

  it('encuentra las columnas en cualquier orden y avisa si faltan', () => {
    n = 0
    const r = prepararImportacion(
      [
        {
          nombre: 'proveedores',
          filas: [
            ['WhatsApp', 'NOMBRE'],
            ['341 555-7777', 'Huevos Pepe'],
          ],
        },
      ],
      catalogo,
      ids,
    )
    expect(r.errores).toEqual([])
    expect(r.datos.proveedores[0]).toMatchObject({
      nombre: 'Huevos Pepe',
      whatsapp: '+5493415557777',
    })

    const sin = prepararImportacion(
      [{ nombre: 'Productos', filas: [['Cosa', 'Otra']] }],
      catalogo,
      ids,
    )
    expect(sin.errores[0]?.mensaje).toMatch(/No encontramos las columnas "Proveedor" y "Producto"/)
  })

  it('avisa si no es la plantilla', () => {
    const r = prepararImportacion([{ nombre: 'Hoja1', filas: [] }], catalogo, ids)
    expect(r.errores[0]?.mensaje).toMatch(/No tiene las hojas "Proveedores" ni "Productos"/)
  })
})

describe('textoCelda', () => {
  it('pasa las horas de Excel a texto', () => {
    expect(textoCelda(new Date(Date.UTC(1899, 11, 30, 11, 30)))).toBe('11:30')
    expect(textoCelda(3415551234)).toBe('3415551234')
    expect(textoCelda(null)).toBe('')
  })
})
