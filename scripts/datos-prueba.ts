// Carga dos organizaciones de prueba en la base de DESARROLLO.
// Se puede correr las veces que haga falta: no duplica nada.
// Uso: npm run db:datos-prueba

import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { ORGS, LOCALES, USUARIOS } from '../tests/db/datos.ts'

const REF_DESARROLLO = 'efyulrowgyrxqubjelor' // supplyia-dev

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const url = process.env.VITE_SUPABASE_URL ?? ''
const claveServicio = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!url.includes(REF_DESARROLLO)) {
  console.error(`Este script solo corre contra la base de desarrollo (${REF_DESARROLLO}).`)
  console.error(`VITE_SUPABASE_URL apunta a: ${url || '(vacío)'}`)
  process.exit(1)
}
if (!claveServicio) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY en .env.local.')
  process.exit(1)
}

// La contraseña de los usuarios de prueba vive solo en .env.local.
let clave = process.env.DEV_TEST_PASSWORD
if (!clave) {
  clave = randomBytes(18).toString('base64url')
  appendFileSync('.env.local', `\n# Contraseña de los usuarios de prueba (solo desarrollo)\nDEV_TEST_PASSWORD=${clave}\n`)
  console.log('Generé DEV_TEST_PASSWORD y la guardé en .env.local.')
}

const db = createClient(url, claveServicio, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type Respuesta = { data: unknown; error: unknown }

async function paso<R extends Respuesta>(
  nombre: string,
  accion: PromiseLike<R>,
): Promise<Extract<R, { error: null }>['data']> {
  const { data, error } = await accion
  if (error) {
    console.error(`Falló: ${nombre}`, error)
    process.exit(1)
  }
  return data
}

await paso(
  'organizaciones',
  db.from('organizaciones').upsert(Object.values(ORGS), { onConflict: 'id', ignoreDuplicates: true }),
)
await paso('locales', db.from('locales').upsert(Object.values(LOCALES), { onConflict: 'id' }))

const existentes = await paso('listar usuarios', db.auth.admin.listUsers({ perPage: 1000 }))

for (const u of USUARIOS) {
  let id = existentes.users.find((x) => x.email === u.email)?.id
  if (id) {
    await paso(`actualizar ${u.email}`, db.auth.admin.updateUserById(id, { password: clave }))
  } else {
    const creado = await paso(
      `crear ${u.email}`,
      db.auth.admin.createUser({ email: u.email, password: clave, email_confirm: true }),
    )
    id = creado.user.id
  }
  await paso(
    `miembro ${u.email}`,
    db.from('miembros').upsert(
      { user_id: id, org_id: u.org_id, rol: u.rol, locales: u.locales, nombre: u.nombre },
      { onConflict: 'user_id' },
    ),
  )
  console.log(`✓ ${u.email} (${u.rol})`)
}

console.log('Listo: datos de prueba cargados en supplyia-dev.')
