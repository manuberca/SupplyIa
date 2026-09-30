import * as Sentry from '@sentry/react'

/** Arranca Sentry. Sin DSN (por ejemplo, en local) los errores solo van a la consola. */
export function iniciarReportes(dsn: string | undefined) {
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: __VERSION__,
    // Nada de mails, IPs ni contenido: al usuario se lo identifica solo por su id.
    // Los parámetros de la URL quedan afuera porque ahí vuelven los códigos de login.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
  })
}

/**
 * Para errores que no se le pueden resolver al usuario en el momento.
 * Supabase devuelve objetos que no son Error: se envuelven para que Sentry muestre el mensaje.
 */
export function reportar(error: unknown, contexto: string) {
  console.error(contexto, error)
  const comoError =
    error instanceof Error ? error : new Error(`${contexto}: ${mensajeDe(error)}`, { cause: error })
  Sentry.captureException(comoError, { tags: { contexto } })
}

function mensajeDe(error: unknown): string {
  if (typeof error === 'object' && error && 'message' in error) return String(error.message)
  return String(error)
}

/** Con qué usuario, organización y rol pasó un error. `null` al cerrar sesión. */
export function identificar(datos: { usuarioId: string; orgId: string; rol: string } | null) {
  if (!datos) {
    Sentry.setUser(null)
    Sentry.setTags({ org_id: undefined, rol: undefined })
    return
  }
  Sentry.setUser({ id: datos.usuarioId })
  Sentry.setTags({ org_id: datos.orgId, rol: datos.rol })
}
