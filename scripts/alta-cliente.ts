// Alta de un cliente: la organización, sus locales y la primera persona de administración.
// Desde la app nadie puede crear organizaciones (lo hace SupplyIA con la clave de servicio).
// Después, esa persona suma al resto de su equipo desde Ajustes → Equipo.
//
//   npm run cliente:alta -- --nombre "Bar X" --locales "Centro, Norte" \
//     --admin dueño@mail.com --admin-nombre "Juan Pérez" [--prod] [--confirmar]
//
// Sin --confirmar solo muestra lo que haría. Sin --prod trabaja contra desarrollo (.env.local);
// con --prod, contra producción (.env.prod.local). Las unidades y los ajustes por defecto los
// crea la base sola al nacer la organización.

import { existsSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { generarClave } from '../src/equipo/clave.ts'
import type { Database } from '../src/lib/database.types.ts'

const REF = { dev: 'efyulrowgyrxqubjelor', prod: 'xrdujgrbmjgtcwxrkqer' } as const
const USO =
  'Uso: npm run cliente:alta -- --nombre "Bar X" --locales "Centro, Norte" --admin mail@x.com --admin-nombre "Nombre" [--prod] [--confirmar]'

function salir(mensaje: string): never {
  console.error(mensaje)
  process.exit(1)
}

const { values } = parseArgs({
  options: {
    nombre: { type: 'string' },
    locales: { type: 'string' },
    admin: { type: 'string' },
    'admin-nombre': { type: 'string' },
    prod: { type: 'boolean', default: false },
    confirmar: { type: 'boolean', default: false },
  },
})

const datos = z
  .object({
    nombre: z.string().trim().min(1).max(120),
    locales: z
      .string()
      // Sin repetidos, sin importar mayúsculas (la base los compara así).
      .transform((t) =>
        t
          .split(',')
          .map((x) => x.trim())
          .filter(
            (x, i, todos) => x && todos.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i,
          ),
      )
      .pipe(z.array(z.string().max(120)).min(1)),
    admin: z.string().trim().toLowerCase().pipe(z.email()),
    adminNombre: z.string().trim().min(1).max(120),
  })
  .safeParse({
    nombre: values.nombre,
    locales: values.locales,
    admin: values.admin,
    adminNombre: values['admin-nombre'],
  })
if (!datos.success) {
  salir(`${USO}\n\nRevisá: ${datos.error.issues.map((i) => i.path.join('.')).join(', ')}`)
}
const { nombre, locales, admin, adminNombre } = datos.data

const entorno = values.prod ? 'prod' : 'dev'
const archivo = values.prod ? '.env.prod.local' : '.env.local'
if (!existsSync(archivo)) salir(`Falta ${archivo}.`)
process.loadEnvFile(archivo)
const url = process.env.VITE_SUPABASE_URL ?? ''
const claveServicio = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
// Nunca el entorno equivocado: la dirección tiene que ser la del proyecto esperado.
if (!url.includes(REF[entorno]))
  salir(`${archivo} no apunta a supplyia-${entorno} (${REF[entorno]}).`)
if (!claveServicio) salir(`Falta SUPABASE_SERVICE_ROLE_KEY en ${archivo}.`)

const db = createClient<Database>(url, claveServicio, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Controles, antes de crear nada ────────────────────────────────────────
const { data: orgs, error: errorOrgs } = await db.from('organizaciones').select('id, nombre')
if (errorOrgs) salir(`No pude leer las organizaciones: ${errorOrgs.message}`)
const repetida = orgs.find((o) => o.nombre.trim().toLowerCase() === nombre.toLowerCase())
if (repetida) salir(`Ya existe una organización que se llama "${repetida.nombre}".`)

const { data: userId, error: errorUsuario } = await db.rpc('usuario_por_email', { p_email: admin })
if (errorUsuario) salir(`No pude buscar el mail: ${errorUsuario.message}`)
if (userId) {
  const { data: miembro } = await db
    .from('miembros')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (miembro) salir(`${admin} ya está en otra organización: cada persona puede estar en una sola.`)
}

console.log(`\nAlta en supplyia-${entorno.toUpperCase()}`)
console.log(`  Organización: ${nombre}`)
console.log(`  Locales:      ${locales.join(', ')}`)
console.log(
  `  Administra:   ${adminNombre} <${admin}>${userId ? ' (ya tiene usuario)' : ' (usuario nuevo)'}`,
)

if (!values.confirmar) {
  console.log('\nNo se creó nada. Si está bien, corré lo mismo con --confirmar.')
  process.exit(0)
}

// ─── Alta ──────────────────────────────────────────────────────────────────
const { data: org, error: errorOrg } = await db
  .from('organizaciones')
  .insert({ nombre })
  .select('id')
  .single()
if (errorOrg) salir(`No pude crear la organización: ${errorOrg.message}`)
console.log(`✓ organización ${org.id}`)

const { error: errorLocales } = await db
  .from('locales')
  .insert(locales.map((l) => ({ org_id: org.id, nombre: l })))
if (errorLocales)
  salir(`La organización quedó creada, pero fallaron los locales: ${errorLocales.message}`)
console.log(`✓ ${locales.length} ${locales.length === 1 ? 'local' : 'locales'}`)

// Usuario nuevo: nace con una contraseña provisoria, que se muestra una sola vez acá abajo.
let idAdmin = userId
const clave = idAdmin ? null : generarClave()
if (!idAdmin) {
  const creado = await db.auth.admin.createUser({
    email: admin,
    email_confirm: true,
    password: clave!,
    user_metadata: { clave_provisoria: true },
  })
  if (creado.error || !creado.data.user)
    salir(`Quedaron la organización y los locales, pero falló el usuario: ${creado.error?.message}`)
  idAdmin = creado.data.user.id
}
const { error: errorMiembro } = await db.from('miembros').insert({
  user_id: idAdmin,
  org_id: org.id,
  rol: 'admin',
  locales: null,
  nombre: adminNombre,
  email: admin,
})
if (errorMiembro)
  salir(
    `Quedaron la organización y los locales, pero falló la administración: ${errorMiembro.message}`,
  )
console.log(`✓ ${adminNombre} administra ${nombre}`)

console.log(`\nListo. ${adminNombre} entra en la app con:`)
console.log(`  Mail:        ${admin}`)
console.log(
  clave
    ? `  Contraseña:  ${clave}   (provisoria: la cambia en Ajustes; no se vuelve a mostrar)`
    : '  Contraseña:  la que ya tenía (su usuario existía)',
)
console.log(
  'Después carga sus proveedores (o importa la planilla) y suma a su equipo desde Ajustes.',
)
