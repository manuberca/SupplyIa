import { z } from 'zod'

const esquema = z.object({
  VITE_SUPABASE_URL: z.url({ message: 'Falta VITE_SUPABASE_URL en .env.local' }),
  VITE_SUPABASE_ANON_KEY: z
    .string()
    .min(20, { message: 'Falta VITE_SUPABASE_ANON_KEY en .env.local' }),
})

const resultado = esquema.safeParse(import.meta.env)

if (!resultado.success) {
  // Error de configuración: mejor que la app no arranque a que falle más adelante sin explicación.
  throw new Error(
    'Configuración incompleta. ' + resultado.error.issues.map((i) => i.message).join(' · '),
  )
}

export const env = resultado.data
