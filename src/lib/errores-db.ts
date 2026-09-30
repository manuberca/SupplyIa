// Traduce los errores de la base a mensajes que dicen qué pasó y cómo seguir.

import { SIN_CONEXION } from './errores-auth'

export type ErrorDb =
  { code?: string; message?: string; details?: string | null } | null | undefined

// Índices y reglas de supabase/migrations/*_catalogo.sql
const REPETIDOS: Record<string, string> = {
  proveedores_nombre_unico:
    'Ya hay un proveedor con ese nombre. Buscalo en la lista o usá otro nombre.',
  proveedores_whatsapp_unico: 'Ese WhatsApp ya lo tiene otro proveedor. Revisá el número.',
  productos_nombre_unico: 'Este proveedor ya tiene un producto con ese nombre.',
  presentaciones_nombre_unico: 'Este producto ya tiene una presentación con ese nombre.',
  unidades_nombre_unico:
    'Esa unidad ya existe (se comparan sin mayúsculas ni plural: "cajas" es lo mismo que "caja").',
  equivalencias_texto_unico:
    'Ese nombre de remito ya está asignado a otro producto de este proveedor.',
  locales_nombre_unico: 'Ya hay un local con ese nombre.',
}

export const SIN_PERMISO = 'No tenés permiso para hacer esto. Pedíselo a quien administra tu bar.'
export const ERROR_DB_DESCONOCIDO = 'No pudimos guardar. Probá de nuevo en un rato.'

/** Si es un error que no reconocemos, el mensaje es ERROR_DB_DESCONOCIDO (conviene reportarlo). */
export function mensajeErrorDb(error: ErrorDb): string {
  if (!error) return ''
  const texto = `${error.message ?? ''} ${error.details ?? ''}`

  if (error.code === '23505') {
    const indice = Object.keys(REPETIDOS).find((k) => texto.includes(k))
    return indice ? REPETIDOS[indice]! : 'Eso ya está cargado.'
  }
  if (error.code === '42501') return SIN_PERMISO
  // Reglas de la base escritas en castellano (unidad en uso, de otra organización…): se muestran tal cual.
  if (error.code === '23514' && !/violates check constraint/.test(texto) && error.message) {
    return error.message
  }
  if (error.code === '23514' || error.code === '22P02' || error.code === '23502') {
    return 'Algún dato no es válido. Revisalo y probá de nuevo.'
  }
  if (!error.code && /fetch|network|Failed/i.test(texto)) return SIN_CONEXION
  return ERROR_DB_DESCONOCIDO
}

/** Reintentar un alta que ya había entrado (mismo id) no es un error: ya está guardada. */
export function esReintentoDeAlta(error: ErrorDb): boolean {
  return error?.code === '23505' && /_pkey/.test(`${error.message ?? ''}`)
}
