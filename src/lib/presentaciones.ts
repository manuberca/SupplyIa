import { numero } from './formato'

export type Presentacion = { nombre: string; factor_a_base: number; aproximada: boolean }

/** Cantidad en la unidad base: 2 cajas de 10 kg → 20 (kg). Hasta 4 decimales, como la base. */
export function cantidadBase(cantidad: number, factorABase = 1): number {
  return Math.round(cantidad * factorABase * 10_000) / 10_000
}

export type UnidadBase = { nombre: string; tipo: string }

/** "caja de 18 kg" · "pieza de ≈4,5 kg" · "jaula de 12" (si la unidad se cuenta, no se repite) */
export function textoPresentacion(p: Presentacion, unidad: UnidadBase): string {
  const nombre = p.nombre.trim().toLowerCase()
  const sufijo = unidad.tipo === 'unidad' ? '' : ` ${unidad.nombre}`
  return `${nombre} de ${p.aproximada ? '≈' : ''}${numero(p.factor_a_base, 4)}${sufijo}`
}

/** "kg · caja de 18 kg · bolsa de 25 kg" (lo que se ve debajo de cada producto) */
export function textoUnidades(unidad: UnidadBase, presentaciones: readonly Presentacion[]): string {
  return [unidad.nombre, ...presentaciones.map((p) => textoPresentacion(p, unidad))].join(' · ')
}
