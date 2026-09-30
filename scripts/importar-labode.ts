// Pasa el catálogo de La Bodeguita (app actual) a SupplyIA: proveedores, productos, cómo
// figura cada uno en los remitos (equivalencias) y el último precio pagado.
//
// La app de La Bodeguita NO se toca: este script solo lee dos archivos JSON bajados de su
// backend con las mismas consultas de lectura que hace su app al abrir (maestros y boletas).
//
// Uso:
//   npm run labode:importar -- --maestros <maestros.json> --boletas <boletas.json> [--bar "Bar Demo"]
//                              [--excel <salida.xlsx>] [--confirmar]
//
// Sin --confirmar solo muestra qué haría. Con --excel arma la planilla con el formato de la app
// (Importar desde Excel), para cargarla desde la pantalla cuando La Bodeguita pase a SupplyIA.
// Solo escribe en la base de DESARROLLO.

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import writeXlsxFile from 'write-excel-file/node'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/lib/database.types'
import {
  COLUMNAS_PRODUCTOS,
  COLUMNAS_PROVEEDORES,
  prepararImportacion,
  type Celda,
} from '../src/catalogo/importacion'
import { AJUSTES_POR_DEFECTO, type Catalogo, type TipoUnidad } from '../src/catalogo/tipos'
import { normalizar, normalizarUnidad } from '../src/lib/normalizar'

const REF_DESARROLLO = 'efyulrowgyrxqubjelor' // supplyia-dev

type Maestros = {
  proveedores: { nombre: string; telefono: string; notas?: string }[]
  productos: { producto: string; proveedor: string; unidad: string; categoria?: string }[]
}
type Boletas = {
  boletas: {
    proveedor: string
    fecha: string
    recibidoEn?: string
    items?: { productoOriginalBoleta?: string; producto?: string; precioUnit?: number | string }[]
  }[]
}

// Las unidades de La Bodeguita, como las escribió cada uno, a las de SupplyIA.
// Las promos ("(2+1)") y los "pack x 10u" se cuentan por unidad o por pack.
const UNIDADES: [RegExp, string, TipoUnidad][] = [
  [/^(u|unidad|unidades|lata|\(\d+\+\d+\))$/i, 'unidad', 'unidad'],
  [/^kg$/i, 'kg', 'peso'],
  [/^gr?$/i, 'g', 'peso'],
  [/^lt?$/i, 'lt', 'volumen'],
  [/^horma$/i, 'horma', 'unidad'],
  [/^(pack|six pack|pack .*)$/i, 'pack', 'unidad'],
  [/^atado$/i, 'atado', 'unidad'],
  [/^caj[oó]n$/i, 'cajón', 'unidad'],
  [/^bolsa$/i, 'bolsa', 'unidad'],
  [/^caja( x .*)?$/i, 'caja', 'unidad'],
  [/^pouch$/i, 'pouch', 'unidad'],
  [/^(paq|paquete|paq x .*)$/i, 'paquete', 'unidad'],
  [/^balde( x .*)?$/i, 'balde', 'unidad'],
  [/^plancha$/i, 'plancha', 'unidad'],
  [/^rollo$/i, 'rollo', 'unidad'],
  [/^docena$/i, 'docena', 'unidad'],
]

function unidadDe(texto: string): { nombre: string; tipo: TipoUnidad } | null {
  const t = texto.trim()
  for (const [re, nombre, tipo] of UNIDADES) if (re.test(t)) return { nombre, tipo }
  return null
}

/** "9/6/2026, 10:32:26 a. m." o ISO → milisegundos (para quedarse con el precio más nuevo). */
function cuando(b: Boletas['boletas'][number]): number {
  const iso = Date.parse(b.recibidoEn ?? '')
  if (!Number.isNaN(iso)) return iso
  const m = b.fecha.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime() : 0
}

const { values } = parseArgs({
  options: {
    maestros: { type: 'string' },
    boletas: { type: 'string' },
    bar: { type: 'string', default: 'Bar Demo' },
    excel: { type: 'string' },
    confirmar: { type: 'boolean', default: false },
  },
})
const salir = (m: string): never => {
  console.error(m)
  process.exit(1)
}
if (
  !values.maestros ||
  !existsSync(values.maestros) ||
  !values.boletas ||
  !existsSync(values.boletas)
) {
  salir(
    'Uso: npm run labode:importar -- --maestros <maestros.json> --boletas <boletas.json> [--bar "Bar Demo"] [--excel salida.xlsx] [--confirmar]',
  )
}
const maestros = JSON.parse(readFileSync(values.maestros!, 'utf8')) as Maestros

// Errores de carga de La Bodeguita que la importación de SupplyIA no acepta. Se corrigen SOLO acá
// (los datos de La Bodeguita quedan como están) y se avisan, para arreglarlos allá si se quiere.
const ARREGLOS: { proveedor: string; que: string; aplicar: (m: Maestros) => void }[] = [
  {
    proveedor: 'Lucas Catena',
    que: 'el WhatsApp empieza con 594 en vez de 549 (dígitos invertidos)',
    aplicar: (m) => {
      const p = m.proveedores.find((x) => x.nombre === 'Lucas Catena')
      if (p?.telefono.startsWith('594')) p.telefono = `549${p.telefono.slice(3)}`
    },
  },
  {
    proveedor: 'Noblex',
    que: 'es un duplicado de Bazar Noblex (mismo WhatsApp, sin productos ni boletas): no se importa',
    aplicar: (m) => {
      const repetido = m.proveedores.find((x) => x.nombre === 'Noblex')
      const original = m.proveedores.find((x) => x.nombre === 'Bazar Noblex')
      const vacio = !m.productos.some((x) => x.proveedor === 'Noblex')
      if (repetido && original && repetido.telefono === original.telefono && vacio) {
        m.proveedores = m.proveedores.filter((x) => x !== repetido)
      }
    },
  },
]
for (const a of ARREGLOS) {
  if (maestros.proveedores.some((x) => x.nombre === a.proveedor)) {
    a.aplicar(maestros)
    console.log(`Arreglo · ${a.proveedor}: ${a.que}`)
  }
}
const boletas = (JSON.parse(readFileSync(values.boletas!, 'utf8')) as Boletas).boletas

// ─── Armar las dos hojas, igual que la planilla de la app ─────────────────
const productosDe = new Map<string, Maestros['productos']>()
for (const p of maestros.productos) {
  const k = normalizar(p.proveedor)
  productosDe.set(k, [...(productosDe.get(k) ?? []), p])
}

// Equivalencias (texto del remito → producto) y último precio, de las boletas ya confirmadas.
const equivalencias = new Map<string, Set<string>>() // proveedor|producto → textos
const precios = new Map<string, { precio: number; cuando: number }>()
for (const b of [...boletas].sort((x, y) => cuando(x) - cuando(y))) {
  for (const i of b.items ?? []) {
    if (!i.producto) continue
    const k = `${normalizar(b.proveedor)}|${normalizar(i.producto)}`
    const texto = i.productoOriginalBoleta?.trim()
    if (texto && normalizar(texto) !== normalizar(i.producto)) {
      equivalencias.set(k, (equivalencias.get(k) ?? new Set()).add(texto))
    }
    const precio = typeof i.precioUnit === 'number' ? i.precioUnit : Number(i.precioUnit)
    if (precio > 0) precios.set(k, { precio, cuando: cuando(b) })
  }
}

const sinUnidad: string[] = []
const filasProveedores: Celda[][] = maestros.proveedores.map((p) => [
  p.nombre.trim(),
  p.telefono,
  '',
  '',
])
const filasProductos: Celda[][] = []
// Un mismo texto de remito no puede apuntar a dos productos del mismo proveedor: gana el primero.
const textosUsados = new Set<string>()
for (const p of maestros.productos) {
  const unidad = unidadDe(p.unidad)
  if (!unidad) {
    sinUnidad.push(`${p.producto} (${p.unidad})`)
    continue
  }
  const k = `${normalizar(p.proveedor)}|${normalizar(p.producto)}`
  const textos = [...(equivalencias.get(k) ?? [])].filter((t) => {
    const clave = `${normalizar(p.proveedor)}|${normalizar(t)}`
    if (textosUsados.has(clave)) return false
    textosUsados.add(clave)
    return true
  })
  const precio = precios.get(k)?.precio ?? ''
  filasProductos.push([
    p.proveedor.trim(),
    p.producto.trim(),
    unidad.nombre,
    '',
    '',
    textos[0] ?? '',
    precio,
  ])
  for (const t of textos.slice(1))
    filasProductos.push([p.proveedor.trim(), p.producto.trim(), unidad.nombre, '', '', t, ''])
}

console.log(
  `La Bodeguita: ${maestros.proveedores.length} proveedores, ${maestros.productos.length} productos, ${boletas.length} boletas.`,
)
console.log(
  `Equivalencias: ${[...equivalencias.values()].reduce((s, x) => s + x.size, 0)} · con precio: ${precios.size}`,
)
if (sinUnidad.length)
  console.log(`⚠ Sin unidad reconocida (quedan afuera): ${sinUnidad.join(', ')}`)

if (values.excel) {
  await writeXlsxFile([
    { sheet: 'Proveedores', data: [[...COLUMNAS_PROVEEDORES], ...filasProveedores] as never },
    { sheet: 'Productos', data: [[...COLUMNAS_PRODUCTOS], ...filasProductos] as never },
  ]).toFile(values.excel)
  console.log(`Planilla para la app: ${values.excel}`)
}

// ─── Validar contra el catálogo del bar (misma lógica que la pantalla de importar) ───
if (existsSync('.env.local')) process.loadEnvFile('.env.local')
const url = process.env.VITE_SUPABASE_URL ?? ''
if (!url.includes(REF_DESARROLLO))
  salir(`Solo escribe en la base de desarrollo (${REF_DESARROLLO}).`)
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) salir('Falta SUPABASE_SERVICE_ROLE_KEY en .env.local.')
const db = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: org } = await db
  .from('organizaciones')
  .select('id, nombre')
  .eq('nombre', values.bar!)
  .maybeSingle()
if (!org) salir(`No encontré "${values.bar}" en dev.`)

// Las unidades que usa La Bodeguita y el bar todavía no tiene.
const { data: unidadesBar } = await db
  .from('unidades')
  .select('id, nombre, tipo, archivada')
  .eq('org_id', org!.id)
const faltan = new Map<string, TipoUnidad>()
for (const p of maestros.productos) {
  const u = unidadDe(p.unidad)
  if (
    u &&
    !unidadesBar!.some(
      (x) => !x.archivada && normalizarUnidad(x.nombre) === normalizarUnidad(u.nombre),
    )
  ) {
    faltan.set(u.nombre, u.tipo)
  }
}
if (faltan.size)
  console.log(`Unidades nuevas para ${org!.nombre}: ${[...faltan.keys()].join(', ')}`)

const nuevasUnidades = [...faltan].map(([nombre, tipo]) => ({
  id: randomUUID(),
  org_id: org!.id,
  nombre,
  tipo,
  archivada: false,
}))
const [proveedores, productos] = await Promise.all([
  db
    .from('proveedores')
    .select('id, nombre, whatsapp, dias_entrega, hora_limite, umbral_alerta_pct, activo')
    .eq('org_id', org!.id),
  db
    .from('productos')
    .select('id, proveedor_id, nombre, unidad_base_id, umbral_alerta_pct, activo')
    .eq('org_id', org!.id),
])
const catalogo: Catalogo = {
  ajustes: AJUSTES_POR_DEFECTO,
  unidades: [...unidadesBar!, ...nuevasUnidades].map((u) => ({ ...u, tipo: u.tipo as TipoUnidad })),
  proveedores: proveedores.data ?? [],
  productos: productos.data ?? [],
  presentaciones: [],
  precios: new Map(),
}
const r = prepararImportacion(
  [
    { nombre: 'Proveedores', filas: [[...COLUMNAS_PROVEEDORES], ...filasProveedores] },
    { nombre: 'Productos', filas: [[...COLUMNAS_PRODUCTOS], ...filasProductos] },
  ],
  catalogo,
  randomUUID,
)
console.log(
  `Se importarían: ${r.datos.proveedores.length} proveedores, ${r.datos.productos.length} productos, ` +
    `${r.datos.equivalencias.length} equivalencias, ${r.datos.precios.length} precios.`,
)
if (r.avisos.length) console.log(`Ya estaban (se dejan como están): ${r.avisos.length}`)
if (r.errores.length) {
  console.log(`\n${r.errores.length} filas con error:`)
  for (const e of r.errores) console.log(`  ${e.hoja} ${e.fila}: ${e.mensaje}`)
  salir('\nNo se importó nada.')
}
if (!values.confirmar) {
  console.log('\nPrueba sin cambios. Para importar de verdad: agregá --confirmar')
  process.exit(0)
}

// ─── Importar (con la clave de servicio, en el orden de las referencias) ──
const conOrg = <T extends object>(filas: T[]) => filas.map((f) => ({ ...f, org_id: org!.id }))
const pasos: [string, () => PromiseLike<{ error: unknown }>][] = [
  ['unidades', () => db.from('unidades').insert(nuevasUnidades)],
  ['proveedores', () => db.from('proveedores').insert(conOrg(r.datos.proveedores))],
  ['productos', () => db.from('productos').insert(conOrg(r.datos.productos))],
  ['presentaciones', () => db.from('presentaciones').insert(conOrg(r.datos.presentaciones))],
  ['equivalencias', () => db.from('equivalencias').insert(conOrg(r.datos.equivalencias))],
  [
    'precios',
    () =>
      db
        .from('precios')
        .insert(conOrg(r.datos.precios.map((p) => ({ ...p, origen: 'importacion' })))),
  ],
]
for (const [nombre, paso] of pasos) {
  const { error } = await paso()
  if (error) salir(`Falló al importar ${nombre}: ${JSON.stringify(error)}`)
  console.log(`✓ ${nombre}`)
}
console.log(`\nListo: catálogo de La Bodeguita cargado en ${org!.nombre} (dev).`)
