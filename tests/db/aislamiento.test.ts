// Criterio de "listo" de la etapa 1: dos organizaciones de prueba no ven los datos de la otra.
// Corre contra la base de desarrollo con los usuarios de `npm run db:datos-prueba`.

import { existsSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types'
import { LOCALES, ORGS, USUARIOS } from './datos'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const url = process.env.VITE_SUPABASE_URL ?? ''
const clavePublica = process.env.VITE_SUPABASE_ANON_KEY ?? ''
const clave = process.env.DEV_TEST_PASSWORD ?? ''

type Cliente = SupabaseClient<Database>
const nuevoCliente = (): Cliente =>
  createClient<Database>(url, clavePublica, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

const c = {} as Record<(typeof USUARIOS)[number]['clave'], Cliente>

beforeAll(async () => {
  if (!url || !clavePublica || !clave) {
    throw new Error('Faltan variables en .env.local. Corré antes: npm run db:datos-prueba')
  }
  for (const u of USUARIOS) {
    const cliente = nuevoCliente()
    const { error } = await cliente.auth.signInWithPassword({ email: u.email, password: clave })
    if (error) throw new Error(`No pude entrar como ${u.email}: ${error.message}`)
    c[u.clave] = cliente
  }
})

afterAll(async () => {
  await Promise.all(Object.values(c).map((x) => x.auth.signOut()))
})

describe('sin sesión', () => {
  it('no puede leer ninguna tabla', async () => {
    const anonimo = nuevoCliente()
    for (const tabla of ['organizaciones', 'locales', 'miembros', 'ajustes'] as const) {
      const { data, error } = await anonimo.from(tabla).select('*')
      expect(error?.code, tabla).toBe('42501')
      expect(data).toBeNull()
    }
  })
})

describe('aislamiento entre organizaciones', () => {
  it('cada admin ve solo su organización', async () => {
    const a = await c.adminA.from('organizaciones').select('id')
    const b = await c.adminB.from('organizaciones').select('id')
    expect(a.data).toEqual([{ id: ORGS.a.id }])
    expect(b.data).toEqual([{ id: ORGS.b.id }])
  })

  it('A no encuentra la organización de B ni pidiéndola por id', async () => {
    const { data } = await c.adminA.from('organizaciones').select('*').eq('id', ORGS.b.id)
    expect(data).toEqual([])
  })

  it('cada uno ve solo sus locales, ajustes y equipo', async () => {
    // Administración ve todo lo de su bar (también lo archivado o dado de baja) y nada de otro.
    const locales = await c.adminA.from('locales').select('org_id, activo')
    const ajustes = await c.adminA.from('ajustes').select('org_id')
    const miembros = await c.adminA.from('miembros').select('org_id, activo')
    expect(locales.data?.filter((x) => x.activo).length).toBe(2)
    expect(locales.data?.every((x) => x.org_id === ORGS.a.id)).toBe(true)
    expect(ajustes.data).toEqual([{ org_id: ORGS.a.id }])
    expect(miembros.data?.filter((x) => x.activo).length).toBe(3)
    expect(miembros.data?.every((x) => x.org_id === ORGS.a.id)).toBe(true)

    const localesB = await c.adminB.from('locales').select('id').eq('activo', true)
    expect(localesB.data).toEqual([{ id: LOCALES.bUnico.id }])
  })

  it('A no puede cambiar los ajustes de B', async () => {
    const { data } = await c.adminA
      .from('ajustes')
      .update({ umbral_alerta_pct: 99 })
      .eq('org_id', ORGS.b.id)
      .select()
    expect(data).toEqual([])
    const deB = await c.adminB.from('ajustes').select('umbral_alerta_pct').single()
    expect(deB.data?.umbral_alerta_pct).not.toBe(99)
  })

  it('A no puede crear un local dentro de B', async () => {
    const { error } = await c.adminA
      .from('locales')
      .insert({ org_id: ORGS.b.id, nombre: 'Intruso' })
    expect(error?.code).toBe('42501')
  })

  it('A no puede asignarle a su equipo un local de B', async () => {
    const recepcion = USUARIOS.find((u) => u.clave === 'recepcionA')!
    const { data: yo } = await c.recepcionA.auth.getUser()
    const { error } = await c.adminA
      .from('miembros')
      .update({ locales: [LOCALES.bUnico.id] })
      .eq('user_id', yo.user!.id)
    expect(error?.message).toMatch(/no es de esta organización/)
    // queda como estaba
    const { data } = await c.recepcionA.from('miembros').select('locales').single()
    expect(data?.locales).toEqual(recepcion.locales)
  })
})

describe('permisos por rol', () => {
  it('recepción ve solo el local que tiene asignado y solo a sí misma', async () => {
    const locales = await c.recepcionA.from('locales').select('id')
    const miembros = await c.recepcionA.from('miembros').select('rol')
    expect(locales.data).toEqual([{ id: LOCALES.aPichincha.id }])
    expect(miembros.data).toEqual([{ rol: 'recepcion' }])
  })

  it('encargado y recepción leen los ajustes pero no los cambian', async () => {
    for (const cliente of [c.encargadoA, c.recepcionA]) {
      const lectura = await cliente.from('ajustes').select('org_id')
      expect(lectura.data).toEqual([{ org_id: ORGS.a.id }])
      const { data } = await cliente
        .from('ajustes')
        .update({ umbral_alerta_pct: 50 })
        .eq('org_id', ORGS.a.id)
        .select()
      expect(data).toEqual([])
    }
  })

  it('nadie puede crearse una organización ni cambiarse el plan', async () => {
    const alta = await c.adminA.from('organizaciones').insert({ nombre: 'Trucha' })
    expect(alta.error?.code).toBe('42501')
    const plan = await c.adminA.from('organizaciones').update({ plan: 'gratis-para-siempre' }).eq('id', ORGS.a.id)
    expect(plan.error?.code).toBe('42501')
  })

  it('nadie puede sumar usuarios a su organización desde la app', async () => {
    const { data: otro } = await c.adminB.auth.getUser()
    const { error } = await c.adminA
      .from('miembros')
      .insert({ user_id: otro.user!.id, org_id: ORGS.a.id, rol: 'recepcion', nombre: 'Colado' })
    expect(error?.code).toBe('42501')
  })

  it('el único admin no se puede sacar el rol', async () => {
    const { data: yo } = await c.adminB.auth.getUser()
    const { error } = await c.adminB
      .from('miembros')
      .update({ rol: 'encargado' })
      .eq('user_id', yo.user!.id)
    expect(error?.message).toMatch(/al menos una persona con rol de administración/)
  })
})
