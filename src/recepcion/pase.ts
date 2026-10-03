// El pase para seguir leyendo una boleta larga (ver continuar.ts). Lo firma la función con una
// clave que solo ella tiene, así nadie arma uno a mano para leer sin que cuente en el tope del mes.

export type Pase = {
  org: string
  proveedor: string
  /** Renglones ya leídos. */
  desde: number
  /** El último renglón leído, como se le describe a la IA. */
  ultimo: string
  /** Lecturas del mes, tal como quedaron al empezar esta boleta. */
  usadas: number
  tope: number
  /** Cuántas veces ya se siguió. */
  vuelta: number
  vence: number
}

export const VIGENCIA_PASE_MS = 3 * 60_000
export const MAX_VUELTAS = 3

const aBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
const deBase64Url = (texto: string) =>
  Uint8Array.from(atob(texto.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

async function llave(clave: string) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(clave),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function firmarPase(clave: string, pase: Pase): Promise<string> {
  const cuerpo = new TextEncoder().encode(JSON.stringify(pase))
  const firma = await crypto.subtle.sign('HMAC', await llave(clave), cuerpo)
  return `${aBase64Url(cuerpo)}.${aBase64Url(new Uint8Array(firma))}`
}

/** El pase, si la firma es nuestra y no venció. null si no. */
export async function abrirPase(
  clave: string,
  texto: string,
  ahora = Date.now(),
): Promise<Pase | null> {
  const [cuerpo, firma, sobra] = texto.split('.')
  if (!cuerpo || !firma || sobra !== undefined) return null
  try {
    const bytes = deBase64Url(cuerpo)
    const valida = await crypto.subtle.verify('HMAC', await llave(clave), deBase64Url(firma), bytes)
    if (!valida) return null
    const pase = JSON.parse(new TextDecoder().decode(bytes)) as Pase
    return pase.vence > ahora ? pase : null
  } catch {
    return null
  }
}
