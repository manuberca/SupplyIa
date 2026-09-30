// WhatsApp de celulares argentinos. Se guarda siempre como +549 + código de área + número
// (10 dígitos), que es lo que necesita wa.me.

export type ResultadoWhatsapp = { ok: true; numero: string } | { ok: false; mensaje: string }

/**
 * Acepta como la gente lo escribe: "341 555-1234", "0341 15 555-1234", "+54 9 341 5551234",
 * "11 15 5555-1234". Saca el 0 y el 15, que no van en WhatsApp.
 */
export function normalizarWhatsapp(texto: string): ResultadoWhatsapp {
  let d = texto.replace(/\D/g, '')
  if (!d) return { ok: false, mensaje: 'Escribí el WhatsApp del proveedor.' }

  if (d.startsWith('54')) d = d.slice(2)
  if (d.startsWith('9') && d.length === 11) d = d.slice(1)
  if (d.startsWith('0')) d = d.slice(1)

  // El 15 va después del código de área: 11 (CABA) o de 3 a 4 cifras en el resto del país.
  if (d.length === 12) {
    const largoArea = d.startsWith('11') ? [2] : [3, 4]
    const conQuince = largoArea.find((n) => d.slice(n, n + 2) === '15')
    if (conQuince !== undefined) d = d.slice(0, conQuince) + d.slice(conQuince + 2)
  }

  if (d.length < 10) {
    return {
      ok: false,
      mensaje: 'Falta el código de área. Escribilo así: 341 555-1234.',
    }
  }
  if (d.length !== 10) {
    return { ok: false, mensaje: 'Revisá el número: sobran dígitos. Ejemplo: 341 555-1234.' }
  }
  return { ok: true, numero: `+549${d}` }
}

/** "+5493415551234" → "+54 9 341 555-1234" */
export function formatearWhatsapp(numero: string): string {
  const d = numero.replace(/^\+549/, '')
  if (d.length !== 10) return numero
  const largoArea = d.startsWith('11') ? 2 : 3
  const area = d.slice(0, largoArea)
  const resto = d.slice(largoArea)
  const corte = resto.length - 4
  return `+54 9 ${area} ${resto.slice(0, corte)}-${resto.slice(corte)}`
}

/** Lo que va en el campo del formulario (sin el +54 9, que se muestra aparte). */
export function whatsappParaEditar(numero: string): string {
  return formatearWhatsapp(numero).replace(/^\+54 9 /, '')
}
