import { supabase } from '../lib/supabase'
import { reportar } from '../lib/errores'
import { SIN_CONEXION } from '../lib/errores-auth'
import { unirLecturas } from './continuar'
import { respuestaLecturaSchema, type PedidoLectura, type RespuestaLectura } from './lectura'
import type { FotoLista } from './foto'

// La función corta la lectura a los 45 s y Netlify a los 60: esto es por si la red se cuelga.
const ESPERA_MAXIMA = 65_000
/** Una boleta larga se lee en varios pedidos; más de esto no es una boleta. */
const MAX_CONTINUACIONES = 3

type Pedido = Omit<PedidoLectura, 'continuar'>

async function pedir(pedido: Pedido, continuar?: string): Promise<RespuestaLectura> {
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
      body: JSON.stringify({ ...pedido, continuar }),
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

/**
 * Manda la foto a /api/ocr. Nunca tira error: cualquier falla vuelve como mensaje con salida.
 * `alternativa`: la misma foto girada para el otro lado (segunda lectura de una foto de costado).
 * Si la boleta es larga y la lectura se corta por tiempo, pide sola los renglones que faltan
 * (`alSeguir` avisa cuántos van) y devuelve la boleta entera.
 */
export async function leerRemito(
  proveedorId: string,
  foto: FotoLista,
  alternativa?: FotoLista,
  alSeguir?: (renglonesLeidos: number) => void,
): Promise<RespuestaLectura> {
  const pedido: Pedido = {
    proveedorId,
    imagen: foto.base64,
    alternativa: alternativa?.base64,
    tipo: foto.tipo,
  }
  const primera = await pedir(pedido)
  if (!primera.ok) return primera

  let { lectura, continuar } = primera
  for (let vuelta = 0; continuar && vuelta < MAX_CONTINUACIONES; vuelta++) {
    alSeguir?.(lectura.lineas.length)
    const mas = await pedir(pedido, continuar.pase)
    // Si el resto no se pudo leer, lo leído sirve igual: se avisa que faltan renglones.
    if (!mas.ok) break
    lectura = unirLecturas(lectura, mas.lectura)
    continuar = mas.continuar
  }
  return {
    ...primera,
    lectura: continuar ? { ...lectura, incompleta: true } : lectura,
    continuar: null,
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
