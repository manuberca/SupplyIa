// El núcleo de la lectura con IA: arma el contexto del remito, llama a Claude con salida
// estructurada y devuelve lo leído. Lo usan la función /api/ocr y el script que prueba
// remitos reales (scripts/probar-remitos.ts), así los dos leen exactamente igual.

import Anthropic from '@anthropic-ai/sdk'
import { limpiarSecreto } from '../../../src/lib/secreto'
import { z } from 'zod'
import { rescatarParcial } from '../../../src/recepcion/continuar'
import { salidaModeloSchema, type SalidaModelo } from '../../../src/recepcion/lectura'
import { contextoDelRemito, continuacionDelRemito, SISTEMA } from './prompt'

// Sonnet 5.5, medido el 30/9 con 12 remitos armados de boletas reales de La Bodeguita
// (npm run remitos:armar / remitos:probar), mismo prompt y esfuerzo bajo:
//   Opus 5.5    7 de 12 a tiempo (5 cortados a los 24 s) · 92,3 % de campos bien
//   Sonnet 5.5  12 de 12 · 3,3 a 7,9 s · 96,9 % · la mitad de precio
// La velocidad manda: la IA escribe los renglones de a uno (unos 0,7 s cada uno) y Netlify corta
// la función a los 60 s. No cambiar el modelo sin volver a medir.
// Todo se cambia con variables de entorno.
const ESFUERZOS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
type Esfuerzo = (typeof ESFUERZOS)[number]

export const configuracion = () => ({
  modelo: process.env.OCR_MODEL || 'claude-sonnet-5-5',
  esfuerzo: ESFUERZOS.find((e) => e === process.env.OCR_EFFORT) ?? ('low' as Esfuerzo),
  // Netlify corta a los 60 s. A los 45 s se corta la lectura y se sigue en otro pedido con lo que
  // falte (boletas largas): quedan 15 s para la sesión, el catálogo y responder.
  corteMs: Number(process.env.OCR_DEADLINE_MS || 45_000),
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

// La foto estaba de costado y la primera lectura salió dudosa. Decir para qué lado girarla es
// justo lo que más le cuesta a la IA en una boleta densa; elegir entre dos, no.
const DOS_VERSIONES = `ATENCIÓN: te mando DOS imágenes. Son la MISMA boleta, girada de dos formas: en una el texto se lee derecho y en la otra está cabeza abajo. Mirá las dos, quedate con la que se lee derecho y leé la boleta SOLO de esa. En "giro" poné "90" si la que está derecha es la PRIMERA imagen, o "270" si es la SEGUNDA.`

export type Leido = {
  salida: SalidaModelo
  /** false: se cortó por tiempo (o por largo) y quedan renglones sin leer. */
  completa: boolean
  modelo: string
  ms: number
  uso: Anthropic.Beta.BetaUsage | null
}

const TARDO =
  'La lectura tardó demasiado. Probá con una foto más nítida y recortada, o cargá el remito a mano.'

export async function leerConIA(datos: {
  imagen: string
  /** La misma foto girada para el otro lado (ver DOS_VERSIONES). */
  alternativa?: string
  tipo: 'image/jpeg' | 'image/png' | 'image/webp'
  contexto: string
  /** Boleta larga: ya se leyeron `desde` renglones y esta lectura sigue después de `ultimo`. */
  continuar?: { desde: number; ultimo: string }
  /** Cuánto puede tardar esta lectura antes de cortarla y quedarse con lo que haya. */
  corteMs?: number
  modelo?: string
  esfuerzo?: Esfuerzo
}): Promise<Leido> {
  const config = configuracion()
  const modelo = datos.modelo ?? config.modelo
  const esfuerzo = datos.esfuerzo ?? config.esfuerzo
  const corteMs = datos.corteMs ?? config.corteMs
  const inicio = Date.now()
  const cliente = new Anthropic({
    apiKey: limpiarSecreto('ANTHROPIC_API_KEY', process.env.ANTHROPIC_API_KEY).valor,
    maxRetries: 0,
  })
  const pedido = [
    ...(datos.alternativa ? [DOS_VERSIONES] : []),
    datos.contexto,
    ...(datos.continuar
      ? [continuacionDelRemito(datos.continuar.desde, datos.continuar.ultimo)]
      : []),
  ].join('\n\n')

  // En streaming: si se acaba el tiempo, lo que ya escribió no se pierde.
  const pedir = async (restante: number) => {
    const stream = cliente.beta.messages.stream(
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
              ...[datos.imagen, ...(datos.alternativa ? [datos.alternativa] : [])].map((data) => ({
                type: 'image' as const,
                source: { type: 'base64' as const, media_type: datos.tipo, data },
              })),
              { type: 'text', text: pedido },
            ],
          },
        ],
      },
      { timeout: restante + 10_000 },
    )
    let texto = ''
    stream.on('streamEvent', (evento) => {
      // Si otro modelo retoma la lectura (fallback), lo escrito hasta ahí no vale.
      if (evento.type === 'content_block_start' && evento.content_block.type === 'fallback') {
        texto = ''
      } else if (evento.type === 'content_block_delta' && evento.delta.type === 'text_delta') {
        texto += evento.delta.text
      }
    })
    let cortada = false
    const reloj = setTimeout(() => {
      cortada = true
      stream.abort()
    }, restante)
    try {
      const mensaje = await stream.finalMessage()
      return { mensaje, texto }
    } catch (error) {
      if (!cortada) throw error
      return { mensaje: null, texto, uso: stream.currentMessage?.usage ?? null }
    } finally {
      clearTimeout(reloj)
    }
  }

  let respuesta
  try {
    respuesta = await pedir(corteMs)
  } catch (error) {
    // Saturada al instante: un reintento, solo si queda tiempo de sobra.
    const pasajero =
      error instanceof Anthropic.RateLimitError ||
      (error instanceof Anthropic.APIError &&
        typeof error.status === 'number' &&
        error.status >= 500)
    if (!pasajero || Date.now() - inicio > 6000) throw error
    await new Promise((r) => setTimeout(r, 900))
    respuesta = await pedir(corteMs - (Date.now() - inicio))
  }

  const { mensaje, texto } = respuesta
  if (mensaje?.stop_reason === 'refusal') {
    throw new ErrorDeLectura(
      'El lector no pudo leer esta foto. Sacala de nuevo (solo el remito, sin nada más) o cargala a mano.',
    )
  }
  // Se acabó el tiempo (o el largo de la respuesta): valen los renglones que salieron enteros.
  if (!mensaje || mensaje.stop_reason === 'max_tokens') {
    const salida = rescatarParcial(texto)
    if (!salida) throw new ErrorDeLectura(TARDO)
    return {
      salida,
      completa: false,
      modelo: mensaje?.model ?? modelo,
      ms: Date.now() - inicio,
      uso: mensaje?.usage ?? respuesta.uso ?? null,
    }
  }
  const salida = salidaModeloSchema.safeParse(JSON.parse(texto))
  if (!salida.success) throw new Error(`Salida del modelo inválida: ${salida.error.message}`)
  return {
    salida: salida.data,
    completa: true,
    modelo: mensaje.model,
    ms: Date.now() - inicio,
    uso: mensaje.usage,
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
