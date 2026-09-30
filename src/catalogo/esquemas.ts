// Validación de los formularios del catálogo (la base valida lo mismo: SPEC §11).

import { z } from 'zod'
import { leerNumero } from '../lib/formato'
import { normalizarWhatsapp } from '../lib/whatsapp'

export const proveedorSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, { error: 'Escribí el nombre del proveedor.' })
    .max(120, { error: 'El nombre es muy largo (hasta 120 letras).' }),
  whatsapp: z.string().transform((texto, ctx) => {
    const r = normalizarWhatsapp(texto)
    if (!r.ok) {
      ctx.addIssue({ code: 'custom', message: r.mensaje })
      return z.NEVER
    }
    return r.numero
  }),
  dias_entrega: z.array(z.number().int().min(1).max(7)),
  hora_limite: z
    .string()
    .trim()
    .max(60, { error: '"Pedir antes de" es muy largo (hasta 60 letras).' })
    .transform((v) => v || null),
})

const presentacionSchema = z.object({
  id: z.uuid(),
  nombre: z
    .string()
    .trim()
    .min(1, { error: 'Poné el nombre de la presentación (por ejemplo, Caja).' })
    .max(40, { error: 'El nombre de la presentación es muy largo.' }),
  factor: z.string().transform((texto, ctx) => {
    const n = leerNumero(texto)
    if (n === null || n <= 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'La cantidad de la presentación tiene que ser mayor a 0.',
      })
      return z.NEVER
    }
    return n
  }),
  aproximada: z.boolean(),
})

export const productoSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, { error: 'Escribí el nombre del producto.' })
    .max(120, { error: 'El nombre es muy largo (hasta 120 letras).' }),
  unidad_base_id: z.uuid({ error: 'Elegí en qué unidad lo comprás.' }),
  presentaciones: z.array(presentacionSchema),
})

export const unidadSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, { error: 'Escribí el nombre de la unidad.' })
    .max(40, { error: 'El nombre es muy largo (hasta 40 letras).' }),
  tipo: z.enum(['peso', 'volumen', 'unidad'], { error: 'Elegí si se pesa, se mide o se cuenta.' }),
})

/** Primer mensaje de error por campo (para mostrar debajo de cada uno). */
export function erroresPorCampo(error: z.ZodError): Record<string, string> {
  const errores: Record<string, string> = {}
  for (const issue of error.issues) {
    const campo = issue.path.join('.')
    errores[campo] ??= issue.message
  }
  return errores
}
