// Puntaje de una lectura contra lo que realmente dice el remito (pruebas de la IA).

import { normalizar } from '../lib/normalizar'
import type { Lectura } from './lectura'

export type RenglonVerdadero = {
  texto: string
  producto: string
  cantidad: number
  precio: number
  subtotal: number
}

export type Puntaje = {
  nro: boolean
  total: boolean
  renglones: {
    texto: string
    encontrado: boolean
    cantidad: boolean
    precio: boolean
    subtotal: boolean
    producto: boolean
  }[]
  sobrantes: string[]
  aciertos: number
  campos: number
}

const cerca = (a: number | null, b: number, tolerancia = 0.01) =>
  a !== null && Math.abs(a - b) <= Math.max(0.011, Math.abs(b) * tolerancia)
const digitos = (t: string | null) => (t ?? '').replace(/\D/g, '').replace(/^0+/, '')

/** Parecido entre dos textos de remito (palabras en común), de 0 a 1. */
export function parecido(a: string, b: string): number {
  const pa = new Set(
    normalizar(a)
      .split(/[^a-z0-9ñ]+/)
      .filter(Boolean),
  )
  const pb = new Set(
    normalizar(b)
      .split(/[^a-z0-9ñ]+/)
      .filter(Boolean),
  )
  if (!pa.size || !pb.size) return 0
  const comunes = [...pa].filter((x) => pb.has(x)).length
  return comunes / Math.max(pa.size, pb.size)
}

export function puntuar(
  lectura: Lectura,
  verdad: { nro: string; total: number; items: RenglonVerdadero[] },
  nombreDeProducto: (id: string) => string | undefined,
): Puntaje {
  const libres = new Set(lectura.lineas.map((_, i) => i))
  const renglones = verdad.items.map((v) => {
    let mejor = -1
    let puntos = 0
    for (const i of libres) {
      const p = parecido(lectura.lineas[i]!.texto, v.texto)
      if (p > puntos) [mejor, puntos] = [i, p]
    }
    if (mejor === -1 || puntos < 0.5) {
      return {
        texto: v.texto,
        encontrado: false,
        cantidad: false,
        precio: false,
        subtotal: false,
        producto: false,
      }
    }
    libres.delete(mejor)
    const l = lectura.lineas[mejor]!
    return {
      texto: v.texto,
      encontrado: true,
      cantidad: cerca(l.cantidad, v.cantidad, 0.001),
      precio: cerca(l.precioUnit, v.precio),
      subtotal: cerca(l.subtotal, v.subtotal),
      producto:
        !!l.productoId && normalizar(nombreDeProducto(l.productoId)) === normalizar(v.producto),
    }
  })
  const nro =
    digitos(lectura.nroRemito) !== '' && digitos(lectura.nroRemito) === digitos(verdad.nro)
  const total = cerca(lectura.totales.total, verdad.total, 0.005)
  const aciertos =
    Number(nro) +
    Number(total) +
    renglones.reduce(
      (s, r) => s + [r.cantidad, r.precio, r.subtotal, r.producto].filter(Boolean).length,
      0,
    )
  return {
    nro,
    total,
    renglones,
    sobrantes: [...libres].map((i) => lectura.lineas[i]!.texto),
    aciertos,
    campos: 2 + renglones.length * 4,
  }
}
