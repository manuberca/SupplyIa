// Traduce los errores de inicio de sesión de Supabase a mensajes que dicen qué hacer.

type ErrorAuth =
  { code?: string; status?: number; name?: string; message?: string } | null | undefined

const SIN_ACCESO =
  'Ese mail no tiene acceso a SupplyIA. Pedile a quien administra tu bar que te invite.'

const MENSAJES: Record<string, string> = {
  invalid_credentials:
    'El mail o la contraseña no coinciden. Revisalos o entrá con un mail sin contraseña.',
  email_not_confirmed: 'Todavía no confirmaste tu mail. Entrá con un mail sin contraseña.',
  otp_expired: 'El código o el enlace venció o no es correcto. Pedí uno nuevo.',
  over_email_send_rate_limit:
    'Mandamos muchos mails seguidos. Esperá unos minutos y probá de nuevo.',
  over_request_rate_limit: 'Hubo muchos intentos seguidos. Esperá unos minutos y probá de nuevo.',
  signup_disabled: SIN_ACCESO,
  otp_disabled: SIN_ACCESO,
  user_not_found: SIN_ACCESO,
  user_banned: 'Tu usuario está suspendido. Hablá con quien administra tu bar.',
}

/** Cuando no reconocemos el error: estos conviene reportarlos. */
export const ERROR_AUTH_DESCONOCIDO = 'No pudimos iniciar sesión. Probá de nuevo en un rato.'

export const SIN_CONEXION = 'No hay conexión. Revisá la señal y probá de nuevo.'

export function mensajeErrorAuth(error: ErrorAuth): string {
  if (!error) return ''
  if (error.code && MENSAJES[error.code]) return MENSAJES[error.code]!
  // Sin código: Supabase responde así cuando el mail no existe y no se permiten altas.
  if (/signups? not allowed/i.test(error.message ?? '')) return SIN_ACCESO
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return SIN_CONEXION
  return ERROR_AUTH_DESCONOCIDO
}

/** Si el enlace del mail vuelve con error (vencido, ya usado), lo lee de la URL. */
export const LINK_EN_OTRO_NAVEGADOR =
  'Ese link no funcionó en este navegador. Abrilo en el mismo navegador donde lo pediste, o pedí uno nuevo desde acá.'

export function errorEnUrl(url: URL): string {
  const params = new URLSearchParams(url.hash.replace(/^#/, ''))
  const code = params.get('error_code') ?? url.searchParams.get('error_code')
  if (code) return mensajeErrorAuth({ code })
  // Si el link del mail vuelve con su código y no hay sesión, se abrió en otro navegador
  // (el link solo sirve en el mismo navegador o app donde se pidió).
  if (url.searchParams.has('code')) return LINK_EN_OTRO_NAVEGADOR
  return ''
}
