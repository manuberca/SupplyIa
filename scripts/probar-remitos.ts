// Prueba la lectura con IA contra fotos de remitos reales (criterio de "listo" de la etapa 4).
// Lee cada foto igual que la app (misma compresión, mismo prompt, mismo catálogo del bar) y
// arma un informe para comparar contra el papel. Solo corre contra la base de DESARROLLO.
//
// Uso:
//   npm run remitos:probar -- <carpeta> [--bar "Bar Demo"] [--proveedor "Nombre"]
//
// La carpeta tiene las fotos (.jpg, .jpeg, .png, .webp). El proveedor de cada foto sale de
// --proveedor (el mismo para todas) o de un archivo proveedores.json en la carpeta:
//   { "remito-1.jpg": "Frigorífico San Jorge", "remito-2.jpg": "Verdulería Don Tito" }
// El informe queda en la misma carpeta (fuera del repo: las fotos tienen datos reales).
// No suma al tope de lecturas del bar: es una prueba.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/lib/database.types'
import { armarLectura } from '../src/recepcion/armar-lectura'
import { armarContexto, leerConIA } from '../netlify/functions/ocr/lector'
import { puntuar, type RenglonVerdadero } from '../src/recepcion/puntuar'

const REF_DESARROLLO = 'efyulrowgyrxqubjelor' // supplyia-dev

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    bar: { type: 'string', default: 'Bar Demo' },
    proveedor: { type: 'string' },
    // Como un proveedor nuevo: sin lo que la IA ya aprendió (equivalencias y correcciones).
    'sin-equivalencias': { type: 'boolean', default: false },
  },
})
const carpeta = positionals[0]
const salir = (mensaje: string): never => {
  console.error(mensaje)
  process.exit(1)
}

if (!carpeta || !existsSync(carpeta))
  salir(
    'Uso: npm run remitos:probar -- <carpeta con fotos> [--bar "Bar Demo"] [--proveedor "Nombre"]',
  )
const url = process.env.VITE_SUPABASE_URL ?? ''
if (!url.includes(REF_DESARROLLO))
  salir(`Este script solo corre contra la base de desarrollo (${REF_DESARROLLO}).`)
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) salir('Falta SUPABASE_SERVICE_ROLE_KEY en .env.local.')
if (!process.env.ANTHROPIC_API_KEY) salir('Falta ANTHROPIC_API_KEY en .env.local.')

const db = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: org } = await db
  .from('organizaciones')
  .select('id, nombre')
  .eq('nombre', values.bar!)
  .maybeSingle()
if (!org) salir(`No encontré la organización "${values.bar}" en dev.`)

const fotos = readdirSync(carpeta!)
  .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
  .sort()
if (fotos.length === 0)
  salir(
    'No hay fotos .jpg, .png o .webp en esa carpeta. (Las .heic del iPhone: exportalas como JPG.)',
  )

const mapa: Record<string, string> = existsSync(join(carpeta!, 'proveedores.json'))
  ? JSON.parse(readFileSync(join(carpeta!, 'proveedores.json'), 'utf8'))
  : {}

// Si la carpeta trae verdad.json (remitos:armar), cada lectura se puntúa sola.
type Verdad = { archivo: string; nro: string; total: number; items: RenglonVerdadero[] }
const verdades: Verdad[] = existsSync(join(carpeta!, 'verdad.json'))
  ? JSON.parse(readFileSync(join(carpeta!, 'verdad.json'), 'utf8'))
  : []
let aciertosTotales = 0
let camposTotales = 0

const pesos = (n: number | null) =>
  n === null ? '—' : `$${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
const informe: string[] = [
  `# Prueba de lectura de remitos — ${new Date().toLocaleString('es-AR')}`,
  '',
  `Bar: ${org!.nombre}`,
  '',
]
const resumen: {
  foto: string
  proveedor: string
  ms: number
  renglones: number
  asignados: number
  estado: string
  puntaje?: string
  error?: string
}[] = []

for (const foto of fotos) {
  const nombreProveedor = values.proveedor ?? mapa[foto]
  console.log(`\n▶ ${foto}`)
  if (!nombreProveedor) {
    console.log('  sin proveedor: agregalo en proveedores.json o usá --proveedor')
    resumen.push({
      foto,
      proveedor: '—',
      ms: 0,
      renglones: 0,
      asignados: 0,
      estado: 'sin proveedor',
    })
    continue
  }
  const { data: proveedor } = await db
    .from('proveedores')
    .select('id, nombre')
    .eq('org_id', org!.id)
    .eq('activo', true)
    .ilike('nombre', nombreProveedor)
    .maybeSingle()
  if (!proveedor) {
    console.log(`  no existe el proveedor "${nombreProveedor}" en ${org!.nombre}`)
    resumen.push({
      foto,
      proveedor: nombreProveedor,
      ms: 0,
      renglones: 0,
      asignados: 0,
      estado: 'proveedor inexistente',
    })
    continue
  }

  const [productos, equivalencias, correcciones] = await Promise.all([
    db
      .from('productos')
      .select(
        'id, nombre, unidades ( nombre ), presentaciones ( nombre, factor_a_base, aproximada, activa )',
      )
      .eq('proveedor_id', proveedor.id)
      .eq('activo', true)
      .order('nombre'),
    db.from('equivalencias').select('texto_remito, producto_id').eq('proveedor_id', proveedor.id),
    db
      .from('correcciones_ocr')
      .select('campo, detectado, correcto')
      .eq('proveedor_id', proveedor.id)
      .limit(20),
  ])
  const nombres = new Map((productos.data ?? []).map((p) => [p.id, p.nombre]))
  const { contexto, idPorRef } = armarContexto({
    proveedor: proveedor.nombre,
    productos: (productos.data ?? []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      unidad: p.unidades?.nombre ?? 'unidad',
      presentaciones: (p.presentaciones ?? [])
        .filter((x) => x.activa)
        .map((x) => ({ nombre: x.nombre, factor: x.factor_a_base, aproximada: x.aproximada })),
    })),
    equivalencias: values['sin-equivalencias']
      ? []
      : (equivalencias.data ?? []).map((e) => ({
          texto: e.texto_remito,
          productoId: e.producto_id,
        })),
    correcciones: values['sin-equivalencias'] ? [] : (correcciones.data ?? []),
  })

  // La misma compresión que hace la app en el celular.
  const imagen = await sharp(join(carpeta!, foto))
    .rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer()

  try {
    const leido = await leerConIA({
      imagen: imagen.toString('base64'),
      tipo: 'image/jpeg',
      contexto,
    })
    const l = armarLectura(leido.salida, idPorRef)
    const asignados = l.lineas.filter((x) => x.productoId).length
    const verdad = verdades.find((v) => v.archivo === foto)
    const p = verdad ? puntuar(l, verdad, (id) => nombres.get(id)) : null
    if (p) {
      aciertosTotales += p.aciertos
      camposTotales += p.campos
    }
    const puntaje = p ? `${p.aciertos}/${p.campos}` : undefined
    console.log(
      `  ${leido.ms} ms · ${l.lineas.length} renglones · ${asignados} asignados · cuentas: ${l.validacion.estado}${puntaje ? ` · puntaje ${puntaje}` : ''}`,
    )
    resumen.push({
      foto,
      proveedor: proveedor.nombre,
      ms: leido.ms,
      renglones: l.lineas.length,
      asignados,
      estado: l.validacion.estado,
      puntaje,
    })
    if (p) {
      const mal = p.renglones.filter(
        (r) => !(r.encontrado && r.cantidad && r.precio && r.subtotal && r.producto),
      )
      informe.push(
        `## ${foto} — puntaje ${puntaje}`,
        '',
        `Número ${p.nro ? '✓' : '✗'} · total ${p.total ? '✓' : '✗'}${p.sobrantes.length ? ` · leyó de más: ${p.sobrantes.join(', ')}` : ''}`,
        ...mal.map(
          (r) =>
            `- ${r.texto}: ${r.encontrado ? ['cantidad', 'precio', 'subtotal', 'producto'].filter((k) => !r[k as 'cantidad']).join(', ') + ' mal' : 'no lo leyó'}`,
        ),
        '',
      )
    }

    informe.push(
      `## ${foto} — ${proveedor.nombre}`,
      '',
      `Remito **${l.nroRemito ?? '—'}** · fecha ${l.fecha ?? '—'} · total **${pesos(l.totales.total)}** · ${leido.ms} ms · ${leido.modelo}`,
      `Cuentas: **${l.validacion.estado}**${l.validacion.observaciones.length ? ` — ${l.validacion.observaciones.join(' ')}` : ''}`,
      l.observaciones ? `Observaciones de la IA: ${l.observaciones}` : '',
      '',
      '| En el remito | Producto del bar | Cant. | Unidad | Precio | Subtotal | Confianza |',
      '|---|---|---:|---|---:|---:|---|',
      ...l.lineas.map(
        (x) =>
          `| ${x.texto} | ${x.productoId ? nombres.get(x.productoId) : '**sin asignar**'} | ${x.cantidad ?? '—'} | ${x.unidad ?? '—'} | ${pesos(x.precioUnit)} | ${pesos(x.subtotal)} | ${x.confianza}${x.observacion ? ` — ${x.observacion}` : ''} |`,
      ),
      '',
      `Tokens: ${leido.uso.input_tokens} de entrada (${leido.uso.cache_read_input_tokens ?? 0} desde la caché), ${leido.uso.output_tokens} de salida.`,
      '',
      '**Contra el papel:** ☐ número ☐ total ☐ cantidades ☐ precios ☐ productos bien asignados',
      '',
    )
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)
    console.log(`  ✗ ${mensaje}`)
    resumen.push({
      foto,
      proveedor: proveedor.nombre,
      ms: 0,
      renglones: 0,
      asignados: 0,
      estado: 'error',
      error: mensaje,
    })
    informe.push(`## ${foto} — ${proveedor.nombre}`, '', `✗ ${mensaje}`, '')
  }
}

informe.splice(
  4,
  0,
  ...(camposTotales
    ? [
        `**Puntaje total: ${aciertosTotales}/${camposTotales} (${((aciertosTotales / camposTotales) * 100).toFixed(1)}%)**${values['sin-equivalencias'] ? ' · sin equivalencias (como proveedor nuevo)' : ''}`,
        '',
      ]
    : []),
  '| Foto | Proveedor | Tiempo | Renglones | Asignados | Cuentas | Puntaje |',
  '|---|---|---:|---:|---:|---|---:|',
  ...resumen.map(
    (r) =>
      `| ${r.foto} | ${r.proveedor} | ${r.ms ? `${(r.ms / 1000).toFixed(1)} s` : '—'} | ${r.renglones} | ${r.asignados} | ${r.error ? `error: ${r.error}` : r.estado} | ${r.puntaje ?? '—'} |`,
  ),
  '',
)
const archivo = join(
  carpeta!,
  `informe-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.md`,
)
writeFileSync(archivo, informe.filter((l) => l !== null).join('\n'))
console.log(`\nInforme: ${archivo}`)
if (camposTotales) {
  console.log(
    `Puntaje total: ${aciertosTotales}/${camposTotales} (${((aciertosTotales / camposTotales) * 100).toFixed(1)}%)`,
  )
}
const lentos = resumen.filter((r) => r.ms > 22_000)
if (lentos.length)
  console.log(
    `⚠ ${lentos.length} tardaron más de 22 s: en Netlify pueden cortarse (ver OCR_DEADLINE_MS).`,
  )
