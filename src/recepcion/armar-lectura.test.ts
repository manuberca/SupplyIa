import { describe, expect, it } from 'vitest'
import { armarLectura } from './armar-lectura'
import type { SalidaModelo } from './lectura'

const tomate = '11111111-1111-4111-8111-111111111111'
const salida: SalidaModelo = {
  nro_remito: ' 0003-00041872 ',
  fecha: '29/09/2026',
  proveedor_detectado: 'Verdulería Don Tito',
  subtotal_neto: null,
  descuento_global: null,
  iva: null,
  percepciones: null,
  total: 52200,
  items: [
    {
      texto_remito: 'TOMATE PERITA X KG',
      producto_ref: 'P1',
      cantidad: 18,
      unidad: 'kg',
      precio_unit: 2900,
      descuento_linea: null,
      subtotal: 52200,
      confianza: 'alta',
      observacion: '',
    },
    {
      texto_remito: 'BOLSAS',
      producto_ref: 'P9',
      cantidad: 2,
      unidad: 'u',
      precio_unit: 0,
      descuento_linea: 100,
      subtotal: 0,
      confianza: 'alta',
      observacion: '',
    },
  ],
  observaciones: '',
}

describe('armarLectura', () => {
  const l = armarLectura(salida, new Map([['P1', tomate]]))

  it('pasa los códigos del catálogo a ids reales; un código inventado queda sin asignar', () => {
    expect(l.lineas.map((x) => x.productoId)).toEqual([tomate, null])
  })

  it('limpia el número de remito y controla las cuentas', () => {
    expect(l.nroRemito).toBe('0003-00041872')
    expect(l.validacion.estado).toBe('OK')
    expect(l.lineas[1]?.esPromo).toBe(true)
  })
})
