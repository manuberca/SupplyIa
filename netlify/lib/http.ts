// Lo que comparten las funciones del servidor.

/** Un error con un mensaje pensado para mostrarle a la persona. */
export class ErrorParaMostrar extends Error {
  constructor(
    mensaje: string,
    readonly status = 400,
  ) {
    super(mensaje)
  }
}

// Solo se responde a la app (y a local). La llave de verdad es la sesión; esto corta el uso
// desde otras páginas.
export function origenPermitido(req: Request): string | null | false {
  const origen = req.headers.get('origin')
  if (!origen) return null // mismo origen: el navegador no lo manda en todos los casos
  const permitidos = [
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
    'http://localhost:5173',
    'http://localhost:4173',
  ]
  return permitidos.includes(origen) ? origen : false
}

export function json(cuerpo: unknown, status = 200, origen?: string | null): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (origen) headers['Access-Control-Allow-Origin'] = origen
  return new Response(JSON.stringify(cuerpo), { status, headers })
}
