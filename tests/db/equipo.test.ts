// Etapa 7 — Equipo y locales: las altas solo entran por la función del servidor, dar de baja
// corta el acceso sin borrar nada, y siempre queda una administración y un local activo.
// Corre contra la base de desarrollo con los usuarios de `npm run db:datos-prueba`.

import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types'
import type { RespuestaEquipo } from '../../src/equipo/esquemas'
import { LOCALES, ORGS, USUARIOS } from './datos'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')
// Los errores de estas pruebas no van a Sentry.
delete process.env.VITE_SENTRY_DSN

const url = process.env.VITE_SUPABASE_URL ?? ''
const clavePublica = process.env.VITE_SUPABASE_ANON_KEY ?? ''
const clave = process.env.DEV_TEST_PASSWORD ?? ''
const INVITADO = 'invitado-a@supplyia.test'

type Cliente = SupabaseClient<Database>
const nuevoCliente = (llave = clavePublica): Cliente =>
  createClient<Database>(url, llave, { auth: { autoRefreshToken: false, persistSession: false } })

const c = {} as Record<(typeof USUARIOS)[number]['clave'], Cliente>
let servicio: Cliente
let handler: (req: Request) => Promise<Response>

async function invitar(
  quien: Cliente | null,
  cuerpo: unknown,
): Promise<{ status: number; cuerpo: RespuestaEquipo }> {
  const token = quien ? (await quien.auth.getSession()).data.session?.access_token : null
  const respuesta = await handler(
    new Request('http://localhost:5173/api/equipo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(cuerpo),
    }),
  )
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as RespuestaEquipo }
}

const invitacion = {
  email: INVITADO,
  nombre: 'Iván (invitado)',
  rol: 'recepcion',
  locales: [LOCALES.aCentro.id],
}

beforeAll(async () => {
  const claveServicio = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !clavePublica || !clave || !claveServicio) {
    throw new Error('Faltan variables en .env.local. Corré antes: npm run db:datos-prueba')
  }
  servicio = nuevoCliente(claveServicio)
  for (const u of USUARIOS) {
    const cliente = nuevoCliente()
    const { error } = await cliente.auth.signInWithPassword({ email: u.email, password: clave })
    if (error) throw new Error(`No pude entrar como ${u.email}: ${error.message}`)
    c[u.clave] = cliente
  }
  handler = (await import('../../netlify/functions/equipo/equipo.mts')).default

  // Punto de partida: si quedó de una corrida anterior, está dado de baja.
  await servicio.from('miembros').update({ activo: false }).eq('email', INVITADO)
})

afterAll(async () => {
  await servicio.from('miembros').update({ activo: false }).eq('email', INVITADO)
  await Promise.all(Object.values(c).map((x) => x.auth.signOut()))
})

describe('sumar gente al equipo (función /api/equipo)', () => {
  it('sin sesión no entra, y solo administración puede sumar', async () => {
    expect((await invitar(null, invitacion)).status).toBe(401)
    const encargado = await invitar(c.encargadoA, invitacion)
    expect(encargado.status).toBe(403)
    expect(encargado.cuerpo).toEqual({
      ok: false,
      error: 'Solo administración puede sumar gente al equipo.',
    })
  })

  it('rechaza un mail mal escrito y un local de otro bar', async () => {
    const mal = await invitar(c.adminA, { ...invitacion, email: 'sin-arroba' })
    expect(mal.cuerpo).toEqual({ ok: false, error: 'Revisá el mail: parece que está mal escrito.' })
    const mail = `nadie-${randomUUID().slice(0, 8)}@supplyia.test`
    const ajeno = await invitar(c.adminA, {
      ...invitacion,
      email: mail,
      locales: [LOCALES.bUnico.id],
    })
    expect(ajeno.cuerpo).toEqual({
      ok: false,
      error: 'Alguno de los locales elegidos no es de tu bar.',
    })
    // Y no quedó ningún usuario creado por el pedido rechazado.
    expect((await servicio.rpc('usuario_por_email', { p_email: mail })).data).toBeNull()
  })

  it('administración suma a una persona con su rol y sus locales; dos veces no', async () => {
    const r = await invitar(c.adminA, invitacion)
    expect(r.status).toBe(200)
    expect(r.cuerpo.ok).toBe(true)
    const { data } = await c.adminA
      .from('miembros')
      .select('org_id, rol, locales, nombre, activo, email')
      .eq('email', INVITADO)
      .single()
    expect(data).toEqual({
      org_id: ORGS.a.id,
      rol: 'recepcion',
      locales: [LOCALES.aCentro.id],
      nombre: 'Iván (invitado)',
      activo: true,
      email: INVITADO,
    })

    const otraVez = await invitar(c.adminA, invitacion)
    expect(otraVez.status).toBe(409)
    expect(otraVez.cuerpo).toEqual({ ok: false, error: 'Esa persona ya está en tu equipo.' })
  })

  it('otro bar no puede sumar a alguien que ya está en un bar', async () => {
    const r = await invitar(c.adminB, { ...invitacion, locales: null })
    expect(r.status).toBe(409)
    expect(r.cuerpo.ok).toBe(false)
    const { data } = await c.adminB.from('miembros').select('email').eq('email', INVITADO)
    expect(data).toEqual([])
  })
})

describe('dar de baja', () => {
  let invitado: Cliente

  beforeAll(async () => {
    // El invitado entra con código por mail; para la prueba se le pone la contraseña de prueba.
    const { data: id } = await servicio.rpc('usuario_por_email', { p_email: INVITADO })
    await servicio.auth.admin.updateUserById(id!, { password: clave })
    invitado = nuevoCliente()
    const { error } = await invitado.auth.signInWithPassword({ email: INVITADO, password: clave })
    if (error) throw error
  })

  it('activo, ve su bar y solo su local', async () => {
    expect((await invitado.from('organizaciones').select('id')).data).toEqual([{ id: ORGS.a.id }])
    expect((await invitado.from('locales').select('id')).data).toEqual([{ id: LOCALES.aCentro.id }])
  })

  it('solo administración da de baja', async () => {
    const { data } = await c.encargadoA
      .from('miembros')
      .update({ activo: false })
      .eq('email', INVITADO)
      .select()
    expect(data).toEqual([])
  })

  it('dado de baja no ve nada del bar, y no se borra', async () => {
    const baja = await c.adminA.from('miembros').update({ activo: false }).eq('email', INVITADO)
    expect(baja.error).toBeNull()

    expect((await invitado.from('organizaciones').select('id')).data).toEqual([])
    expect((await invitado.from('locales').select('id')).data).toEqual([])
    expect((await invitado.from('proveedores').select('id')).data).toEqual([])
    expect((await invitado.from('pedidos').select('id')).data).toEqual([])
    // Se sigue viendo a sí mismo (para que la app le explique que no tiene acceso).
    expect((await invitado.from('miembros').select('activo')).data).toEqual([{ activo: false }])
    // Y no puede reactivarse solo.
    const solo = await invitado
      .from('miembros')
      .update({ activo: true })
      .eq('email', INVITADO)
      .select()
    expect(solo.data).toEqual([])

    // Administración lo sigue viendo en el equipo, dado de baja.
    const { data } = await c.adminA.from('miembros').select('activo').eq('email', INVITADO)
    expect(data).toEqual([{ activo: false }])
  })

  it('volver a sumarlo lo reactiva con el rol nuevo', async () => {
    const r = await invitar(c.adminA, { ...invitacion, rol: 'encargado', locales: null })
    expect(r.cuerpo).toEqual({ ok: true, reactivado: true })
    const { data } = await c.adminA
      .from('miembros')
      .select('rol, locales, activo')
      .eq('email', INVITADO)
      .single()
    expect(data).toEqual({ rol: 'encargado', locales: null, activo: true })
    expect((await invitado.from('locales').select('id').eq('activo', true)).data).toHaveLength(2)
  })

  it('nadie borra miembros, ni se da de baja a sí mismo', async () => {
    const borrar = await c.adminA.from('miembros').delete().eq('email', INVITADO)
    expect(borrar.error?.code).toBe('42501')
    const { data: yo } = await c.adminA.auth.getUser()
    const { error } = await c.adminA
      .from('miembros')
      .update({ activo: false })
      .eq('user_id', yo.user!.id)
    expect(error?.message).toMatch(/No podés darte de baja a vos mismo/)
  })

  it('buscar usuarios por mail es solo para el servidor', async () => {
    const { data, error } = await c.adminA.rpc('usuario_por_email', { p_email: INVITADO })
    expect(data).toBeNull()
    expect(error).not.toBeNull()
  })
})

describe('locales', () => {
  it('administración agrega, renombra y archiva; el encargado no', async () => {
    const id = randomUUID()
    const nombre = `Sucursal ${id.slice(0, 6)}`
    const ajeno = await c.encargadoA.from('locales').insert({ id, org_id: ORGS.a.id, nombre })
    expect(ajeno.error?.code).toBe('42501')

    expect(
      (await c.adminA.from('locales').insert({ id, org_id: ORGS.a.id, nombre })).error,
    ).toBeNull()
    const repetido = await c.adminA
      .from('locales')
      .insert({ id: randomUUID(), org_id: ORGS.a.id, nombre: nombre.toUpperCase() })
    expect(repetido.error?.code).toBe('23505')

    expect(
      (
        await c.adminA
          .from('locales')
          .update({ nombre: `${nombre} bis` })
          .eq('id', id)
      ).error,
    ).toBeNull()
    expect((await c.adminA.from('locales').update({ activo: false }).eq('id', id)).error).toBeNull()
    // Archivado: administración lo sigue viendo; no se borra.
    const { data } = await c.adminA.from('locales').select('nombre, activo').eq('id', id).single()
    expect(data).toEqual({ nombre: `${nombre} bis`, activo: false })
    expect((await c.adminA.from('locales').delete().eq('id', id)).error?.code).toBe('42501')
  })

  it('el único local activo no se puede archivar', async () => {
    const { error } = await c.adminB
      .from('locales')
      .update({ activo: false })
      .eq('id', LOCALES.bUnico.id)
    expect(error?.message).toMatch(/al menos un local activo/)
  })
})
