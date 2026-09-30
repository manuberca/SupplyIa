import { z } from 'zod'

const esquema = z.object({
  VITE_SUPABASE_URL: z.url({ error: 'Falta VITE_SUPABASE_URL' }),
  VITE_SUPABASE_ANON_KEY: z
    .string({ error: 'Falta VITE_SUPABASE_ANON_KEY' })
    .min(20, { error: 'Falta VITE_SUPABASE_ANON_KEY' }),
  // Opcional: sin DSN la app anda igual, pero no reporta errores a Sentry.
  VITE_SENTRY_DSN: z.url({ error: 'VITE_SENTRY_DSN no es una dirección válida' }).optional(),
})

export type Config = z.infer<typeof esquema>

export type ResultadoConfig = { ok: true; config: Config } | { ok: false; faltantes: string[] }

/** Revisa las variables de entorno sin tirar error, para poder mostrar qué falta. */
export function revisarConfig(fuente: Record<string, unknown>): ResultadoConfig {
  // Una variable vacía en .env.local llega como '': se trata igual que si no estuviera.
  const limpia = Object.fromEntries(Object.entries(fuente).filter(([, v]) => v !== ''))
  const r = esquema.safeParse(limpia)
  if (r.success) return { ok: true, config: r.data }
  return { ok: false, faltantes: [...new Set(r.error.issues.map((i) => i.message))] }
}
