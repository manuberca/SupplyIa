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

const FORMATO_CLAVE = /^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/
/** La contraseña provisoria que devolvió la última invitación. */
let claveInvitado = ''

const entrar = async (password: string) => {
  const cliente = nuevoCliente()
  const { error } = await cliente.auth.signInWithPassword({ email: INVITADO, password })
  return { cliente, error }
}

const invitacion = {
  accion: 'invitar',
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
    if (!r.cuerpo.ok) throw new Error(r.cuerpo.error)
    // Devuelve la contraseña provisoria, una sola vez.
    expect(r.cuerpo.clave).toMatch(FORMATO_CLAVE)
    claveInvitado = r.cuerpo.clave
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
    // Entra con su mail y la contraseña provisoria que le pasó administración.
    const { cliente, error } = await entrar(claveInvitado)
    if (error) throw error
    invitado = cliente
  })

  it('la contraseña con la que entra está marcada como provisoria', async () => {
    const { data } = await invitado.auth.getUser()
    expect(data.user?.user_metadata.clave_provisoria).toBe(true)
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
    expect(r.cuerpo).toMatchObject({ ok: true, reactivado: true })
    if (!r.cuerpo.ok) throw new Error(r.cuerpo.error)
    // Vuelve con una contraseña nueva: la de antes ya no sirve.
    expect((await entrar(claveInvitado)).error).not.toBeNull()
    claveInvitado = r.cuerpo.clave
    expect((await entrar(claveInvitado)).error).toBeNull()
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

describe('contraseña nueva para alguien del equipo', () => {
  let userId: string

  beforeAll(async () => {
    userId = (await servicio.rpc('usuario_por_email', { p_email: INVITADO })).data!
  })

  it('solo administración, solo de su bar, y no la propia', async () => {
    const pedido = { accion: 'nueva_clave', userId }
    expect((await invitar(c.encargadoA, pedido)).status).toBe(403)
    const deOtroBar = await invitar(c.adminB, pedido)
    expect(deOtroBar.status).toBe(404)
    expect(deOtroBar.cuerpo).toEqual({ ok: false, error: 'Esa persona no está en tu equipo.' })
    // Nada de eso le cambió la contraseña.
    expect((await entrar(claveInvitado)).error).toBeNull()

    const { data: yo } = await c.adminA.auth.getUser()
    const propia = await invitar(c.adminA, { accion: 'nueva_clave', userId: yo.user!.id })
    expect(propia.cuerpo).toEqual({
      ok: false,
      error: 'Tu contraseña la cambiás vos, en "Cambiar contraseña".',
    })
  })

  it('administración genera otra: la anterior deja de servir', async () => {
    const r = await invitar(c.adminA, { accion: 'nueva_clave', userId })
    if (!r.cuerpo.ok) throw new Error(r.cuerpo.error)
    expect(r.cuerpo.clave).toMatch(FORMATO_CLAVE)
    expect(r.cuerpo.clave).not.toBe(claveInvitado)
    expect((await entrar(claveInvitado)).error).not.toBeNull()
    claveInvitado = r.cuerpo.clave
  })

  it('la persona la cambia por una suya y deja de ser provisoria', async () => {
    const { cliente, error } = await entrar(claveInvitado)
    expect(error).toBeNull()
    const propia = `propia-${randomUUID()}`
    const cambio = await cliente.auth.updateUser({
      password: propia,
      data: { clave_provisoria: false },
    })
    expect(cambio.error).toBeNull()
    expect(cambio.data.user?.user_metadata.clave_provisoria).toBe(false)
    expect((await entrar(claveInvitado)).error).not.toBeNull()
    expect((await entrar(propia)).error).toBeNull()
  })
})

describe('claves mal pegadas en el panel de Netlify', () => {
  it('las funciones las limpian y el chequeo de salud lo avisa, sin mostrar la clave', async () => {
    const buena = process.env.SUPABASE_SERVICE_ROLE_KEY!
    // Como si se hubieran pegado varios renglones del archivo en vez de solo la clave.
    process.env.SUPABASE_SERVICE_ROLE_KEY = `VITE_ALGO=x\nSUPABASE_SERVICE_ROLE_KEY="${buena}"\n`
    try {
      const salud = (await import('../../netlify/functions/salud/salud.mts')).default
      const token = (await c.adminA.auth.getSession()).data.session!.access_token
      const pedir = (t: string | null) =>
        salud(
          new Request('http://localhost:5173/api/salud', {
            method: 'POST',
            headers: t ? { Authorization: `Bearer ${t}` } : {},
          }),
        )
      expect((await pedir(null)).status).toBe(401)
      const respuesta = await pedir(token)
      const texto = await respuesta.text()
      expect(texto).not.toContain(buena)
      expect(JSON.parse(texto)).toMatchObject({
        ok: true,
        supabase: 'ok',
        clavesCorregidas: ['SUPABASE_SERVICE_ROLE_KEY'],
      })
      // Y sumar gente sigue andando con la clave así.
      const r = await invitar(c.adminA, { ...invitacion, email: 'sin-arroba' })
      expect(r.status).toBe(400)
      const repetido = await invitar(c.adminA, { accion: 'nueva_clave', userId: randomUUID() })
      expect(repetido.cuerpo).toEqual({ ok: false, error: 'Esa persona no está en tu equipo.' })
    } finally {
      process.env.SUPABASE_SERVICE_ROLE_KEY = buena
    }
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
