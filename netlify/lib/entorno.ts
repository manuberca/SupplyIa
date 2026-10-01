// Configuración de las funciones (variables del panel de Netlify; en local, .env.local).

import * as Sentry from '@sentry/node'
import { limpiarSecreto } from '../../src/lib/secreto'

const SECRETOS = ['SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY'] as const
type Secreto = (typeof SECRETOS)[number]

/** La clave, sin lo que se haya colado al pegarla. `corregido` avisa que conviene volver a pegarla. */
export function secreto(nombre: Secreto) {
  return limpiarSecreto(nombre, process.env[nombre])
}

/** Sentry para las funciones. Ninguna clave sale en un reporte, aunque un error la traiga en su texto. */
export function iniciarSentry() {
  if (!process.env.VITE_SENTRY_DSN) return
  const ocultar = SECRETOS.flatMap((n) => [process.env[n] ?? '', secreto(n).valor]).filter(
    (v) => v.length >= 8,
  )
  Sentry.init({
    dsn: process.env.VITE_SENTRY_DSN,
    environment: process.env.CONTEXT ?? 'local',
    beforeSend(evento) {
      let texto = JSON.stringify(evento)
      for (const v of ocultar) texto = texto.split(JSON.stringify(v).slice(1, -1)).join('[clave]')
      return JSON.parse(texto) as typeof evento
    },
  })
}
