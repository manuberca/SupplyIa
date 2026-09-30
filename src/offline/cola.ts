// Cola de operaciones pendientes de subir (SPEC §8). Cada operación lleva el UUID que
// generó la app: reintentarla no duplica nada, porque la base la reconoce.

export type PedidoParaGuardar = {
  id: string
  local_id: string
  proveedor_id: string
  observaciones: string
  creado_at: string
  enviado_at: string
  items: {
    id: string
    producto_id: string
    presentacion_id: string | null
    cantidad: number
    precio_estimado_base: number | null
  }[]
}

export type Operacion = {
  id: string
  tipo: 'crear_pedido'
  datos: PedidoParaGuardar
  creada: string
  intentos: number
  /** Si la base la rechazó por algo que no es la señal: se muestra con qué hacer. */
  error: string | null
}

export type ResultadoEnvio =
  | { ok: true }
  | { ok: false; reintentar: true } // sin señal o sesión vencida: se reintenta sola
  | { ok: false; reintentar: false; mensaje: string } // la base la rechazó: hace falta que alguien la mire

/**
 * Sube las pendientes en orden. Si se corta la señal, deja el resto para después.
 * Las rechazadas quedan marcadas con su error (nunca se descartan solas).
 */
export async function procesarCola(
  operaciones: readonly Operacion[],
  enviar: (op: Operacion) => Promise<ResultadoEnvio>,
): Promise<{ restantes: Operacion[]; subidas: Operacion[] }> {
  const restantes: Operacion[] = []
  const subidas: Operacion[] = []
  let sinSenal = false

  for (const op of operaciones) {
    if (sinSenal || op.error) {
      restantes.push(op)
      continue
    }
    const r = await enviar(op)
    if (r.ok) subidas.push(op)
    else if (r.reintentar) {
      sinSenal = true
      restantes.push({ ...op, intentos: op.intentos + 1 })
    } else restantes.push({ ...op, intentos: op.intentos + 1, error: r.mensaje })
  }
  return { restantes, subidas }
}
