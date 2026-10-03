// Comparar proveedores: el bar marca que dos productos de distintos proveedores son el mismo, y
// la app dice quién lo vende más barato, cuánto se hubiera ahorrado y lo recuerda al pedir.
// Arma dos proveedores de quesos con sus precios y al final los archiva.

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types'
import { LOCALES, ORGS, USUARIOS } from '../db/datos'

const clave = process.env.DEV_TEST_PASSWORD ?? ''
const capturas = process.env.CAPTURAS
const corrida = Date.now().toString(36)
const caro = { proveedor: randomUUID(), producto: randomUUID(), nombre: `Quesos Caro ${corrida}` }
const barato = {
  proveedor: randomUUID(),
  producto: randomUUID(),
  nombre: `Quesos Barato ${corrida}`,
}
const admin = USUARIOS.find((u) => u.clave === 'adminA')!
const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString()

const db = createClient<Database>(
  process.env.VITE_SUPABASE_URL ?? '',
  process.env.VITE_SUPABASE_ANON_KEY ?? '',
  { auth: { autoRefreshToken: false, persistSession: false } },
)

test.beforeAll(async () => {
  const { error: e1 } = await db.auth.signInWithPassword({ email: admin.email, password: clave })
  if (e1) throw e1
  const { data: unidades } = await db.from('unidades').select('id, nombre').eq('archivada', false)
  const kg = unidades!.find((u) => u.nombre === 'kg')!.id
  const whatsapp = () => `+549341${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
  const { error } = await db.rpc('importar_catalogo', {
    datos: {
      proveedores: [
        { id: caro.proveedor, nombre: caro.nombre, whatsapp: whatsapp() },
        { id: barato.proveedor, nombre: barato.nombre, whatsapp: whatsapp() },
      ],
      productos: [
        {
          id: caro.producto,
          proveedor_id: caro.proveedor,
          nombre: 'Queso Azul x Kg',
          unidad_base_id: kg,
        },
        {
          id: barato.producto,
          proveedor_id: barato.proveedor,
          nombre: 'Queso Azul La Quesera',
          unidad_base_id: kg,
        },
      ],
    },
  })
  if (error) throw error
  // Al barato se le compró hace 5 días a $14.107; al caro, 8 kg hace 3 días a $16.500.
  const { error: e2 } = await db.from('precios').insert({
    org_id: ORGS.a.id,
    proveedor_id: barato.proveedor,
    producto_id: barato.producto,
    precio_base: 14107,
    fecha: hace(5),
    origen: 'manual',
  })
  if (e2) throw e2
  const { error: e3 } = await db.rpc('confirmar_recepcion', {
    recepcion: {
      id: randomUUID(),
      local_id: LOCALES.aCentro.id,
      proveedor_id: caro.proveedor,
      pedido_id: null,
      origen: 'manual',
      recibido_at: hace(3),
      nro_remito: `0001-${corrida}`,
      total_remito: 132000,
      estado_pedido: null,
      items: [
        {
          id: randomUUID(),
          producto_id: caro.producto,
          texto_remito: '',
          cantidad_pedida_base: null,
          cantidad_base: 8,
          precio_unit_base: 16500,
          precio_anterior_base: null,
          subtotal: 132000,
          resultado: 'no_pedido',
        },
      ],
      diferencias: [],
      correcciones: [],
    },
  })
  if (e3) throw e3
})

test.afterAll(async () => {
  await db
    .from('productos')
    .update({ activo: false, comparable_id: null })
    .in('id', [caro.producto, barato.producto])
  await db
    .from('proveedores')
    .update({ activo: false })
    .in('id', [caro.proveedor, barato.proveedor])
  await db.auth.signOut({ scope: 'local' })
})

test('marcar el mismo producto en dos proveedores: quién es más barato, el ahorro y el aviso al pedir', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('Mail').fill(admin.email)
  await page.getByLabel('Contraseña').fill(clave)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Secciones' })
    .getByRole('link', { name: 'Precios' })
    .click()
  await page.getByRole('tab', { name: caro.nombre }).click()

  // Todavía no se compara con nada: se elige el mismo producto en el otro proveedor.
  await page.getByRole('button', { name: 'Comparar con otro proveedor' }).click()
  const elegir = page.getByRole('region', { name: 'Elegir con qué comparar' })
  await elegir.getByLabel('Buscar producto para comparar').fill(barato.nombre)
  await elegir.getByRole('button', { name: /Queso Azul La Quesera/ }).click()

  const comparacion = page.getByRole('region', { name: 'Comparación entre proveedores' })
  const filaBarato = comparacion.getByRole('listitem').filter({ hasText: barato.nombre })
  const filaCaro = comparacion.getByRole('listitem').filter({ hasText: caro.nombre })
  await expect(filaBarato).toContainText('$14.107/kg')
  await expect(filaBarato).toContainText('El más barato')
  await expect(filaCaro).toContainText('$16.500/kg')
  await expect(filaCaro).toContainText('+17%')
  // 8 kg en el mes: (16.500 − 14.107) × 8 = 19.144
  await expect(comparacion).toContainText(`En 30 días le compraste 8 kg a ${caro.nombre}`)
  await expect(comparacion).toContainText('$19.144 menos')
  if (capturas) await page.screenshot({ path: `${capturas}/c3-comparar.png`, fullPage: true })

  // Al armar un pedido al caro, la app lo recuerda. Al barato no le dice nada.
  await page.goto(`/pedir/${caro.proveedor}`)
  await expect(page.getByText(`Más barato en ${barato.nombre}: $14.107/kg (-14,5%)`)).toBeVisible()
  await page.goto(`/pedir/${barato.proveedor}`)
  await expect(page.getByRole('heading', { name: 'Nuevo pedido' })).toBeVisible()
  await expect(page.getByText(/Más barato en/)).toHaveCount(0)

  // Y se puede dejar de comparar.
  await page.goto('/precios')
  await page.getByRole('tab', { name: caro.nombre }).click()
  await comparacion.getByRole('button', { name: 'Dejar de comparar este producto' }).click()
  await expect(page.getByRole('button', { name: 'Comparar con otro proveedor' })).toBeVisible()
  const { data } = await db
    .from('productos')
    .select('comparable_id')
    .in('id', [caro.producto, barato.producto])
  expect(data).toEqual([{ comparable_id: null }, { comparable_id: null }])
})
