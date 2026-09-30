// En `npm run dev`, las funciones de Netlify (netlify/functions/*) corren adentro del servidor de
// Vite, en la misma ruta que en producción (/api/…). Así no hace falta instalar la CLI de Netlify.

import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadEnv, type Plugin } from 'vite'

const FUNCIONES: Record<string, string> = {
  '/api/ocr': '/netlify/functions/ocr/ocr.mts',
}

async function leerCuerpo(req: IncomingMessage): Promise<Buffer> {
  const partes: Buffer[] = []
  for await (const parte of req) partes.push(parte as Buffer)
  return Buffer.concat(partes)
}

export function funcionesLocales(): Plugin {
  return {
    name: 'supplyia-funciones-locales',
    apply: 'serve',
    configureServer(server) {
      // Las funciones leen process.env (en Netlify, las variables del panel); acá, .env.local.
      const env = loadEnv(server.config.mode, process.cwd(), '')
      for (const [k, v] of Object.entries(env)) process.env[k] ??= v

      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const ruta = req.url?.split('?')[0] ?? ''
          const archivo = FUNCIONES[ruta]
          if (!archivo) return next()
          try {
            const modulo = (await server.ssrLoadModule(archivo)) as {
              default: (r: Request) => Promise<Response>
            }
            const cuerpo =
              req.method === 'GET' || req.method === 'HEAD' ? undefined : await leerCuerpo(req)
            const pedido = new Request(`http://${req.headers.host}${req.url}`, {
              method: req.method,
              headers: req.headers as Record<string, string>,
              body: cuerpo,
            })
            const respuesta = await modulo.default(pedido)
            res.statusCode = respuesta.status
            respuesta.headers.forEach((valor, clave) => res.setHeader(clave, valor))
            res.end(Buffer.from(await respuesta.arrayBuffer()))
          } catch (error) {
            console.error(`Falló ${ruta} en local`, error)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({ ok: false, error: 'La función falló en local. Mirá la terminal.' }),
            )
          }
        },
      )
    },
  }
}
