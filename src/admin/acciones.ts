// Escrituras del panel: marcar pagado y seguir las diferencias. Son cambios de estado de algo
// que ya está en la base (no altas), así que van directo, como los cambios de estado de pedidos:
// sin señal no se intentan y se avisa.

import { reportar } from '../lib/errores'
import { SIN_CONEXION } from '../lib/errores-auth'
import { ERROR_DB_DESCONOCIDO, mensajeErrorDb, type ErrorDb } from '../lib/errores-db'
import { supabase } from '../lib/supabase'
import type { EstadoDiferencia } from './estados'

export type Resultado = { ok: true } | { ok: false; mensaje: string }

async function actualizar(
  contexto: string,
  paso: () => PromiseLike<{ error: ErrorDb }>,
): Promise<Resultado> {
  if (!navigator.onLine) return { ok: false, mensaje: SIN_CONEXION }
  const { error } = await paso()
  if (!error) return { ok: true }
  const mensaje = mensajeErrorDb(error)
  if (mensaje === ERROR_DB_DESCONOCIDO) reportar(error, contexto)
  return { ok: false, mensaje }
}

/** A pagar → pagado (la fecha de pago la pone la base). */
export function marcarPagado(pedidoId: string) {
  return actualizar('Marcar pagado', () =>
    supabase.from('pedidos').update({ estado: 'pagado' }).eq('id', pedidoId),
  )
}

/** Revisar → a pagar, cuando ya se aclaró la diferencia. */
export function pasarAPagar(pedidoId: string) {
  return actualizar('Pasar a pagar', () =>
    supabase.from('pedidos').update({ estado: 'a_pagar' }).eq('id', pedidoId),
  )
}

export function cambiarEstadoDiferencia(id: string, estado: EstadoDiferencia) {
  return actualizar('Cambiar estado de diferencia', () =>
    supabase.from('diferencias').update({ estado }).eq('id', id),
  )
}

/** Link temporal (5 minutos) a la foto de un remito: el bucket es privado. */
export async function linkDeFoto(camino: string): Promise<{ url: string } | { error: string }> {
  if (!navigator.onLine) return { error: SIN_CONEXION }
  const { data, error } = await supabase.storage.from('remitos').createSignedUrl(camino, 300)
  if (error || !data) {
    if (error && !/not found/i.test(error.message)) reportar(error, 'Ver foto de remito')
    return { error: 'No encontramos la foto de este remito.' }
  }
  return { url: data.signedUrl }
}
