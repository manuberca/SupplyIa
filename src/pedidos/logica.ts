// Reglas del pedido (SPEC §6): cantidad base, estimado con el último precio y mensaje de WhatsApp.

import { numero, pesos } from '../lib/formato'
import { cantidadBase } from '../lib/presentaciones'

type UnidadBase = { nombre: string; tipo: string }

const TILDE_FINAL: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' }

/** caja → cajas · unidad → unidades · cajón → cajones · kg → kg (las abreviaturas no cambian). */
export function plural(nombre: string): string {
  const partes = nombre.trim().split(' ')
  const ultima = partes.pop() ?? ''
  let p: string
  if (/[aeiouáéó]$/i.test(ultima)) p = `${ultima}s`
  else if (/z$/i.test(ultima)) p = `${ultima.slice(0, -1)}ces`
  else if (/[áéíóú][ns]$/i.test(ultima)) {
    const i = ultima.length - 2
    p = `${ultima.slice(0, i)}${TILDE_FINAL[ultima[i]!.toLowerCase()] ?? ultima[i]}${ultima.slice(-1)}es`
  } else if (/[lrndjy]$/i.test(ultima)) p = `${ultima}es`
  else p = `${ultima}s` // palabras de otro idioma: pack → packs
  return [...partes, p].join(' ')
}

/** "12 kg" · "1 caja" · "3 cajas" · "2 atados" · "0,5 kg" */
export function textoCantidad(
  cantidad: number,
  unidad: UnidadBase,
  presentacion?: { nombre: string } | null,
): string {
  const n = numero(cantidad, 3)
  if (presentacion) {
    const nombre = presentacion.nombre.trim().toLowerCase()
    return `${n} ${cantidad === 1 ? nombre : plural(nombre)}`
  }
  if (unidad.tipo === 'unidad' && cantidad !== 1) return `${n} ${plural(unidad.nombre)}`
  return `${n} ${unidad.nombre}`
}

export type RenglonParaEstimar = { cantidad: number; factor: number; precioBase: number | null }

/** Suma solo los productos con precio conocido y dice cuántos quedan afuera. */
export function estimado(renglones: readonly RenglonParaEstimar[]): {
  total: number
  sinPrecio: number
} {
  let total = 0
  let sinPrecio = 0
  for (const r of renglones) {
    if (r.precioBase === null) sinPrecio++
    else total += cantidadBase(r.cantidad, r.factor) * r.precioBase
  }
  return { total: Math.round(total), sinPrecio }
}

/** "4 productos · estimado $354.700" (lo de abajo del pedido) */
export function textoEstimado(
  cantidadProductos: number,
  e: { total: number; sinPrecio: number },
): string {
  const productos = `${cantidadProductos} ${cantidadProductos === 1 ? 'producto' : 'productos'}`
  if (e.sinPrecio === cantidadProductos) return `${productos} · sin precios anteriores`
  return `${productos} · estimado ${pesos(e.total)}`
}

export type RenglonMensaje = { producto: string; cantidad: string }

export function mensajeWhatsapp(datos: {
  organizacion: string
  local: string | null
  renglones: readonly RenglonMensaje[]
  observaciones?: string
}): string {
  const de = datos.local ? `${datos.organizacion} (${datos.local})` : datos.organizacion
  const lineas = [
    `Hola! Te paso un pedido de ${de}:`,
    '',
    ...datos.renglones.map((r) => `• ${r.producto}: ${r.cantidad}`),
  ]
  const obs = datos.observaciones?.trim()
  if (obs) lineas.push('', obs)
  lineas.push('', 'Gracias!')
  return lineas.join('\n')
}

/** Enlace que abre WhatsApp con el mensaje escrito. */
export function enlaceWhatsapp(numeroE164: string, texto: string): string {
  return `https://wa.me/${numeroE164.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`
}
