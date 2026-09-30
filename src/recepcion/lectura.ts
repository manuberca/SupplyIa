// Lo que devuelve la lectura con IA de un remito (SPEC §7.3). Se valida con zod en la función
// del servidor, antes de responder, y de nuevo en la app, al recibirlo.

import { z } from 'zod'

const numeroONulo = z.number().nullable()

/** Lo que tiene que devolver el modelo (salida estructurada: el JSON siempre respeta esto). */
export const salidaModeloSchema = z.object({
  nro_remito: z.string().nullable(),
  fecha: z.string().nullable(),
  proveedor_detectado: z.string().nullable(),
  subtotal_neto: numeroONulo,
  descuento_global: numeroONulo,
  iva: numeroONulo,
  percepciones: numeroONulo,
  total: numeroONulo,
  items: z.array(
    z.object({
      texto_remito: z.string(),
      producto_ref: z.string().nullable(),
      cantidad: numeroONulo,
      unidad: z.string().nullable(),
      precio_unit: numeroONulo,
      descuento_linea: numeroONulo,
      subtotal: numeroONulo,
      confianza: z.enum(['alta', 'media', 'baja']),
      observacion: z.string(),
    }),
  ),
  observaciones: z.string(),
})

export type SalidaModelo = z.infer<typeof salidaModeloSchema>

const lineaSchema = z.object({
  texto: z.string(),
  productoId: z.uuid().nullable(),
  cantidad: numeroONulo,
  unidad: z.string().nullable(),
  precioUnit: numeroONulo,
  descuentoLinea: numeroONulo,
  subtotal: numeroONulo,
  confianza: z.enum(['alta', 'media', 'baja']),
  observacion: z.string(),
  esPromo: z.boolean(),
})

export const lecturaSchema = z.object({
  nroRemito: z.string().nullable(),
  fecha: z.string().nullable(),
  proveedorDetectado: z.string().nullable(),
  totales: z.object({
    subtotalNeto: numeroONulo,
    descuentoGlobal: numeroONulo,
    iva: numeroONulo,
    percepciones: numeroONulo,
    total: numeroONulo,
  }),
  lineas: z.array(lineaSchema),
  validacion: z.object({
    estado: z.enum(['OK', 'Revisar']),
    observaciones: z.array(z.string()),
  }),
  observaciones: z.string(),
})

export type Lectura = z.infer<typeof lecturaSchema>

/** Respuesta de la función /api/ocr a la app. */
export const respuestaLecturaSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    lectura: lecturaSchema,
    /** Si ya se cargó un remito con ese número para ese proveedor. */
    duplicado: z.object({ recibidoAt: z.string() }).nullable(),
    uso: z.object({ usadas: z.number(), tope: z.number() }),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
])

export type RespuestaLectura = z.infer<typeof respuestaLecturaSchema>

/** Lo que manda la app a /api/ocr. */
export const pedidoLecturaSchema = z.object({
  proveedorId: z.uuid(),
  imagen: z.string().min(100).max(8_000_000), // base64, la app la comprime a 1600 px
  tipo: z.enum(['image/jpeg', 'image/png', 'image/webp']),
})

export type PedidoLectura = z.infer<typeof pedidoLecturaSchema>
