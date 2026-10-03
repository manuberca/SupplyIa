// Boletas largas. La IA escribe los renglones de a uno y una boleta de 60 renglones no llega a
// leerse dentro del tiempo que tiene la función. En vez de fallar, el servidor corta antes del
// límite, rescata los renglones que ya salieron enteros y le da a la app un pase para pedir los
// que faltan. La app los pide sola y une las partes acá.

import { numero } from '../lib/formato'
import { salidaModeloSchema, type Lectura, type SalidaModelo } from './lectura'
import { validarRemito } from './validar'

/**
 * De un JSON cortado por la mitad, lo que sirve: el encabezado, los totales (van antes que los
 * renglones) y los renglones que llegaron a cerrarse. null si no hay ni un renglón entero.
 */
export function rescatarParcial(texto: string): SalidaModelo | null {
  let profundidad = 0
  let enTexto = false
  let escapado = false
  let enRenglones = false
  let finUltimo = -1
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (enTexto) {
      if (escapado) escapado = false
      else if (c === '\\') escapado = true
      else if (c === '"') enTexto = false
    } else if (c === '"') {
      enTexto = true
    } else if (c === '{' || c === '[') {
      // El único arreglo del primer nivel es el de renglones.
      if (c === '[' && profundidad === 1) enRenglones = true
      profundidad++
    } else if (c === '}' || c === ']') {
      profundidad--
      if (enRenglones && c === '}' && profundidad === 2) finUltimo = i + 1
      if (enRenglones && c === ']' && profundidad === 1) break
    }
  }
  if (finUltimo < 0) return null
  try {
    const entero: unknown = JSON.parse(`${texto.slice(0, finUltimo)}],"observaciones":""}`)
    const salida = salidaModeloSchema.safeParse(entero)
    return salida.success ? salida.data : null
  } catch {
    return null
  }
}

/** Cómo se le describe a la IA el último renglón ya leído, para que siga desde el siguiente. */
export function pistaDelUltimo(item: SalidaModelo['items'][number]): string {
  const partes = [`"${item.texto_remito.slice(0, 120)}"`]
  if (item.cantidad !== null) partes.push(`cantidad ${numero(item.cantidad, 3)}`)
  if (item.subtotal !== null) partes.push(`total de línea ${numero(item.subtotal, 2)}`)
  return partes.join(' · ')
}

type Linea = Lectura['lineas'][number]
const limpio = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
const mismoRenglon = (a: Linea | undefined, b: Linea | undefined) =>
  !!a &&
  !!b &&
  limpio(a.texto) === limpio(b.texto) &&
  a.cantidad === b.cantidad &&
  a.subtotal === b.subtotal

/** Une lo ya leído con la continuación y controla las cuentas de la boleta entera. */
export function unirLecturas(primera: Lectura, resto: Lectura): Lectura {
  let nuevas = resto.lineas
  if (
    primera.lineas.length >= 2 &&
    mismoRenglon(nuevas[0], primera.lineas[0]) &&
    mismoRenglon(nuevas[1], primera.lineas[1])
  ) {
    // No siguió: empezó otra vez desde arriba. Sirve lo que pasa de donde se había llegado.
    nuevas = nuevas.slice(primera.lineas.length)
  } else if (mismoRenglon(nuevas[0], primera.lineas.at(-1))) {
    // Repitió el renglón de la costura.
    nuevas = nuevas.slice(1)
  }
  const lineas = [...primera.lineas, ...nuevas]
  const totales = {
    subtotalNeto: primera.totales.subtotalNeto ?? resto.totales.subtotalNeto,
    descuentoGlobal: primera.totales.descuentoGlobal ?? resto.totales.descuentoGlobal,
    iva: primera.totales.iva ?? resto.totales.iva,
    percepciones: primera.totales.percepciones ?? resto.totales.percepciones,
    total: primera.totales.total ?? resto.totales.total,
  }
  // Cada parte ya controló sus renglones; acá se controla el conjunto contra el pie de la boleta.
  const validacion = validarRemito(lineas, totales)
  const notas = [primera.observaciones, resto.observaciones].filter((n) => n.trim())
  return {
    ...primera,
    nroRemito: primera.nroRemito ?? resto.nroRemito,
    fecha: primera.fecha ?? resto.fecha,
    proveedorDetectado: primera.proveedorDetectado ?? resto.proveedorDetectado,
    totales,
    lineas: lineas.map((l, i) => ({ ...l, esPromo: validacion.lineas[i]!.esPromo })),
    validacion: { estado: validacion.estado, observaciones: validacion.observaciones },
    observaciones: [...new Set(notas)].join(' '),
  }
}
