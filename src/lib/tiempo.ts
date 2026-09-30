// Fechas relativas y días de entrega, en castellano.

import { DIAS } from './dias'

const DIA_MS = 24 * 60 * 60 * 1000

function inicioDelDia(fecha: Date): number {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime()
}

/** "hace 5 min" · "hace 2 h" · "hoy" · "ayer" · "hace 6 días" · "hace 2 meses" */
export function hace(fecha: string | Date, ahora = new Date()): string {
  const f = typeof fecha === 'string' ? new Date(fecha) : fecha
  const minutos = Math.floor((ahora.getTime() - f.getTime()) / 60_000)
  if (minutos < 1) return 'recién'
  if (minutos < 60) return `hace ${minutos} min`
  const dias = Math.round((inicioDelDia(ahora) - inicioDelDia(f)) / DIA_MS)
  if (dias === 0) return `hace ${Math.floor(minutos / 60)} h`
  if (dias === 1) return 'ayer'
  if (dias < 45) return `hace ${dias} días`
  const meses = Math.round(dias / 30)
  return meses < 12 ? `hace ${meses} meses` : 'hace más de un año'
}

/** Día de la semana como en la base: 1 = lunes … 7 = domingo. */
export function diaSemana(fecha: Date): number {
  return ((fecha.getDay() + 6) % 7) + 1
}

/** Cuántos días faltan para la próxima entrega (0 = hoy). null si no tiene días fijos. */
export function diasHastaEntrega(dias: readonly number[], hoy = new Date()): number | null {
  if (dias.length === 0) return null
  const actual = diaSemana(hoy)
  return Math.min(...dias.map((d) => (d - actual + 7) % 7))
}

/** "Entrega hoy" · "Entrega mañana" · "Entrega el jueves" · "Sin días fijos" */
export function textoProximaEntrega(dias: readonly number[], hoy = new Date()): string {
  const faltan = diasHastaEntrega(dias, hoy)
  if (faltan === null) return 'Sin días fijos'
  if (faltan === 0) return 'Entrega hoy'
  if (faltan === 1) return 'Entrega mañana'
  const dia = DIAS[(diaSemana(hoy) - 1 + faltan) % 7]!
  return `Entrega el ${dia.largo}`
}
