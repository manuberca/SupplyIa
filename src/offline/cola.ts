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

/** Lo que manda la pantalla de recepción a confirmar_recepcion() (ver la migración de recepciones). */
export type RecepcionParaGuardar = {
  id: string
  local_id: string
  proveedor_id: string
  pedido_id: string | null
  estado_pedido: 'a_pagar' | 'revisar' | null
  origen: 'ia' | 'manual'
  recibido_at: string
  foto_path: string | null
  nro_remito: string | null
  fecha_remito: string | null
  total_remito: number | null
  lectura_ia: unknown
  observaciones: string
  items: {
    id: string
    producto_id: string | null
    texto_remito: string
    cantidad_pedida_base: number | null
    cantidad_base: number | null
    precio_unit_base: number | null
    precio_anterior_base: number | null
    subtotal: number | null
    resultado: string
  }[]
  diferencias: {
    id: string
    producto_id: string | null
    tipo: string
    monto: number | null
    detalle: string
  }[]
  correcciones: { campo: string; detectado: string | null; correcto: string | null }[]
}

/** Lo que manda la pantalla al corregir una recepción ya confirmada (corregir_recepcion()). */
export type CorreccionParaGuardar = {
  /** El id de la corrección (no el de la recepción): reintentarla no la aplica dos veces. */
  id: string
  recepcion_id: string
  nro_remito: string | null
  total_remito: number | null
  observaciones: string
  estado_pedido: 'a_pagar' | 'revisar' | null
  items: RecepcionParaGuardar['items']
  diferencias: RecepcionParaGuardar['diferencias']
}

export type Operacion = {
  id: string
  creada: string
  intentos: number
  /** Si la base la rechazó por algo que no es la señal: se muestra con qué hacer. */
  error: string | null
} & (
  | { tipo: 'crear_pedido'; datos: PedidoParaGuardar }
  | { tipo: 'confirmar_recepcion'; datos: RecepcionParaGuardar }
  | { tipo: 'corregir_recepcion'; datos: CorreccionParaGuardar }
)

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

/** "1 pedido" · "2 recepciones" · "1 pedido y 1 recepción" */
export function queHay(ops: readonly Operacion[]): string {
  const pedidos = ops.filter((o) => o.tipo === 'crear_pedido').length
  const recepciones = ops.length - pedidos
  const partes = [
    pedidos ? `${pedidos} ${pedidos === 1 ? 'pedido' : 'pedidos'}` : '',
    recepciones ? `${recepciones} ${recepciones === 1 ? 'recepción' : 'recepciones'}` : '',
  ].filter(Boolean)
  return partes.join(' y ')
}
