import { supabase } from '../lib/supabase'
import { reportar } from '../lib/errores'
import { SIN_CONEXION } from '../lib/errores-auth'
import { respuestaLecturaSchema, type RespuestaLectura } from './lectura'
import type { FotoLista } from './foto'

const ESPERA_MAXIMA = 40_000 // la función corta a los ~26 s; esto es por si la red se cuelga

/**
 * Manda la foto a /api/ocr. Nunca tira error: cualquier falla vuelve como mensaje con salida.
 * `alternativa`: la misma foto girada para el otro lado (segunda lectura de una foto de costado).
 */
export async function leerRemito(
  proveedorId: string,
  foto: FotoLista,
  alternativa?: FotoLista,
): Promise<RespuestaLectura> {
  if (!navigator.onLine)
    return { ok: false, error: `${SIN_CONEXION} Sin señal la IA no puede leer: cargalo a mano.` }
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, error: 'Tu sesión venció. Entrá de nuevo.' }

  const corte = new AbortController()
  const reloj = setTimeout(() => corte.abort(), ESPERA_MAXIMA)
  try {
    const respuesta = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        proveedorId,
        imagen: foto.base64,
        alternativa: alternativa?.base64,
        tipo: foto.tipo,
      }),
      signal: corte.signal,
    })
    const cuerpo: unknown = await respuesta.json().catch(() => null)
    const r = respuestaLecturaSchema.safeParse(cuerpo)
    if (r.success) return r.data
    reportar(new Error(`Respuesta inesperada de /api/ocr (${respuesta.status})`), 'Leer remito')
    return { ok: false, error: 'El lector respondió algo raro. Probá de nuevo o cargalo a mano.' }
  } catch (error) {
    if (corte.signal.aborted)
      return { ok: false, error: 'La lectura tardó demasiado. Probá de nuevo o cargalo a mano.' }
    if (!navigator.onLine)
      return { ok: false, error: `${SIN_CONEXION} Sin señal la IA no puede leer: cargalo a mano.` }
    reportar(error, 'Leer remito')
    return { ok: false, error: 'No pudimos llegar al lector. Probá de nuevo o cargalo a mano.' }
  } finally {
    clearTimeout(reloj)
  }
}

/** Sube la foto a la carpeta del bar. Si falla, la recepción se guarda igual, sin foto. */
export async function subirFoto(
  orgId: string,
  recepcionId: string,
  foto: FotoLista,
): Promise<string | null> {
  const camino = `${orgId}/${recepcionId}.jpg`
  const { error } = await supabase.storage.from('remitos').upload(camino, foto.blob, {
    contentType: foto.tipo,
    upsert: false,
  })
  if (!error || /already exists|Duplicate/i.test(error.message)) return camino
  reportar(error, 'Subir foto de remito')
  return null
}
