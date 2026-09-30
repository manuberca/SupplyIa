// Días de entrega: 1 = lunes … 7 = domingo (como en la base).

import { normalizar } from './normalizar'

export const DIAS = [
  { n: 1, letra: 'L', corto: 'lun', largo: 'lunes' },
  { n: 2, letra: 'M', corto: 'mar', largo: 'martes' },
  { n: 3, letra: 'M', corto: 'mié', largo: 'miércoles' },
  { n: 4, letra: 'J', corto: 'jue', largo: 'jueves' },
  { n: 5, letra: 'V', corto: 'vie', largo: 'viernes' },
  { n: 6, letra: 'S', corto: 'sáb', largo: 'sábado' },
  { n: 7, letra: 'D', corto: 'dom', largo: 'domingo' },
] as const

const corto = (n: number) => DIAS[n - 1]?.corto ?? '?'
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** [1,2,3,4,5,6] → "Lun a sáb" · [1,3,5] → "Lun, mié y vie" · [] → "Sin días fijos" */
export function textoDias(dias: readonly number[]): string {
  const orden = [...new Set(dias)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b)
  if (orden.length === 0) return 'Sin días fijos'
  if (orden.length === 7) return 'Todos los días'
  const seguidos = orden.every((d, i) => i === 0 || d === orden[i - 1]! + 1)
  if (seguidos && orden.length >= 3)
    return mayuscula(`${corto(orden[0]!)} a ${corto(orden.at(-1)!)}`)
  const nombres = orden.map(corto)
  const ultimo = nombres.pop()!
  return mayuscula(nombres.length ? `${nombres.join(', ')} y ${ultimo}` : ultimo)
}

// Para la planilla: cada forma en que alguien puede escribir un día.
const PALABRAS: Record<string, number> = {
  l: 1,
  lu: 1,
  lun: 1,
  lunes: 1,
  m: 2,
  ma: 2,
  mar: 2,
  martes: 2,
  x: 3,
  mi: 3,
  mie: 3,
  miercoles: 3,
  j: 4,
  ju: 4,
  jue: 4,
  jueves: 4,
  v: 5,
  vi: 5,
  vie: 5,
  viernes: 5,
  s: 6,
  sa: 6,
  sab: 6,
  sabado: 6,
  sabados: 6,
  d: 7,
  do: 7,
  dom: 7,
  domingo: 7,
  domingos: 7,
}

export type ResultadoDias = { ok: true; dias: number[] } | { ok: false; mensaje: string }

/**
 * "lun a sáb", "L M X J V", "lunes, miércoles y viernes", "lun-vie", "todos".
 * La M sola es martes; para miércoles, X o "mié".
 */
export function leerDias(texto: string): ResultadoDias {
  const t = normalizar(texto).replace(/\./g, '')
  if (!t) return { ok: true, dias: [] }
  if (/^todos( los dias)?$/.test(t)) return { ok: true, dias: [1, 2, 3, 4, 5, 6, 7] }

  const dias = new Set<number>()
  for (const parte of t.split(/[,;/]|\s+y\s+/)) {
    // "lun a sáb" (con espacios, para no confundir "sabado" con "sab a do") o "lun-vie".
    const rango = parte.trim().match(/^([a-z]+)(?:\s+al?\s+|\s*-\s*)([a-z]+)$/)
    if (rango) {
      const desde = PALABRAS[rango[1]!]
      const hasta = PALABRAS[rango[2]!]
      if (!desde || !hasta) return noEntiendo(parte)
      for (let d = desde; d !== hasta; d = (d % 7) + 1) dias.add(d)
      dias.add(hasta)
      continue
    }
    for (const palabra of parte.trim().split(/\s+/)) {
      if (!palabra) continue
      const d = PALABRAS[palabra]
      if (!d) return noEntiendo(palabra)
      dias.add(d)
    }
  }
  return { ok: true, dias: [...dias].sort((a, b) => a - b) }
}

function noEntiendo(que: string): ResultadoDias {
  return {
    ok: false,
    mensaje: `No entiendo "${que.trim()}" como día. Escribilo así: "lun a sáb" o "L M X J V".`,
  }
}
