import { describe, expect, it } from 'vitest'
import {
  enlaceWhatsapp,
  estimado,
  mensajeWhatsapp,
  plural,
  textoCantidad,
  textoEstimado,
} from './logica'

const kg = { nombre: 'kg', tipo: 'peso' }
const atado = { nombre: 'atado', tipo: 'unidad' }
const unidad = { nombre: 'unidad', tipo: 'unidad' }

describe('plural', () => {
  it.each([
    ['caja', 'cajas'],
    ['unidad', 'unidades'],
    ['cajón', 'cajones'],
    ['bidón', 'bidones'],
    ['pieza', 'piezas'],
    ['maple', 'maples'],
    ['lápiz', 'lápices'],
    ['six pack', 'six packs'],
    ['barril', 'barriles'],
  ])('%s → %s', (uno, varios) => {
    expect(plural(uno)).toBe(varios)
  })
})

describe('textoCantidad', () => {
  it('en la unidad base o en la presentación', () => {
    expect(textoCantidad(12, kg)).toBe('12 kg')
    expect(textoCantidad(0.5, kg)).toBe('0,5 kg')
    expect(textoCantidad(1, kg, { nombre: 'Caja' })).toBe('1 caja')
    expect(textoCantidad(3, kg, { nombre: 'Caja' })).toBe('3 cajas')
    expect(textoCantidad(2, atado)).toBe('2 atados')
    expect(textoCantidad(1, unidad)).toBe('1 unidad')
    expect(textoCantidad(6, unidad)).toBe('6 unidades')
  })
})

describe('estimado', () => {
  it('suma con el último precio y cuenta los que no tienen', () => {
    const e = estimado([
      { cantidad: 12, factor: 1, precioBase: 14200 }, // 12 kg de vacío
      { cantidad: 1, factor: 5, precioBase: 7900 }, // 1 caja de 5 kg de chorizo
      { cantidad: 4, factor: 1, precioBase: null },
    ])
    expect(e).toEqual({ total: 12 * 14200 + 5 * 7900, sinPrecio: 1 })
    expect(textoEstimado(3, e)).toBe('3 productos · estimado $209.900')
    expect(textoEstimado(1, { total: 0, sinPrecio: 1 })).toBe('1 producto · sin precios anteriores')
  })
})

describe('mensaje de WhatsApp', () => {
  it('arma el texto del pedido', () => {
    const texto = mensajeWhatsapp({
      organizacion: 'Bar Demo',
      local: 'Centro',
      renglones: [
        { producto: 'Vacío', cantidad: '12 kg' },
        { producto: 'Chorizo', cantidad: '1 caja' },
      ],
      observaciones: '  Entregar antes de las 11  ',
    })
    expect(texto).toBe(
      'Hola! Te paso un pedido de Bar Demo (Centro):\n\n• Vacío: 12 kg\n• Chorizo: 1 caja\n\nEntregar antes de las 11\n\nGracias!',
    )
  })

  it('arma el enlace de wa.me', () => {
    expect(enlaceWhatsapp('+5493415551234', 'Hola! 2 kg')).toBe(
      'https://wa.me/5493415551234?text=Hola!%202%20kg',
    )
  })
})
