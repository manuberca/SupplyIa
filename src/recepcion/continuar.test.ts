import { describe, expect, it } from 'vitest'
import { pistaDelUltimo, rescatarParcial, unirLecturas } from './continuar'
import type { Lectura, SalidaModelo } from './lectura'

const item = (texto: string, cantidad = 2, subtotal: number | null = 200) => ({
  texto_remito: texto,
  producto_ref: null,
  cantidad,
  unidad: 'u',
  precio_unit: subtotal === null ? null : subtotal / cantidad,
  descuento_linea: null,
  subtotal,
  confianza: 'alta' as const,
  observacion: '',
})
const salida = (items: SalidaModelo['items']): SalidaModelo => ({
  giro: '0',
  nro_remito: '0001-00001234',
  fecha: '03/10/2026',
  proveedor_detectado: 'Vinesco',
  subtotal_neto: 600,
  descuento_global: null,
  iva: 126,
  percepciones: null,
  total: 726,
  items,
  observaciones: 'todo legible',
})

describe('rescatarParcial', () => {
  const entero = JSON.stringify(
    salida([item('MALBEC 750'), item('CABERNET {raro} "x"'), item('SYRAH')]),
  )

  it('de una respuesta cortada en el medio de un renglón, deja los que salieron enteros', () => {
    const corte = entero.indexOf('SYRAH') + 3
    const r = rescatarParcial(entero.slice(0, corte))
    expect(r?.items.map((i) => i.texto_remito)).toEqual(['MALBEC 750', 'CABERNET {raro} "x"'])
    // El encabezado y los totales van antes que los renglones: no se pierden.
    expect(r).toMatchObject({ nro_remito: '0001-00001234', total: 726, subtotal_neto: 600 })
    expect(r?.observaciones).toBe('')
  })

  it('las llaves y comillas dentro de un texto no lo confunden', () => {
    const corte = entero.indexOf('{raro}') + 8
    expect(rescatarParcial(entero.slice(0, corte))?.items).toHaveLength(1)
  })

  it('cortada justo después de los renglones, los trae todos', () => {
    const corte = entero.indexOf('"observaciones"') + 5
    expect(rescatarParcial(entero.slice(0, corte))?.items).toHaveLength(3)
  })

  it('sin ningún renglón entero no hay nada que rescatar', () => {
    expect(rescatarParcial(entero.slice(0, entero.indexOf('MALBEC') + 4))).toBeNull()
    expect(rescatarParcial('')).toBeNull()
    expect(rescatarParcial('{"giro":"0","nro_rem')).toBeNull()
  })
})

describe('pistaDelUltimo', () => {
  it('describe el renglón con su cantidad y su total, en números de acá', () => {
    expect(pistaDelUltimo(item('MALBEC 750', 6, 45300.5))).toBe(
      '"MALBEC 750" · cantidad 6 · total de línea 45.300,5',
    )
    expect(pistaDelUltimo({ ...item('SIN PRECIO'), cantidad: null, subtotal: null })).toBe(
      '"SIN PRECIO"',
    )
  })
})

const linea = (texto: string, subtotal = 200): Lectura['lineas'][number] => ({
  texto,
  productoId: null,
  cantidad: 2,
  unidad: 'u',
  precioUnit: subtotal / 2,
  descuentoLinea: null,
  subtotal,
  confianza: 'alta',
  observacion: '',
  esPromo: false,
})
const lectura = (lineas: Lectura['lineas'], total: number | null = 726): Lectura => ({
  giro: 0,
  nroRemito: '0001-00001234',
  fecha: null,
  proveedorDetectado: null,
  totales: { subtotalNeto: 600, descuentoGlobal: null, iva: 126, percepciones: null, total },
  lineas,
  validacion: { estado: 'Revisar', observaciones: ['La suma de los renglones no da el neto.'] },
  observaciones: '',
  incompleta: false,
})

describe('unirLecturas', () => {
  it('pega la continuación atrás y controla las cuentas de la boleta entera', () => {
    const r = unirLecturas(lectura([linea('A'), linea('B')]), lectura([linea('C')]))
    expect(r.lineas.map((l) => l.texto)).toEqual(['A', 'B', 'C'])
    // Cada mitad sola no cerraba contra el neto; juntas sí.
    expect(r.validacion).toEqual({ estado: 'OK', observaciones: [] })
  })

  it('si la continuación repite el renglón de la costura, no lo duplica', () => {
    const r = unirLecturas(lectura([linea('A'), linea('B')]), lectura([linea(' b '), linea('C')]))
    expect(r.lineas.map((l) => l.texto)).toEqual(['A', 'B', 'C'])
  })

  it('si la continuación empezó de nuevo desde arriba, usa solo lo que pasa de lo ya leído', () => {
    const r = unirLecturas(
      lectura([linea('A'), linea('B')]),
      lectura([linea('A'), linea('B'), linea('C')]),
    )
    expect(r.lineas.map((l) => l.texto)).toEqual(['A', 'B', 'C'])
  })

  it('dos renglones distintos con el mismo texto no se confunden con una repetición', () => {
    const r = unirLecturas(lectura([linea('A'), linea('B', 100)]), lectura([linea('B', 300)]))
    expect(r.lineas).toHaveLength(3)
  })

  it('completa el encabezado y los totales con lo que haya visto cada parte, y avisa si no cierra', () => {
    const r = unirLecturas(
      { ...lectura([linea('A')], null), nroRemito: null, observaciones: 'Sello encima.' },
      { ...lectura([linea('B')]), observaciones: 'Sello encima.' },
    )
    expect(r.nroRemito).toBe('0001-00001234')
    expect(r.totales.total).toBe(726)
    expect(r.observaciones).toBe('Sello encima.')
    expect(r.validacion.estado).toBe('Revisar')
    expect(r.validacion.observaciones.join(' ')).toContain('puede faltar o sobrar un renglón')
  })
})
