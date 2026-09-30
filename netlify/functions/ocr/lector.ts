// El núcleo de la lectura con IA: arma el contexto del remito, llama a Claude con salida
// estructurada y devuelve lo leído. Lo usan la función /api/ocr y el script que prueba
// remitos reales (scripts/probar-remitos.ts), así los dos leen exactamente igual.

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { salidaModeloSchema, type SalidaModelo } from '../../../src/recepcion/lectura'
import { contextoDelRemito, SISTEMA } from './prompt'

// Sonnet 5.5, medido el 30/9 con 12 remitos armados de boletas reales de La Bodeguita
// (npm run remitos:armar / remitos:probar), mismo prompt y esfuerzo bajo:
//   Opus 5.5    7 de 12 a tiempo (5 cortados a los 24 s) · 92,3 % de campos bien
//   Sonnet 5.5  12 de 12 · 3,3 a 7,9 s · 96,9 % · la mitad de precio
// Netlify corta cerca de los 26 s, así que la velocidad manda. No cambiarlo sin volver a medir.
// Todo se cambia con variables de entorno, sin redeployar.
const ESFUERZOS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
type Esfuerzo = (typeof ESFUERZOS)[number]

export const configuracion = () => ({
  modelo: process.env.OCR_MODEL || 'claude-sonnet-5-5',
  esfuerzo: ESFUERZOS.find((e) => e === process.env.OCR_EFFORT) ?? ('low' as Esfuerzo),
  plazoMs: Number(process.env.OCR_DEADLINE_MS || 24_000), // Netlify corta a ~26 s: 2 s de margen
})

// Salida estructurada: el JSON que devuelve el modelo siempre respeta este esquema.
const { $schema: _version, ...ESQUEMA_SALIDA } = z.toJSONSchema(salidaModeloSchema, {
  target: 'draft-7',
})
void _version

/** Un problema con la foto o la lectura que la persona puede resolver (no es una falla nuestra). */
export class ErrorDeLectura extends Error {}

type ProductoParaContexto = {
  id: string
  nombre: string
  unidad: string
  presentaciones: { nombre: string; factor: number; aproximada: boolean }[]
}

/** El catálogo va con códigos cortos (P1, P2…): la IA elige uno sin inventar nombres. */
export function armarContexto(datos: {
  proveedor: string
  productos: ProductoParaContexto[]
  equivalencias: { texto: string; productoId: string }[]
  correcciones: { campo: string; detectado: string | null; correcto: string | null }[]
}): { contexto: string; idPorRef: Map<string, string> } {
  const refPorId = new Map<string, string>()
  const idPorRef = new Map<string, string>()
  const productos = datos.productos.map((p, i) => {
    const ref = `P${i + 1}`
    refPorId.set(p.id, ref)
    idPorRef.set(ref, p.id)
    return { ref, nombre: p.nombre, unidad: p.unidad, presentaciones: p.presentaciones }
  })
  const contexto = contextoDelRemito({
    proveedor: datos.proveedor,
    productos,
    equivalencias: datos.equivalencias.flatMap((e) => {
      const ref = refPorId.get(e.productoId)
      return ref ? [{ texto: e.texto, ref }] : []
    }),
    correcciones: datos.correcciones,
  })
  return { contexto, idPorRef }
}

export type Leido = {
  salida: SalidaModelo
  modelo: string
  ms: number
  uso: Anthropic.Beta.BetaUsage
}

export async function leerConIA(datos: {
  imagen: string
  tipo: 'image/jpeg' | 'image/png' | 'image/webp'
  contexto: string
  modelo?: string
  esfuerzo?: Esfuerzo
}): Promise<Leido> {
  const config = configuracion()
  const modelo = datos.modelo ?? config.modelo
  const esfuerzo = datos.esfuerzo ?? config.esfuerzo
  const inicio = Date.now()
  const cliente = new Anthropic({ timeout: config.plazoMs, maxRetries: 0 })

  const pedir = (restante: number) =>
    cliente.beta.messages.create(
      {
        model: modelo,
        max_tokens: 16_000,
        // Piensa de forma adaptativa; el esfuerzo (bajo) regula cuánto.
        thinking: { type: 'adaptive' },
        output_config: {
          effort: esfuerzo,
          format: { type: 'json_schema', schema: ESQUEMA_SALIDA },
        },
        // Si un filtro de seguridad rechaza la foto, la API la reintenta sola en el modelo que corresponda.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        // Las reglas son iguales para todos los remitos: se cachean.
        system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: datos.tipo, data: datos.imagen },
              },
              { type: 'text', text: datos.contexto },
            ],
          },
        ],
      },
      { timeout: restante },
    )

  let respuesta
  try {
    respuesta = await pedir(config.plazoMs)
  } catch (error) {
    // Saturada al instante: un reintento, solo si queda tiempo de sobra.
    const pasajero =
      error instanceof Anthropic.RateLimitError ||
      (error instanceof Anthropic.APIError &&
        typeof error.status === 'number' &&
        error.status >= 500)
    if (!pasajero || Date.now() - inicio > 6000) throw error
    await new Promise((r) => setTimeout(r, 900))
    respuesta = await pedir(config.plazoMs - (Date.now() - inicio))
  }

  if (respuesta.stop_reason === 'refusal') {
    throw new ErrorDeLectura(
      'El lector no pudo leer esta foto. Sacala de nuevo (solo el remito, sin nada más) o cargala a mano.',
    )
  }
  if (respuesta.stop_reason === 'max_tokens') {
    throw new ErrorDeLectura(
      'El remito tiene demasiados renglones para leerlo de una vez. Cargalo a mano.',
    )
  }
  const texto = respuesta.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  const salida = salidaModeloSchema.safeParse(JSON.parse(texto))
  if (!salida.success) throw new Error(`Salida del modelo inválida: ${salida.error.message}`)
  return {
    salida: salida.data,
    modelo: respuesta.model,
    ms: Date.now() - inicio,
    uso: respuesta.usage,
  }
}

/** Traduce los errores de la API a algo que se pueda hacer (pasó en La Bodeguita: se quedó sin saldo). */
export function mensajeDeLaApi(error: unknown): string {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return 'La lectura tardó demasiado. Probá con una foto más nítida y recortada, o cargá el remito a mano.'
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'El lector está saturado en este momento. Esperá un minuto y sacá la foto de nuevo.'
  }
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return 'La clave del lector no es válida. Avisale a soporte; mientras tanto, cargá el remito a mano.'
  }
  if (error instanceof Anthropic.APIError) {
    const texto = error.message
    if (/credit balance is too low|insufficient.credit/i.test(texto)) {
      return 'Se quedó sin saldo la cuenta del lector. Avisale a soporte; mientras tanto, cargá el remito a mano.'
    }
    if (error.status === 529 || /overloaded/i.test(texto)) {
      return 'El lector está sobrecargado. Probá de nuevo en un rato, o cargá el remito a mano.'
    }
    if (/image|media_type|could not process/i.test(texto)) {
      return 'No se pudo procesar la foto. Sacala de nuevo, más derecha y con buena luz.'
    }
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return 'No hubo conexión con el lector. Probá de nuevo o cargá el remito a mano.'
  }
  return 'El lector falló. Probá de nuevo; si sigue, cargá el remito a mano.'
}
