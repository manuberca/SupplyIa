// Criterio de "listo" de la etapa 2: se carga un proveedor con productos en caja y en kg,
// y no se puede duplicar ni borrar nada en uso. Corre contra la base de desarrollo.
// Cada corrida usa nombres propios y al final archiva lo que creó (nada se borra).

import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types'
import { ORGS, USUARIOS } from './datos'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const url = process.env.VITE_SUPABASE_URL ?? ''
const clavePublica = process.env.VITE_SUPABASE_ANON_KEY ?? ''
const clave = process.env.DEV_TEST_PASSWORD ?? ''

type Cliente = SupabaseClient<Database>
const c = {} as Record<(typeof USUARIOS)[number]['clave'], Cliente>

const corrida = Date.now().toString(36)
const whatsapp = () => `+549341${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
const creados = { proveedores: [] as string[], productos: [] as string[], unidades: [] as string[] }

let kgA = ''
let unidadA = ''

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
  const { data } = await c.adminA.from('unidades').select('id, nombre').eq('archivada', false)
  kgA = data!.find((u) => u.nombre === 'kg')!.id
  unidadA = data!.find((u) => u.nombre === 'unidad')!.id
})

afterAll(async () => {
  if (creados.productos.length) {
    await c.adminA.from('productos').update({ activo: false }).in('id', creados.productos)
  }
  if (creados.proveedores.length) {
    await c.adminA.from('proveedores').update({ activo: false }).in('id', creados.proveedores)
  }
  if (creados.unidades.length) {
    await c.adminA.from('unidades').update({ archivada: true }).in('id', creados.unidades)
  }
  await Promise.all(Object.values(c).map((x) => x.auth.signOut()))
})

async function nuevoProveedor(cliente: Cliente, nombre: string, numero = whatsapp()) {
  const id = randomUUID()
  const r = await cliente
    .from('proveedores')
    .insert({ id, org_id: ORGS.a.id, nombre, whatsapp: numero, dias_entrega: [1, 3, 5] })
  if (!r.error) creados.proveedores.push(id)
  return { id, error: r.error }
}

async function nuevoProducto(proveedorId: string, nombre: string, unidad = kgA) {
  const id = randomUUID()
  const r = await c.encargadoA
    .from('productos')
    .insert({ id, org_id: ORGS.a.id, proveedor_id: proveedorId, nombre, unidad_base_id: unidad })
  if (!r.error) creados.productos.push(id)
  return { id, error: r.error }
}

describe('unidades', () => {
  it('cada organización arranca con las 10 unidades de siempre y solo ve las suyas', async () => {
    const a = await c.adminA.from('unidades').select('nombre, org_id').eq('archivada', false)
    const b = await c.adminB.from('unidades').select('nombre, org_id')
    for (const nombre of [
      'kg',
      'g',
      'lt',
      'unidad',
      'atado',
      'caja',
      'bolsa',
      'jaula',
      'maple',
      'bidón',
    ]) {
      expect(a.data?.map((u) => u.nombre)).toContain(nombre)
      expect(b.data?.map((u) => u.nombre)).toContain(nombre)
    }
    expect(a.data?.every((u) => u.org_id === ORGS.a.id)).toBe(true)
    expect(b.data?.every((u) => u.org_id === ORGS.b.id)).toBe(true)
  })

  it('no se repite una unidad aunque se escriba en plural o con mayúsculas', async () => {
    for (const nombre of ['Kilos', 'CAJAS', ' Atados ', 'Unidades']) {
      const { error } = await c.encargadoA
        .from('unidades')
        .insert({ org_id: ORGS.a.id, nombre, tipo: 'unidad' })
      expect(error?.message, nombre).toMatch(/unidades_nombre_unico/)
    }
  })

  it('encargado crea una unidad nueva pero no la puede archivar', async () => {
    const id = randomUUID()
    const alta = await c.encargadoA
      .from('unidades')
      .insert({ id, org_id: ORGS.a.id, nombre: `pack ${corrida}`, tipo: 'unidad' })
    expect(alta.error).toBeNull()
    creados.unidades.push(id)

    const { data } = await c.encargadoA
      .from('unidades')
      .update({ archivada: true })
      .eq('id', id)
      .select()
    expect(data).toEqual([])
  })

  it('una unidad en uso no se archiva hasta reasignar sus productos', async () => {
    const id = randomUUID()
    await c.adminA
      .from('unidades')
      .insert({ id, org_id: ORGS.a.id, nombre: `horma ${corrida}`, tipo: 'unidad' })
    creados.unidades.push(id)
    const prov = await nuevoProveedor(c.adminA, `Quesería ${corrida}`)
    const prod = await nuevoProducto(prov.id, 'Queso tybo', id)
    expect(prod.error).toBeNull()

    const archivar = await c.adminA.from('unidades').update({ archivada: true }).eq('id', id)
    expect(archivar.error?.message).toMatch(/la usan: Queso tybo\. Cambiales la unidad/)

    await c.adminA.from('productos').update({ unidad_base_id: kgA }).eq('id', prod.id)
    const ahora = await c.adminA.from('unidades').update({ archivada: true }).eq('id', id)
    expect(ahora.error).toBeNull()
  })

  it('no se puede usar una unidad archivada para un producto nuevo', async () => {
    const id = randomUUID()
    await c.adminA
      .from('unidades')
      .insert({ id, org_id: ORGS.a.id, nombre: `cajón ${corrida}`, tipo: 'unidad' })
    await c.adminA.from('unidades').update({ archivada: true }).eq('id', id)
    const prov = await nuevoProveedor(c.adminA, `Frutería ${corrida}`)
    const prod = await nuevoProducto(prov.id, 'Naranja', id)
    expect(prod.error?.message).toMatch(/archivada/)
  })
})

describe('proveedores y productos', () => {
  it('se carga un proveedor con un producto en caja y otro en kg', async () => {
    const prov = await nuevoProveedor(c.encargadoA, `Verdulería ${corrida}`)
    expect(prov.error).toBeNull()

    const tomate = await nuevoProducto(prov.id, 'Tomate perita')
    const lechuga = await nuevoProducto(prov.id, 'Lechuga', unidadA)
    expect(tomate.error).toBeNull()
    expect(lechuga.error).toBeNull()

    const caja = await c.encargadoA.from('presentaciones').insert([
      { org_id: ORGS.a.id, producto_id: tomate.id, nombre: 'Caja', factor_a_base: 18 },
      { org_id: ORGS.a.id, producto_id: lechuga.id, nombre: 'Jaula', factor_a_base: 12 },
    ])
    expect(caja.error).toBeNull()

    const { data } = await c.recepcionA
      .from('productos')
      .select('nombre, unidades ( nombre ), presentaciones ( nombre, factor_a_base )')
      .eq('proveedor_id', prov.id)
      .order('nombre')
    expect(data).toEqual([
      {
        nombre: 'Lechuga',
        unidades: { nombre: 'unidad' },
        presentaciones: [{ nombre: 'Jaula', factor_a_base: 12 }],
      },
      {
        nombre: 'Tomate perita',
        unidades: { nombre: 'kg' },
        presentaciones: [{ nombre: 'Caja', factor_a_base: 18 }],
      },
    ])
  })

  it('no se repite el nombre ni el WhatsApp entre proveedores activos', async () => {
    const numero = whatsapp()
    const prov = await nuevoProveedor(c.adminA, `Carnicería ${corrida}`, numero)
    expect(prov.error).toBeNull()

    const mismoNombre = await nuevoProveedor(c.adminA, `  CARNICERÍA  ${corrida} `)
    expect(mismoNombre.error?.message).toMatch(/proveedores_nombre_unico/)

    const mismoNumero = await nuevoProveedor(c.adminA, `Otra carnicería ${corrida}`, numero)
    expect(mismoNumero.error?.message).toMatch(/proveedores_whatsapp_unico/)

    // Archivado, el nombre y el número quedan libres.
    await c.adminA.from('proveedores').update({ activo: false }).eq('id', prov.id)
    const deNuevo = await nuevoProveedor(c.adminA, `Carnicería ${corrida}`, numero)
    expect(deNuevo.error).toBeNull()
  })

  it('el WhatsApp tiene que ser un celular argentino en formato +549…', async () => {
    const r = await nuevoProveedor(c.adminA, `Mal número ${corrida}`, '341 555-1234')
    expect(r.error?.message).toMatch(/proveedores_whatsapp_check/)
  })

  it('no se repite un producto en el mismo proveedor, pero sí en otro', async () => {
    const uno = await nuevoProveedor(c.adminA, `Almacén ${corrida}`)
    const otro = await nuevoProveedor(c.adminA, `Mayorista ${corrida}`)
    expect((await nuevoProducto(uno.id, 'Aceite de girasol')).error).toBeNull()
    expect((await nuevoProducto(uno.id, 'aceite de  GIRASOL')).error?.message).toMatch(
      /productos_nombre_unico/,
    )
    expect((await nuevoProducto(otro.id, 'Aceite de girasol')).error).toBeNull()
  })

  it('el factor de una presentación tiene que ser mayor a 0', async () => {
    const prov = await nuevoProveedor(c.adminA, `Huevos ${corrida}`)
    const prod = await nuevoProducto(prov.id, 'Huevo', unidadA)
    const { error } = await c.adminA
      .from('presentaciones')
      .insert({ org_id: ORGS.a.id, producto_id: prod.id, nombre: 'Maple', factor_a_base: 0 })
    expect(error?.message).toMatch(/presentaciones_factor_a_base_check/)
  })
})

describe('nada se borra y cada uno en lo suyo', () => {
  it('nadie puede borrar nada del catálogo, ni administración', async () => {
    const prov = await nuevoProveedor(c.adminA, `Borrable ${corrida}`)
    for (const tabla of [
      'proveedores',
      'unidades',
      'productos',
      'presentaciones',
      'precios',
      'equivalencias',
    ] as const) {
      const { error } = await c.adminA.from(tabla).delete().eq('org_id', ORGS.a.id)
      expect(error?.code, tabla).toBe('42501')
    }
    const { data } = await c.adminA.from('proveedores').select('id').eq('id', prov.id)
    expect(data).toHaveLength(1)
  })

  it('recepción ve el catálogo pero no lo puede cargar ni cambiar', async () => {
    const lectura = await c.recepcionA.from('proveedores').select('id').limit(1)
    expect(lectura.error).toBeNull()
    const alta = await nuevoProveedor(c.recepcionA, `Recepción ${corrida}`)
    expect(alta.error?.code).toBe('42501')
    const { data } = await c.recepcionA
      .from('proveedores')
      .update({ nombre: 'Cambiado' })
      .eq('org_id', ORGS.a.id)
      .select()
    expect(data).toEqual([])
  })

  it('B no ve el catálogo de A', async () => {
    for (const tabla of [
      'proveedores',
      'productos',
      'presentaciones',
      'precios',
      'equivalencias',
    ] as const) {
      const { data } = await c.adminB.from(tabla).select('org_id').eq('org_id', ORGS.a.id)
      expect(data, tabla).toEqual([])
    }
  })

  it('A no puede colgarle un producto a un proveedor de B', async () => {
    const provB = randomUUID()
    const alta = await c.adminB
      .from('proveedores')
      .insert({ id: provB, org_id: ORGS.b.id, nombre: `De B ${corrida}`, whatsapp: whatsapp() })
    expect(alta.error).toBeNull()

    const intruso = await c.adminA
      .from('productos')
      .insert({ org_id: ORGS.a.id, proveedor_id: provB, nombre: 'Intruso', unidad_base_id: kgA })
    expect(intruso.error?.message).toMatch(/no es de esta organización/)

    await c.adminB.from('proveedores').update({ activo: false }).eq('id', provB)
  })
})

describe('comparar proveedores', () => {
  it('se comparan productos de proveedores distintos, en la misma unidad y del mismo bar', async () => {
    const uno = await nuevoProveedor(c.adminA, `Quesos Uno ${corrida}`)
    const dos = await nuevoProveedor(c.adminA, `Quesos Dos ${corrida}`)
    const azulUno = await nuevoProducto(uno.id, 'Queso Azul x Kg')
    const azulDos = await nuevoProducto(dos.id, 'Queso Azul La Quesera')
    const brieUno = await nuevoProducto(uno.id, 'Queso Brie')
    const hormaDos = await nuevoProducto(dos.id, 'Queso Azul en horma', unidadA)
    const grupo = randomUUID()

    // El encargado los marca como el mismo producto.
    const ok = await c.encargadoA
      .from('productos')
      .update({ comparable_id: grupo })
      .in('id', [azulUno.id, azulDos.id])
    expect(ok.error).toBeNull()

    // Otro producto del mismo proveedor no entra en el grupo…
    const mismo = await c.encargadoA
      .from('productos')
      .update({ comparable_id: grupo })
      .eq('id', brieUno.id)
    expect(mismo.error?.message).toMatch(/proveedores distintos/)
    // …ni uno que se compra en otra unidad.
    const otraUnidad = await c.encargadoA
      .from('productos')
      .update({ comparable_id: grupo })
      .eq('id', hormaDos.id)
    expect(otraUnidad.error?.message).toMatch(/misma unidad/)

    // Recepción no arma comparaciones, y otro bar no puede colarse en el grupo.
    const recepcion = await c.recepcionA
      .from('productos')
      .update({ comparable_id: null })
      .eq('id', azulUno.id)
      .select()
    expect(recepcion.data ?? []).toEqual([])
    const { data: deB } = await c.adminB.from('productos').select('id').limit(1)
    if (deB?.[0]) {
      const colado = await c.adminB
        .from('productos')
        .update({ comparable_id: grupo })
        .eq('id', deB[0].id)
      expect(colado.error?.message).toMatch(/no es de esta organización/)
    }

    const { data } = await c.adminA.from('productos').select('id').eq('comparable_id', grupo)
    expect(data?.map((p) => p.id).sort()).toEqual([azulUno.id, azulDos.id].sort())
  })
})

describe('importación', () => {
  it('importa proveedores, productos, presentaciones, equivalencias y precios de una vez', async () => {
    const prov = randomUUID()
    const prod = randomUUID()
    const { data, error } = await c.encargadoA.rpc('importar_catalogo', {
      datos: {
        proveedores: [
          {
            id: prov,
            nombre: `Importado ${corrida}`,
            whatsapp: whatsapp(),
            dias_entrega: [2, 4],
            hora_limite: '18:00 del día anterior',
          },
        ],
        productos: [{ id: prod, proveedor_id: prov, nombre: 'Papa', unidad_base_id: kgA }],
        presentaciones: [
          { id: randomUUID(), producto_id: prod, nombre: 'Bolsa', factor_a_base: 25 },
        ],
        equivalencias: [
          {
            id: randomUUID(),
            proveedor_id: prov,
            texto_remito: 'PAPA NEGRA X KG',
            producto_id: prod,
          },
        ],
        precios: [{ id: randomUUID(), proveedor_id: prov, producto_id: prod, precio_base: 900 }],
      },
    })
    expect(error).toBeNull()
    creados.proveedores.push(prov)
    creados.productos.push(prod)
    expect(data).toEqual({
      proveedores: 1,
      productos: 1,
      presentaciones: 1,
      equivalencias: 1,
      precios: 1,
    })

    const precio = await c.recepcionA
      .from('ultimos_precios')
      .select('precio_base')
      .eq('producto_id', prod)
      .single()
    expect(precio.data?.precio_base).toBe(900)
    const dias = await c.adminA.from('proveedores').select('dias_entrega').eq('id', prov).single()
    expect(dias.data?.dias_entrega).toEqual([2, 4])
  })

  it('si una fila falla no entra nada', async () => {
    const prov = randomUUID()
    const nombre = `A medias ${corrida}`
    const { error } = await c.adminA.rpc('importar_catalogo', {
      datos: {
        proveedores: [{ id: prov, nombre, whatsapp: whatsapp() }],
        productos: [
          { id: randomUUID(), proveedor_id: prov, nombre: 'Harina', unidad_base_id: kgA },
          { id: randomUUID(), proveedor_id: prov, nombre: 'HARINA', unidad_base_id: kgA },
        ],
      },
    })
    expect(error?.message).toMatch(/productos_nombre_unico/)
    const { data } = await c.adminA.from('proveedores').select('id').eq('nombre', nombre)
    expect(data).toEqual([])
  })

  it('recepción no puede importar', async () => {
    const { error } = await c.recepcionA.rpc('importar_catalogo', { datos: { proveedores: [] } })
    expect(error?.message).toMatch(/Solo administración o encargado/)
  })
})
