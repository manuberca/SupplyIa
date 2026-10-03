// Modo computadora (pantalla ancha): menú a la izquierda y pantallas de dos columnas. El modo lo
// decide el ancho de la pantalla; el celular queda como siempre. También "Instalá la app" y
// "Primeros pasos". Arma su propio proveedor y al final lo archiva.

import { randomUUID } from 'node:crypto'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types'
import { ORGS, USUARIOS } from '../db/datos'

const clave = process.env.DEV_TEST_PASSWORD ?? ''
const capturas = process.env.CAPTURAS
const corrida = Date.now().toString(36)
const proveedor = randomUUID()
const producto = randomUUID()
const nombreProveedor = `Almacén ${corrida}`
const admin = USUARIOS.find((u) => u.clave === 'adminA')!
const COMPUTADORA = { width: 1440, height: 900 }
const CELULAR = { width: 390, height: 844 }

const db = createClient<Database>(
  process.env.VITE_SUPABASE_URL ?? '',
  process.env.VITE_SUPABASE_ANON_KEY ?? '',
  { auth: { autoRefreshToken: false, persistSession: false } },
)

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  const { error: e1 } = await db.auth.signInWithPassword({ email: admin.email, password: clave })
  if (e1) throw e1
  const { data: unidades } = await db.from('unidades').select('id, nombre').eq('archivada', false)
  const kg = unidades!.find((u) => u.nombre === 'kg')!.id
  const { error } = await db.rpc('importar_catalogo', {
    datos: {
      proveedores: [
        {
          id: proveedor,
          nombre: nombreProveedor,
          whatsapp: `+549341${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
        },
      ],
      productos: [
        { id: producto, proveedor_id: proveedor, nombre: 'Harina 000', unidad_base_id: kg },
      ],
    },
  })
  if (error) throw error
  const { error: e2 } = await db.from('precios').insert({
    org_id: ORGS.a.id,
    proveedor_id: proveedor,
    producto_id: producto,
    precio_base: 1200,
    fecha: new Date().toISOString(),
    origen: 'manual',
  })
  if (e2) throw e2
})

test.afterAll(async () => {
  await db.from('productos').update({ activo: false }).eq('id', producto)
  await db.from('proveedores').update({ activo: false }).eq('id', proveedor)
  await db.auth.signOut({ scope: 'local' })
})

async function entrar(page: Page, email = admin.email) {
  await page.goto('/')
  await page.getByLabel('Mail').fill(email)
  await page.getByLabel('Contraseña').fill(clave)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('heading', { name: '¿Qué necesitás hoy?' })).toBeVisible()
}

const caja = async (l: Locator) => (await l.boundingBox())!

test('en computadora: menú a la izquierda y el pedido siempre a la vista a la derecha', async ({
  page,
}) => {
  await page.setViewportSize(COMPUTADORA)
  await entrar(page)

  // El menú está a la izquierda, a todo lo alto, con lo que en el celular está en otro lado.
  const menu = page.getByRole('navigation', { name: 'Secciones' })
  const cajaMenu = await caja(menu)
  expect(cajaMenu.x).toBe(0)
  expect(cajaMenu.height).toBeGreaterThan(800)
  expect(cajaMenu.width).toBeLessThan(300)
  for (const nombre of ['Inicio', 'Pedir', 'Pedidos', 'Recibir', 'Proveedores', 'Precios'])
    await expect(menu.getByRole('link', { name: nombre, exact: true })).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Administración' })).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Ajustes' })).toBeVisible()
  await expect(menu.getByText('Bar Prueba A')).toBeVisible()
  if (capturas) await page.screenshot({ path: `${capturas}/d1-inicio.png` })

  // Nuevo pedido: productos a la izquierda, resumen a la derecha (no flotando abajo).
  await menu.getByRole('link', { name: 'Pedir', exact: true }).click()
  await page.getByRole('link', { name: new RegExp(nombreProveedor) }).click()
  await page.getByRole('button', { name: /^Más/ }).first().click()
  const productos = page.getByRole('region', { name: 'Productos' })
  const resumen = page.getByRole('region', { name: 'Resumen del pedido' })
  await expect(resumen.getByRole('list', { name: 'Lo que vas pidiendo' })).toContainText(
    'Harina 000',
  )
  await expect(resumen.getByText('$1.200')).toBeVisible()
  const [cp, cr] = [await caja(productos), await caja(resumen)]
  expect(cr.x).toBeGreaterThan(cp.x + cp.width)
  expect(cr.y).toBeLessThan(cp.y + 80)
  if (capturas) await page.screenshot({ path: `${capturas}/d2-pedido.png` })

  // Recepción a mano: los renglones a la izquierda; la boleta y confirmar a la derecha.
  await page.goto(`/recibir/proveedor/${proveedor}`)
  await page.getByRole('button', { name: 'Cargar a mano' }).click()
  const renglones = page.getByRole('region', { name: 'Renglones del remito' })
  const boleta = page.getByRole('region', { name: 'Boleta' })
  const [cl, cb] = [await caja(renglones), await caja(boleta)]
  expect(cb.x).toBeGreaterThan(cl.x + cl.width)

  // La misma pantalla, achicada a un celular: vuelve la barra de abajo y una sola columna.
  await page.setViewportSize(CELULAR)
  const cajaBarra = await caja(menu)
  expect(cajaBarra.y).toBeGreaterThan(700)
  await expect(menu.getByRole('link', { name: 'Pedidos', exact: true })).toBeHidden()
  await expect(menu.getByRole('link', { name: 'Administración' })).toBeHidden()
  const [cl2, cb2] = [await caja(renglones), await caja(boleta)]
  expect(cb2.y).toBeGreaterThan(cl2.y)
  expect(Math.abs(cb2.x - cl2.x)).toBeLessThan(5)
})

test('recepción no ve Administración en el menú de la computadora', async ({ page }) => {
  await page.setViewportSize(COMPUTADORA)
  await entrar(page, USUARIOS.find((u) => u.clave === 'recepcionA')!.email)
  const menu = page.getByRole('navigation', { name: 'Secciones' })
  await expect(menu.getByRole('link', { name: 'Recibir', exact: true })).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Tu cuenta' })).toBeVisible()
  for (const nombre of ['Pedir', 'Proveedores', 'Precios', 'Administración'])
    await expect(menu.getByRole('link', { name: nombre, exact: true })).toHaveCount(0)
})

test('primeros pasos en Inicio, y cómo instalar la app', async ({ page }) => {
  // Bar Prueba B tiene una sola persona: "Sumá a tu equipo" siempre está pendiente.
  await entrar(page, USUARIOS.find((u) => u.clave === 'adminB')!.email)
  const pasos = page.getByRole('region', { name: 'Primeros pasos' })
  await expect(pasos.getByRole('link', { name: 'Sumá a tu equipo' })).toBeVisible()
  if (capturas) await page.screenshot({ path: `${capturas}/d3-primeros-pasos.png`, fullPage: true })

  // Desde ahí, a instalar la app: muestra los pasos para este dispositivo (un Android).
  await pasos.getByRole('link', { name: /Instalá la app en tu celular/ }).click()
  await expect(page.getByRole('heading', { name: 'Instalá la app' })).toBeVisible()
  const este = page.getByRole('region', { name: 'En Android' })
  await expect(este.getByText('Este dispositivo')).toBeVisible()
  await expect(page.getByRole('region', { name: 'En iPhone o iPad' })).toContainText(
    'Agregar a inicio',
  )
  await expect(page.getByRole('region', { name: 'En la computadora' })).toBeVisible()

  // "No mostrar más" lo saca, y sigue sin aparecer al volver a entrar.
  await page.getByRole('link', { name: 'Inicio', exact: true }).click()
  await pasos.getByRole('button', { name: 'No mostrar más' }).click()
  await expect(pasos).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: '¿Qué necesitás hoy?' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pedidos en curso' })).toBeVisible()
  await expect(pasos).toHaveCount(0)
})
