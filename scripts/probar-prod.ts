// Prueba de punta a punta contra PRODUCCIÓN, para correr después de cada deploy sin usar la
// cuenta de nadie: trabaja solo dentro de un bar de pruebas propio ("Bar de Pruebas SupplyIA"),
// con usuarios @supplyia.test que crea y maneja este script. No borra nada y no toca otros bares.
//
//   npm run prod:probar                       (equipo, contraseñas, aislamiento)
//   npm run prod:probar -- --foto remito.jpg  (además lee esa foto, o las de esa carpeta, con la
//                                              IA: gasta una lectura por foto)
//
// Verifica lo que solo se puede ver en producción: que el sitio publicado es el último, que las
// funciones del servidor tienen sus claves (Supabase y Anthropic) y que las reglas de la base
// de producción son las mismas que se probaron en desarrollo.

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { generarClave } from '../src/equipo/clave.ts'
import type { RespuestaEquipo } from '../src/equipo/esquemas.ts'
import type { Database } from '../src/lib/database.types.ts'
import type { RespuestaLectura } from '../src/recepcion/lectura.ts'
import type { RespuestaSalud } from '../netlify/functions/salud/salud.mts'

const REF_PROD = 'xrdujgrbmjgtcwxrkqer'
const SITIO = 'https://supplyia.netlify.app'
const BAR = 'Bar de Pruebas SupplyIA'
const ADMIN = 'pruebas-admin@supplyia.test'
const INVITADO = 'pruebas-invitado@supplyia.test'
const PROVEEDOR = 'Proveedor de prueba'

const { values } = parseArgs({ options: { foto: { type: 'string' } } })

if (!existsSync('.env.prod.local')) throw new Error('Falta .env.prod.local.')
process.loadEnvFile('.env.prod.local')
const url = process.env.VITE_SUPABASE_URL ?? ''
const clavePublica = process.env.VITE_SUPABASE_ANON_KEY ?? ''
const claveServicio = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url.includes(REF_PROD)) throw new Error('.env.prod.local no apunta a supplyia-prod.')
if (!clavePublica || !claveServicio) throw new Error('Faltan claves en .env.prod.local.')

type Cliente = SupabaseClient<Database>
const cliente = (llave: string): Cliente =>
  createClient<Database>(url, llave, { auth: { autoRefreshToken: false, persistSession: false } })
const servicio = cliente(claveServicio)

let fallas = 0
function control(nombre: string, ok: boolean, detalle = '') {
  if (!ok) fallas++
  console.log(`${ok ? '✓' : '✗'} ${nombre}${detalle ? ` — ${detalle}` : ''}`)
}
function exigir<T>(valor: T | null | undefined, que: string): T {
  if (valor === null || valor === undefined) {
    console.error(`✗ No se pudo seguir: ${que}`)
    process.exit(1)
  }
  return valor
}

async function entrar(email: string, password: string) {
  const c = cliente(clavePublica)
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  return { c, token: data.session?.access_token ?? null, usuario: data.user, error }
}

async function api<T>(ruta: string, token: string | null, cuerpo: unknown) {
  const respuesta = await fetch(`${SITIO}${ruta}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(cuerpo),
  })
  return { status: respuesta.status, cuerpo: (await respuesta.json().catch(() => null)) as T }
}

console.log(`Prueba en PRODUCCIÓN (${SITIO}), dentro de "${BAR}"\n`)

// ─── 1. El sitio publicado ─────────────────────────────────────────────────
const inicio = await fetch(SITIO)
const html = await inicio.text()
const paquete = /assets\/index-[^"]+\.js/.exec(html)?.[0]
const codigo = paquete ? await (await fetch(`${SITIO}/${paquete}`)).text() : ''
const ultimo = execSync('git rev-parse --short=7 origin/main').toString().trim()
control('El sitio responde', inicio.ok)
control(`Está publicado lo último de GitHub (${ultimo})`, codigo.includes(ultimo))
control('La app se puede actualizar sola (sw.js)', (await fetch(`${SITIO}/sw.js`)).ok)

// ─── 2. El bar de pruebas (se arma solo la primera vez; nunca se toca otro bar) ───
let { data: org } = await servicio
  .from('organizaciones')
  .select('id')
  .eq('nombre', BAR)
  .maybeSingle()
if (!org) {
  org = (await servicio.from('organizaciones').insert({ nombre: BAR }).select('id').single()).data
  console.log(`  (creé "${BAR}")`)
}
const orgId = exigir(org, 'crear el bar de pruebas').id
let { data: local } = await servicio
  .from('locales')
  .select('id')
  .eq('org_id', orgId)
  .eq('activo', true)
  .limit(1)
  .maybeSingle()
if (!local) {
  local = (
    await servicio.from('locales').insert({ org_id: orgId, nombre: 'Centro' }).select('id').single()
  ).data
}
const localId = exigir(local, 'crear el local de pruebas').id

// La administración de pruebas: en cada corrida recibe una contraseña nueva que nadie conoce.
const claveAdmin = generarClave()
let idAdmin = (await servicio.rpc('usuario_por_email', { p_email: ADMIN })).data
if (idAdmin) {
  await servicio.auth.admin.updateUserById(idAdmin, { password: claveAdmin })
} else {
  const creado = await servicio.auth.admin.createUser({
    email: ADMIN,
    email_confirm: true,
    password: claveAdmin,
  })
  idAdmin = exigir(creado.data.user, 'crear la administración de pruebas').id
}
const { data: miembroAdmin } = await servicio
  .from('miembros')
  .select('org_id')
  .eq('user_id', idAdmin)
  .maybeSingle()
if (miembroAdmin && miembroAdmin.org_id !== orgId) throw new Error(`${ADMIN} está en otro bar.`)
if (!miembroAdmin) {
  await servicio.from('miembros').insert({
    user_id: idAdmin,
    org_id: orgId,
    rol: 'admin',
    locales: null,
    nombre: 'Administración de pruebas',
    email: ADMIN,
  })
}
// Punto de partida: si el invitado quedó de otra corrida, está dado de baja (solo en este bar).
await servicio.from('miembros').update({ activo: false }).eq('email', INVITADO).eq('org_id', orgId)

// ─── 3. Sumar gente y contraseñas provisorias (función /api/equipo en producción) ───
const sinSesion = await api<RespuestaEquipo>('/api/equipo', null, {})
control('Sin sesión, las invitaciones no entran', sinSesion.status === 401)

const admin = await entrar(ADMIN, claveAdmin)
control('La administración de pruebas entra', !admin.error)
const tokenAdmin = exigir(admin.token, 'entrar como administración de pruebas')

// Las claves del servidor, sin verlas: ¿Supabase y Anthropic responden?
const salud = await api<RespuestaSalud>('/api/salud', tokenAdmin, {})
if (salud.cuerpo?.ok) {
  control(
    'La clave de servicio de Supabase funciona en Netlify',
    salud.cuerpo.supabase === 'ok',
    salud.cuerpo.supabase,
  )
  control(
    'La clave de Anthropic funciona en Netlify',
    salud.cuerpo.anthropic === 'ok',
    salud.cuerpo.anthropic,
  )
  const forma = salud.cuerpo.formas.supabase
  if (salud.cuerpo.supabase !== 'ok')
    console.log(
      `  ! En Netlify, SUPABASE_SERVICE_ROLE_KEY tiene ${forma.largo} caracteres, formato "${forma.formato}"${forma.rol ? `, rol ${forma.rol}` : ''}${forma.proyecto ? `, proyecto ${forma.proyecto}` : ''}. Tiene que ser un JWT con rol service_role del proyecto ${salud.cuerpo.proyecto}.`,
    )
  if (salud.cuerpo.clavesCorregidas.length)
    console.log(
      `  ! Mal pegadas en Netlify (se limpian solas, pero conviene pegarlas de nuevo): ${salud.cuerpo.clavesCorregidas.join(', ')}`,
    )
} else {
  control('El chequeo de salud responde', false, salud.cuerpo?.error ?? `HTTP ${salud.status}`)
}

const invitacion = {
  accion: 'invitar',
  email: INVITADO,
  nombre: 'Invitado de pruebas',
  rol: 'recepcion',
  locales: [localId],
}
const alta = await api<RespuestaEquipo>('/api/equipo', tokenAdmin, invitacion)
control(
  'Sumar a una persona devuelve su contraseña provisoria',
  alta.status === 200 && alta.cuerpo?.ok === true,
  alta.cuerpo && !alta.cuerpo.ok ? alta.cuerpo.error : '',
)
const provisoria = exigir(alta.cuerpo?.ok ? alta.cuerpo.clave : null, 'sumar al invitado')
const repetida = await api<RespuestaEquipo>('/api/equipo', tokenAdmin, invitacion)
control('No se puede sumar dos veces a la misma persona', repetida.status === 409)

const invitado = await entrar(INVITADO, provisoria)
control('La persona entra con su mail y la contraseña provisoria', !invitado.error)
control(
  'La app sabe que la contraseña es provisoria',
  invitado.usuario?.user_metadata.clave_provisoria === true,
)
const veOrgs = (await invitado.c.from('organizaciones').select('id')).data ?? []
const veLocales = (await invitado.c.from('locales').select('id')).data ?? []
control(
  'Ve solo su bar y su local (ningún otro bar de producción)',
  veOrgs.length === 1 && veOrgs[0]?.id === orgId && veLocales.length === 1,
  `${veOrgs.length} bar, ${veLocales.length} local`,
)
const equipoQueVe = (await invitado.c.from('miembros').select('user_id')).data ?? []
control('Recepción no ve al resto del equipo', equipoQueVe.length === 1)
const colado = await api<RespuestaEquipo>('/api/equipo', invitado.token, {
  ...invitacion,
  email: 'colado@supplyia.test',
})
control('Recepción no puede sumar gente', colado.status === 403)

const propia = `propia-${generarClave()}`
const cambio = await invitado.c.auth.updateUser({
  password: propia,
  data: { clave_provisoria: false },
})
control(
  'La persona cambia su contraseña y deja de ser provisoria',
  !cambio.error && cambio.data.user?.user_metadata.clave_provisoria === false,
)
control('La provisoria ya no sirve', !!(await entrar(INVITADO, provisoria)).error)
control('Entra con la suya', !(await entrar(INVITADO, propia)).error)

const idInvitado = exigir(invitado.usuario?.id, 'saber quién es el invitado')
const otra = await api<RespuestaEquipo>('/api/equipo', tokenAdmin, {
  accion: 'nueva_clave',
  userId: idInvitado,
})
control('Administración le genera una contraseña nueva', otra.cuerpo?.ok === true)
control('Con eso, la anterior deja de servir', !!(await entrar(INVITADO, propia)).error)

// ─── 4. Dar de baja ────────────────────────────────────────────────────────
const baja = await admin.c.from('miembros').update({ activo: false }).eq('user_id', idInvitado)
control('Administración da de baja', !baja.error)
const trasLaBaja = [
  (await invitado.c.from('organizaciones').select('id')).data,
  (await invitado.c.from('locales').select('id')).data,
  (await invitado.c.from('proveedores').select('id')).data,
]
control(
  'Dado de baja, no ve nada del bar',
  trasLaBaja.every((x) => x?.length === 0),
)
const sigue = await admin.c.from('miembros').select('activo').eq('user_id', idInvitado).single()
control('…y no se borró: sigue en el equipo, dado de baja', sigue.data?.activo === false)

// ─── 5. Lectura de un remito con IA (función /api/ocr en producción) ───────
if (values.foto) {
  let { data: proveedor } = await admin.c
    .from('proveedores')
    .select('id')
    .eq('nombre', PROVEEDOR)
    .maybeSingle()
  if (!proveedor) {
    const id = crypto.randomUUID()
    const { error } = await admin.c.rpc('importar_catalogo', {
      datos: {
        proveedores: [{ id, nombre: PROVEEDOR, whatsapp: '+5493410000000' }],
        productos: [],
      },
    })
    if (error) throw error
    proveedor = { id }
  }
  // Una foto o una carpeta de fotos, comprimidas igual que lo hace la app en el celular.
  const ruta = values.foto
  const fotos = statSync(ruta).isDirectory()
    ? readdirSync(ruta)
        .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
        .sort()
        .map((f) => join(ruta, f))
    : [ruta]
  for (const foto of fotos) {
    const imagen = await sharp(foto)
      .rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer()
    const inicioLectura = Date.now()
    const lectura = await api<RespuestaLectura>('/api/ocr', tokenAdmin, {
      proveedorId: proveedor.id,
      imagen: imagen.toString('base64'),
      tipo: 'image/jpeg',
    })
    const segundos = ((Date.now() - inicioLectura) / 1000).toFixed(1)
    const nombre = `La IA lee ${basename(foto)} en producción`
    if (lectura.cuerpo?.ok) {
      const l = lectura.cuerpo.lectura
      control(
        nombre,
        l.lineas.length > 0,
        `${segundos} s · boleta ${l.nroRemito ?? '—'} · total ${l.totales.total ?? '—'} · ${l.lineas.length} renglones · lecturas del mes ${lectura.cuerpo.uso.usadas}/${lectura.cuerpo.uso.tope}`,
      )
    } else {
      control(nombre, false, lectura.cuerpo?.error ?? `HTTP ${lectura.status}`)
    }
  }
} else {
  console.log('· Lectura con IA: sin --foto, no se probó.')
}

await Promise.all([
  admin.c.auth.signOut({ scope: 'local' }),
  invitado.c.auth.signOut({ scope: 'local' }),
])
console.log(fallas ? `\n${fallas} control(es) fallaron.` : '\nTodo bien en producción.')
process.exit(fallas ? 1 : 0)
