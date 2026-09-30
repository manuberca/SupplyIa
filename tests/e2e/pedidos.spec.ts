// Criterio de "listo" de la etapa 3: un pedido hecho en modo avión se sube solo al volver la señal.
// Arma su propio proveedor (por la base, con admin A) y al final lo archiva.

import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types'
import { USUARIOS } from '../db/datos'

const clave = process.env.DEV_TEST_PASSWORD ?? ''
const capturas = process.env.CAPTURAS
const corrida = Date.now().toString(36)
const nombre = `Verdulería pedidos ${corrida}`
const ids = {
  proveedor: randomUUID(),
  tomate: randomUUID(),
  lechuga: randomUUID(),
  caja: randomUUID(),
}

const db = createClient<Database>(
  process.env.VITE_SUPABASE_URL ?? '',
  process.env.VITE_SUPABASE_ANON_KEY ?? '',
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
)

async function captura(page: Page, archivo: string) {
  if (capturas) await page.screenshot({ path: `${capturas}/${archivo}.png`, fullPage: true })
}

async function entrar(page: Page, quien: 'encargadoA' | 'recepcionA') {
  const u = USUARIOS.find((x) => x.clave === quien)!
  await page.goto('/')
  await page.getByLabel('Mail').fill(u.email)
  await page.getByLabel('Contraseña').fill(clave)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('heading', { name: '¿Qué necesitás hoy?' })).toBeVisible()
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  const admin = USUARIOS.find((x) => x.clave === 'adminA')!
  const { error: e1 } = await db.auth.signInWithPassword({ email: admin.email, password: clave })
  if (e1) throw e1
  const { data: unidades } = await db.from('unidades').select('id, nombre').eq('archivada', false)
  const kg = unidades!.find((u) => u.nombre === 'kg')!.id
  const unidad = unidades!.find((u) => u.nombre === 'unidad')!.id
  const { error } = await db.rpc('importar_catalogo', {
    datos: {
      proveedores: [
        {
          id: ids.proveedor,
          nombre,
          whatsapp: `+549341${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
          dias_entrega: [1, 2, 3, 4, 5, 6, 7],
        },
      ],
      productos: [
        {
          id: ids.tomate,
          proveedor_id: ids.proveedor,
          nombre: 'Tomate perita',
          unidad_base_id: kg,
        },
        { id: ids.lechuga, proveedor_id: ids.proveedor, nombre: 'Lechuga', unidad_base_id: unidad },
      ],
      presentaciones: [
        { id: ids.caja, producto_id: ids.tomate, nombre: 'Caja', factor_a_base: 18 },
      ],
      precios: [
        {
          id: randomUUID(),
          proveedor_id: ids.proveedor,
          producto_id: ids.tomate,
          precio_base: 2900,
        },
      ],
    },
  })
  if (error) throw error
})

test.afterAll(async () => {
  await db.from('productos').update({ activo: false }).in('id', [ids.tomate, ids.lechuga])
  await db.from('proveedores').update({ activo: false }).eq('id', ids.proveedor)
  await db.auth.signOut()
})

test('un pedido hecho sin señal se sube solo al volver la señal', async ({ page, context }) => {
  await entrar(page, 'encargadoA')
  await page
    .getByRole('navigation', { name: 'Secciones' })
    .getByRole('link', { name: 'Pedir' })
    .click()
  await expect(page.getByRole('heading', { name: '¿A quién le pedís?' })).toBeVisible()
  await page.getByRole('link', { name: new RegExp(nombre) }).click()
  await expect(page.getByText('$2.900/kg · recién')).toBeVisible()

  // 2 cajas de tomate y 5 lechugas
  await page.getByRole('button', { name: /^Caja · 18 kg$/ }).click()
  await page.getByRole('button', { name: 'Más Tomate perita' }).click()
  await page.getByRole('button', { name: 'Más Tomate perita' }).click()
  await page.getByLabel('Cantidad de Lechuga en unidad').fill('5')
  await page.getByRole('button', { name: 'Agregar observaciones' }).click()
  await page.getByLabel('Observaciones para el proveedor').fill('Entregar antes de las 11')
  // 2 cajas × 18 kg × $2.900 = $104.400 (la lechuga no tiene precio anterior)
  await expect(page.getByText('$104.400')).toBeVisible()
  await expect(page.getByText('1 sin precio')).toBeVisible()
  await captura(page, 'p1-nuevo-pedido')

  // Modo avión
  await context.setOffline(true)
  await expect(page.getByText('Sin conexión.')).toBeVisible()

  const boton = page.getByRole('link', { name: 'Enviar por WhatsApp' })
  const enlace = new URL((await boton.getAttribute('href'))!)
  const whatsapp = page.waitForEvent('popup')
  await boton.click()
  await (await whatsapp).close()
  expect(enlace.hostname).toBe('wa.me')
  expect(enlace.searchParams.get('text')).toBe(
    'Hola! Te paso un pedido de Bar Prueba A (Centro):\n\n• Lechuga: 5 unidades\n• Tomate perita: 2 cajas\n\nEntregar antes de las 11\n\nGracias!',
  )

  // Queda guardado en el celular, sin número
  await expect(page.getByText('Pendiente de subir.')).toBeVisible()
  await expect(page.getByText('se sube solo cuando vuelva la señal')).toBeVisible()
  await expect(page.getByText('Sin número')).toBeVisible()
  await expect(page.getByText('1 pedido: queda guardado y se sube solo')).toBeVisible()
  await captura(page, 'p2-sin-senal')
  const pedidoId = page.url().match(/pedidos\/([0-9a-f-]+)/)![1]!
  expect((await db.from('pedidos').select('id').eq('id', pedidoId)).data).toEqual([])

  // Vuelve la señal: se sube solo
  await context.setOffline(false)
  await expect(page.getByText('Pendiente de subir.')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByText(/^#\d{4}$/)).toBeVisible()
  await expect(page.getByText('En camino')).toBeVisible()
  await captura(page, 'p3-subido')

  const { data } = await db
    .from('pedidos')
    .select('estado, observaciones, pedido_items ( cantidad, cantidad_base )')
    .eq('id', pedidoId)
    .single()
  expect(data?.estado).toBe('enviado')
  expect(data?.observaciones).toBe('Entregar antes de las 11')
  expect(data?.pedido_items.map((i) => [i.cantidad, i.cantidad_base]).sort()).toEqual([
    [2, 36],
    [5, 5],
  ])

  // Marcar que no llegó
  await page.getByRole('button', { name: 'No llegó' }).click()
  await page.getByRole('button', { name: 'Sí, no llegó' }).click()
  await expect(page.getByText('No llegó', { exact: true })).toBeVisible()
})

test('recepción ve los pedidos en curso de su local pero no puede pedir', async ({ page }) => {
  await entrar(page, 'recepcionA')
  await expect(page.getByRole('heading', { name: 'Pedidos en curso' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Nuevo pedido' })).toHaveCount(0)
  await page.goto('/pedir')
  await expect(page).toHaveURL('/')
  await page.goto('/pedidos')
  await expect(page.getByRole('heading', { name: 'Pedidos' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Nuevo' })).toHaveCount(0)
})
