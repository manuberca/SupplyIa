// Lo que viaja entre la app y la función /api/equipo. Se valida en los dos lados.

import { z } from 'zod'
import { rolSchema } from '../lib/permisos'

export const invitacionSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: 'Revisá el mail: parece que está mal escrito.' })),
  nombre: z
    .string()
    .trim()
    .min(1, { message: 'Escribí el nombre de la persona.' })
    .max(120, { message: 'El nombre es demasiado largo.' }),
  rol: rolSchema,
  /** null = todos los locales. */
  locales: z.array(z.uuid()).min(1).nullable(),
})
export type Invitacion = z.infer<typeof invitacionSchema>

export const respuestaEquipoSchema = z.discriminatedUnion('ok', [
  // reactivado: la persona ya había estado en el equipo y se la volvió a sumar.
  z.object({ ok: z.literal(true), reactivado: z.boolean() }),
  z.object({ ok: z.literal(false), error: z.string() }),
])
export type RespuestaEquipo = z.infer<typeof respuestaEquipoSchema>

export const MAXIMO_MIEMBROS = 50
