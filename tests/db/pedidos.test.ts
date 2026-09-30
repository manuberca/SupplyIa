// Pedidos contra la base de desarrollo: numeración, cantidad base, reintentos sin duplicar,
// permisos por local y estados. Cada corrida crea su proveedor y al final lo archiva.

import { randomUUID } from 'node:crypto'
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
const c = {} as Record<(typeof USUARIOS)[number]['clave'], Cliente>

const corrida = Date.now().toString(36)
const proveedor = randomUUID()
const otroProveedor = randomUUID()
const tomate = randomUUID()
const lechuga = randomUUID()
const deOtro = randomUUID()
const caja = randomUUID()
const jaula = randomUUID()

type Item = {
  producto_id: string
  presentacion_id?: string | null
  cantidad: number
  precio_estimado_base?: number | null
}

function pedido(items: Item[], extra: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    local_id: LOCALES.aCentro.id,
    proveedor_id: proveedor,
    observaciones: 'Entregar por la puerta de atrás',
    creado_at: new Date().toISOString(),
    items: items.map((i) => ({
      id: randomUUID(),
      presentacion_id: null,
      precio_estimado_base: null,
      ...i,
    })),
    ...extra,
  }
}

async function guardar(cliente: Cliente, p: ReturnType<typeof pedido>) {
  return cliente.rpc('guardar_pedido', { pedido: p })
}

beforeAll(async () => {
  if (!url || !clavePublica || !clave) {
    throw new Error('Faltan variables en .env.local. Corré antes: npm run db:datos-prueba')
  }
  for (const u of USUARIOS) {
    const cliente = createClient<Database>(url, clavePublica, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error } = await cliente.auth.signInWithPassword({ email: u.email, password: clave })
    if (error) throw new Error(`No pude entrar como ${u.email}: ${error.message}`)
    c[u.clave] = cliente
  }
  const { data: unidades } = await c.adminA
    .from('unidades')
    .select('id, nombre')
    .eq('archivada', false)
  const kg = unidades!.find((u) => u.nombre === 'kg')!.id
  const unidad = unidades!.find((u) => u.nombre === 'unidad')!.id
  const numero = () => `+549341${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`

  const { error } = await c.adminA.rpc('importar_catalogo', {
    datos: {
      proveedores: [
        { id: proveedor, nombre: `Pedidos ${corrida}`, whatsapp: numero() },
        { id: otroProveedor, nombre: `Otro pedidos ${corrida}`, whatsapp: numero() },
      ],
      productos: [
        { id: tomate, proveedor_id: proveedor, nombre: 'Tomate', unidad_base_id: kg },
        { id: lechuga, proveedor_id: proveedor, nombre: 'Lechuga', unidad_base_id: unidad },
        { id: deOtro, proveedor_id: otroProveedor, nombre: 'Queso', unidad_base_id: kg },
      ],
      presentaciones: [
        { id: caja, producto_id: tomate, nombre: 'Caja', factor_a_base: 18 },
        { id: jaula, producto_id: lechuga, nombre: 'Jaula', factor_a_base: 12 },
      ],
    },
  })
  if (error) throw new Error(`No pude cargar el catálogo de prueba: ${error.message}`)
})

afterAll(async () => {
  await c.adminA.from('productos').update({ activo: false }).in('id', [tomate, lechuga, deOtro])
  await c.adminA.from('proveedores').update({ activo: false }).in('id', [proveedor, otroProveedor])
  await Promise.all(Object.values(c).map((x) => x.auth.signOut()))
})

describe('guardar un pedido', () => {
  it('guarda el pedido con su número y calcula la cantidad base en la base', async () => {
    const p = pedido([
      { producto_id: tomate, presentacion_id: caja, cantidad: 2, precio_estimado_base: 2900 },
      { producto_id: lechuga, cantidad: 5 },
    ])
    // Aunque la app mande otra cantidad base, manda la de la base.
    const { data, error } = await guardar(c.encargadoA, p)
    expect(error).toBeNull()
    expect(data).toMatchObject({ id: p.id, ya_estaba: false })
    expect((data as { numero: number }).numero).toBeGreaterThan(0)

    const { data: guardado } = await c.encargadoA
      .from('pedidos')
      .select(
        'numero, estado, observaciones, enviado_at, pedido_items ( cantidad, cantidad_base, precio_estimado_base )',
      )
      .eq('id', p.id)
      .single()
    expect(guardado?.estado).toBe('enviado')
    expect(guardado?.enviado_at).not.toBeNull()
    expect(guardado?.observaciones).toBe('Entregar por la puerta de atrás')
    expect(guardado?.pedido_items.map((i) => [i.cantidad, i.cantidad_base]).sort()).toEqual([
      [2, 36],
      [5, 5],
    ])
  })

  it('reintentar con el mismo id no duplica nada', async () => {
    const p = pedido([{ producto_id: tomate, cantidad: 3 }])
    const primero = await guardar(c.encargadoA, p)
    const segundo = await guardar(c.encargadoA, p)
    expect(segundo.error).toBeNull()
    expect(segundo.data).toMatchObject({
      ya_estaba: true,
      numero: (primero.data as { numero: number }).numero,
    })
    const { data } = await c.encargadoA.from('pedido_items').select('id').eq('pedido_id', p.id)
    expect(data).toHaveLength(1)
  })

  it('los números siguen en orden', async () => {
    const uno = await guardar(c.adminA, pedido([{ producto_id: tomate, cantidad: 1 }]))
    const dos = await guardar(c.adminA, pedido([{ producto_id: tomate, cantidad: 1 }]))
    expect((dos.data as { numero: number }).numero).toBe(
      (uno.data as { numero: number }).numero + 1,
    )
  })

  it('si un renglón está mal no se guarda nada', async () => {
    const p = pedido([
      { producto_id: tomate, cantidad: 1 },
      { producto_id: deOtro, cantidad: 1 },
    ])
    const { error } = await guardar(c.encargadoA, p)
    expect(error?.message).toMatch(/no es del proveedor del pedido/)
    const { data } = await c.encargadoA.from('pedidos').select('id').eq('id', p.id)
    expect(data).toEqual([])
  })

  it('la presentación tiene que ser del producto', async () => {
    const { error } = await guardar(
      c.encargadoA,
      pedido([{ producto_id: tomate, presentacion_id: jaula, cantidad: 1 }]),
    )
    expect(error?.message).toMatch(/presentación no es de ese producto/)
  })

  it('un pedido vacío no se guarda', async () => {
    const { error } = await guardar(c.encargadoA, pedido([]))
    expect(error?.message).toMatch(/no tiene productos/)
  })
})

describe('quién ve y quién pide', () => {
  it('recepción no puede pedir', async () => {
    const { error } = await guardar(
      c.recepcionA,
      pedido([{ producto_id: tomate, cantidad: 1 }], { local_id: LOCALES.aPichincha.id }),
    )
    expect(error?.message).toMatch(/Solo administración o encargado/)
  })

  it('recepción ve los pedidos de su local y no los de otro', async () => {
    const centro = pedido([{ producto_id: tomate, cantidad: 1 }])
    const pichincha = pedido([{ producto_id: tomate, cantidad: 1 }], {
      local_id: LOCALES.aPichincha.id,
    })
    await guardar(c.encargadoA, centro)
    await guardar(c.encargadoA, pichincha)

    const { data } = await c.recepcionA
      .from('pedidos')
      .select('id, pedido_items ( id )')
      .in('id', [centro.id, pichincha.id])
    expect(data?.map((p) => p.id)).toEqual([pichincha.id])
    expect(data?.[0]?.pedido_items).toHaveLength(1)
    const renglones = await c.recepcionA
      .from('pedido_items')
      .select('id')
      .eq('pedido_id', centro.id)
    expect(renglones.data).toEqual([])
  })

  it('B no ve los pedidos de A ni puede pedirle a un proveedor de A', async () => {
    const { data } = await c.adminB.from('pedidos').select('id').eq('org_id', ORGS.a.id)
    expect(data).toEqual([])
    const { error } = await guardar(
      c.adminB,
      pedido([{ producto_id: tomate, cantidad: 1 }], { local_id: LOCALES.bUnico.id }),
    )
    expect(error?.message).toMatch(/proveedor no existe o está archivado/)
  })

  it('no se puede pedir para un local de otra organización', async () => {
    const { error } = await guardar(
      c.encargadoA,
      pedido([{ producto_id: tomate, cantidad: 1 }], { local_id: LOCALES.bUnico.id }),
    )
    expect(error).not.toBeNull()
  })
})

describe('estados', () => {
  it('enviado → no llegó → enviado → cancelado, y de cancelado no se vuelve', async () => {
    const p = pedido([{ producto_id: tomate, cantidad: 1 }])
    await guardar(c.encargadoA, p)
    const cambiar = (estado: string) =>
      c.encargadoA.from('pedidos').update({ estado }).eq('id', p.id).select('estado')

    expect((await cambiar('no_llego')).data).toEqual([{ estado: 'no_llego' }])
    expect((await cambiar('enviado')).data).toEqual([{ estado: 'enviado' }])
    expect((await cambiar('cancelado')).data).toEqual([{ estado: 'cancelado' }])
    const volver = await cambiar('enviado')
    expect(volver.error?.message).toMatch(/Un pedido cancelado no puede pasar a enviado/)
  })

  it('recepción no cambia estados y nadie borra pedidos', async () => {
    const p = pedido([{ producto_id: tomate, cantidad: 1 }], { local_id: LOCALES.aPichincha.id })
    await guardar(c.encargadoA, p)
    const cambio = await c.recepcionA
      .from('pedidos')
      .update({ estado: 'cancelado' })
      .eq('id', p.id)
      .select()
    expect(cambio.data).toEqual([])
    for (const tabla of ['pedidos', 'pedido_items'] as const) {
      const { error } = await c.adminA.from(tabla).delete().eq('org_id', ORGS.a.id)
      expect(error?.code, tabla).toBe('42501')
    }
  })

  it('no se puede cambiar lo pedido después de guardado', async () => {
    const p = pedido([{ producto_id: tomate, cantidad: 1 }])
    await guardar(c.encargadoA, p)
    const { error } = await c.encargadoA
      .from('pedidos')
      .update({ proveedor_id: otroProveedor })
      .eq('id', p.id)
    expect(error?.code).toBe('42501')
  })
})
