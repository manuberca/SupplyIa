// Recepciones contra la base de desarrollo: confirmar (idempotente), precios, diferencias,
// aprendizaje, estado del pedido, permisos por local y fotos por organización.

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
const tomate = randomUUID()
const lechuga = randomUUID()

async function nuevoPedido(local: string = LOCALES.aPichincha.id) {
  const id = randomUUID()
  const { error } = await c.encargadoA.rpc('guardar_pedido', {
    pedido: {
      id,
      local_id: local,
      proveedor_id: proveedor,
      items: [
        { id: randomUUID(), producto_id: tomate, cantidad: 10, precio_estimado_base: 2900 },
        { id: randomUUID(), producto_id: lechuga, cantidad: 6, precio_estimado_base: null },
      ],
    },
  })
  if (error) throw error
  return id
}

type Item = {
  producto_id: string | null
  texto_remito?: string
  cantidad_base: number
  precio_unit_base: number | null
  resultado: string
}

function recepcion(pedidoId: string | null, items: Item[], extra: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    local_id: LOCALES.aPichincha.id,
    proveedor_id: proveedor,
    pedido_id: pedidoId,
    origen: 'manual',
    nro_remito: `0001-${corrida}`,
    total_remito: 30000,
    estado_pedido: 'a_pagar',
    items: items.map((i) => ({ id: randomUUID(), texto_remito: '', ...i })),
    diferencias: [],
    correcciones: [],
    ...extra,
  }
}

beforeAll(async () => {
  if (!url || !clavePublica || !clave) throw new Error('Faltan variables en .env.local.')
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
  const { error } = await c.adminA.rpc('importar_catalogo', {
    datos: {
      proveedores: [
        {
          id: proveedor,
          nombre: `Recepciones ${corrida}`,
          whatsapp: `+549341${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
        },
      ],
      productos: [
        { id: tomate, proveedor_id: proveedor, nombre: 'Tomate', unidad_base_id: kg },
        { id: lechuga, proveedor_id: proveedor, nombre: 'Lechuga', unidad_base_id: unidad },
      ],
    },
  })
  if (error) throw error
})

afterAll(async () => {
  await c.adminA.from('productos').update({ activo: false }).in('id', [tomate, lechuga])
  await c.adminA.from('proveedores').update({ activo: false }).eq('id', proveedor)
  await Promise.all(Object.values(c).map((x) => x.auth.signOut()))
})

describe('confirmar una recepción', () => {
  it('recepción confirma un pedido completo: queda a pagar, con precios y equivalencias', async () => {
    const pedido = await nuevoPedido()
    const r = recepcion(pedido, [
      {
        producto_id: tomate,
        texto_remito: 'TOMATE PERITA X KG',
        cantidad_base: 10.2,
        precio_unit_base: 3000,
        resultado: 'ok',
      },
      {
        producto_id: lechuga,
        texto_remito: 'LECHUGA MANTECOSA',
        cantidad_base: 6,
        precio_unit_base: 1450,
        resultado: 'ok',
      },
    ])
    const { data, error } = await c.recepcionA.rpc('confirmar_recepcion', { recepcion: r })
    expect(error).toBeNull()
    expect(data).toEqual({ id: r.id, ya_estaba: false })

    const estado = await c.recepcionA.from('pedidos').select('estado').eq('id', pedido).single()
    expect(estado.data?.estado).toBe('a_pagar')

    const precio = await c.adminA
      .from('ultimos_precios')
      .select('precio_base')
      .eq('producto_id', tomate)
      .single()
    expect(precio.data?.precio_base).toBe(3000)

    const eq = await c.adminA
      .from('equivalencias')
      .select('texto_remito, producto_id')
      .eq('proveedor_id', proveedor)
      .order('texto_remito')
    expect(eq.data).toEqual([
      { texto_remito: 'LECHUGA MANTECOSA', producto_id: lechuga },
      { texto_remito: 'TOMATE PERITA X KG', producto_id: tomate },
    ])
  })

  it('reintentar con el mismo id no duplica nada', async () => {
    const r = recepcion(
      null,
      [{ producto_id: tomate, cantidad_base: 1, precio_unit_base: 3100, resultado: 'no_pedido' }],
      { estado_pedido: null },
    )
    await c.encargadoA.rpc('confirmar_recepcion', { recepcion: r })
    const otra = await c.encargadoA.rpc('confirmar_recepcion', { recepcion: r })
    expect(otra.data).toEqual({ id: r.id, ya_estaba: true })
    const items = await c.encargadoA.from('recepcion_items').select('id').eq('recepcion_id', r.id)
    expect(items.data).toHaveLength(1)
    const precios = await c.adminA.from('precios').select('id').eq('recepcion_id', r.id)
    expect(precios.data).toHaveLength(1)
  })

  it('con faltante y aumento: queda para revisar, con sus diferencias', async () => {
    const pedido = await nuevoPedido()
    const r = recepcion(
      pedido,
      [
        {
          producto_id: tomate,
          cantidad_base: 10,
          precio_unit_base: 3500,
          resultado: 'precio_subio',
        },
        { producto_id: lechuga, cantidad_base: 0, precio_unit_base: null, resultado: 'faltante' },
      ],
      {
        estado_pedido: 'revisar',
        diferencias: [
          {
            id: randomUUID(),
            producto_id: tomate,
            tipo: 'precio',
            monto: 5000,
            detalle: 'Tomate subió 16,7%',
          },
          {
            id: randomUUID(),
            producto_id: lechuga,
            tipo: 'faltante',
            monto: null,
            detalle: 'No vinieron 6 lechugas',
          },
        ],
        correcciones: [{ campo: 'cantidad', detectado: '100', correcto: '10' }],
      },
    )
    expect((await c.recepcionA.rpc('confirmar_recepcion', { recepcion: r })).error).toBeNull()
    expect(
      (await c.recepcionA.from('pedidos').select('estado').eq('id', pedido).single()).data?.estado,
    ).toBe('revisar')

    const difs = await c.recepcionA
      .from('diferencias')
      .select('id, tipo, estado')
      .eq('recepcion_id', r.id)
      .order('tipo')
    expect(difs.data?.map((d) => [d.tipo, d.estado])).toEqual([
      ['faltante', 'pendiente'],
      ['precio', 'pendiente'],
    ])
    // La lechuga que no llegó no suma precio al historial.
    const precios = await c.adminA.from('precios').select('producto_id').eq('recepcion_id', r.id)
    expect(precios.data).toEqual([{ producto_id: tomate }])

    // Recepción no resuelve diferencias; encargado sí.
    const id = difs.data![0]!.id
    expect(
      (await c.recepcionA.from('diferencias').update({ estado: 'reclamado' }).eq('id', id).select())
        .data,
    ).toEqual([])
    expect(
      (
        await c.encargadoA
          .from('diferencias')
          .update({ estado: 'reclamado' })
          .eq('id', id)
          .select('estado')
      ).data,
    ).toEqual([{ estado: 'reclamado' }])

    // Resuelto, el pedido pasa a pagar y después a pagado.
    expect(
      (
        await c.encargadoA
          .from('pedidos')
          .update({ estado: 'a_pagar' })
          .eq('id', pedido)
          .select('estado')
      ).data,
    ).toEqual([{ estado: 'a_pagar' }])
    expect(
      (
        await c.encargadoA
          .from('pedidos')
          .update({ estado: 'pagado' })
          .eq('id', pedido)
          .select('estado')
      ).data,
    ).toEqual([{ estado: 'pagado' }])

    const correcciones = await c.adminA
      .from('correcciones_ocr')
      .select('campo, detectado, correcto')
      .eq('proveedor_id', proveedor)
    expect(correcciones.data).toEqual([{ campo: 'cantidad', detectado: '100', correcto: '10' }])
  })

  it('un pedido no se puede pasar a pagar a mano sin recibirlo', async () => {
    const pedido = await nuevoPedido()
    const { error } = await c.encargadoA
      .from('pedidos')
      .update({ estado: 'a_pagar' })
      .eq('id', pedido)
    expect(error?.message).toMatch(/Un pedido enviado no puede pasar a a_pagar/)
  })

  it('un pedido cancelado no se puede recibir, y no queda nada guardado', async () => {
    const pedido = await nuevoPedido()
    await c.encargadoA.from('pedidos').update({ estado: 'cancelado' }).eq('id', pedido)
    const r = recepcion(pedido, [
      { producto_id: tomate, cantidad_base: 1, precio_unit_base: 1, resultado: 'ok' },
    ])
    const { error } = await c.encargadoA.rpc('confirmar_recepcion', { recepcion: r })
    expect(error?.message).toMatch(/cancelado no puede pasar/)
    expect((await c.encargadoA.from('recepciones').select('id').eq('id', r.id)).data).toEqual([])
  })
})

describe('permisos', () => {
  it('recepción no puede recibir en un local que no tiene', async () => {
    const r = recepcion(
      null,
      [{ producto_id: tomate, cantidad_base: 1, precio_unit_base: 1, resultado: 'no_pedido' }],
      {
        local_id: LOCALES.aCentro.id,
        estado_pedido: null,
      },
    )
    const { error } = await c.recepcionA.rpc('confirmar_recepcion', { recepcion: r })
    expect(error?.message).toMatch(/No tenés acceso a ese local/)
  })

  it('B no ve las recepciones de A ni puede recibir mercadería de un proveedor de A', async () => {
    const { data } = await c.adminB.from('recepciones').select('id').eq('org_id', ORGS.a.id)
    expect(data).toEqual([])
    const r = recepcion(
      null,
      [
        {
          producto_id: null,
          texto_remito: 'algo',
          cantidad_base: 1,
          precio_unit_base: 1,
          resultado: 'no_pedido',
        },
      ],
      {
        local_id: LOCALES.bUnico.id,
        estado_pedido: null,
      },
    )
    const { error } = await c.adminB.rpc('confirmar_recepcion', { recepcion: r })
    expect(error?.message).toMatch(/proveedor no es de esta organización/)
  })

  it('nadie escribe recepciones por fuera de confirmar_recepcion, ni borra nada', async () => {
    const alta = await c.adminA.from('recepciones').insert({
      id: randomUUID(),
      org_id: ORGS.a.id,
      local_id: LOCALES.aCentro.id,
      proveedor_id: proveedor,
      origen: 'manual',
    })
    expect(alta.error?.code).toBe('42501')
    for (const tabla of [
      'recepciones',
      'recepcion_items',
      'diferencias',
      'correcciones_ocr',
    ] as const) {
      const { error } = await c.adminA.from(tabla).delete().eq('org_id', ORGS.a.id)
      expect(error?.code, tabla).toBe('42501')
    }
  })

  it('el uso de lecturas lo ve solo administración', async () => {
    expect((await c.adminA.from('uso_lecturas').select('mes')).error).toBeNull()
    expect((await c.recepcionA.from('uso_lecturas').select('mes')).data).toEqual([])
  })

  it('las fotos van en la carpeta de la organización y B no las ve', async () => {
    const foto = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' })
    const camino = `${ORGS.a.id}/${randomUUID()}.jpg`
    expect((await c.recepcionA.storage.from('remitos').upload(camino, foto)).error).toBeNull()
    expect((await c.recepcionA.storage.from('remitos').download(camino)).error).toBeNull()
    expect((await c.adminB.storage.from('remitos').download(camino)).error).not.toBeNull()
    const ajena = await c.recepcionA.storage
      .from('remitos')
      .upload(`${ORGS.b.id}/${randomUUID()}.jpg`, foto)
    expect(ajena.error).not.toBeNull()
  })
})
