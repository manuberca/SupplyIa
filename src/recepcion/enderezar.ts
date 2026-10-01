// Fotos sacadas de costado. La IA lee mucho mejor una boleta derecha (probado con una factura de
// Quilmes: de costado, casi todos los renglones dudosos; derecha, los 12 subtotales bien). La IA
// avisa cuánto hay que girar la foto; si además la lectura salió dudosa, la app la endereza y la
// lee de nuevo, y se queda con la mejor de las dos.

import type { Lectura } from './lectura'

export type Giro = 90 | 180 | 270

const dudosos = (l: Lectura) => l.lineas.filter((x) => x.confianza === 'baja' && !x.esPromo).length

/** Cuánto girar (en sentido horario) si conviene leer de nuevo; null si la lectura ya sirve. */
export function convieneEnderezar(lectura: Lectura): Giro | null {
  if (lectura.giro === 0) return null
  // Una boleta de costado que igual se leyó bien no se vuelve a leer (gasta tiempo y una lectura).
  const muchos = Math.max(2, Math.ceil(lectura.lineas.length / 4))
  if (lectura.lineas.length > 0 && dudosos(lectura) < muchos) return null
  return lectura.giro
}

/** De dos lecturas de la misma boleta, la que tiene menos renglones dudosos (y alguno leído). */
export function mejorLectura(primera: Lectura, enderezada: Lectura): Lectura {
  if (enderezada.lineas.length === 0) return primera
  if (primera.lineas.length === 0) return enderezada
  const [a, b] = [
    dudosos(primera) / primera.lineas.length,
    dudosos(enderezada) / enderezada.lineas.length,
  ]
  return b <= a ? enderezada : primera
}
