// Etapa 5 — Control: alerta de aumento en Inicio, precio y gráfico en Precios, y excepción de
// umbral en Ajustes que apaga la alerta. Arma su propio proveedor con historial y al final lo archiva.

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types'
import { ORGS, USUARIOS } from '../db/datos'

const clave = process.env.DEV_TEST_PASSWORD ?? ''
const capturas = process.env.CAPTURAS
const corrida = Date.now().toString(36)
const proveedor = randomUUID()
const producto = randomUUID()
const nombreProducto = `Muzzarella ${corrida}`
const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString()

const db = createClient<Database>(
  process.env.VITE_SUPABASE_URL ?? '',
  process.env.VITE_SUPABASE_ANON_KEY ?? '',
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
)

test.beforeAll(async () => {
  const admin = USUARIOS.find((u) => u.clave === 'adminA')!
  const { error: e1 } = await db.auth.signInWithPassword({ email: admin.email, password: clave })
  if (e1) throw e1
  const { data: unidades } = await db.from('unidades').select('id, nombre').eq('archivada', false)
  const kg = unidades!.find((u) => u.nombre === 'kg')!.id
  const { error } = await db.rpc('importar_catalogo', {
    datos: {
      proveedores: [
        {
          id: proveedor,
          nombre: `Lácteos ${corrida}`,
          whatsapp: `+549341${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
        },
      ],
      productos: [
        { id: producto, proveedor_id: proveedor, nombre: nombreProducto, unidad_base_id: kg },
      ],
    },
  })
  if (error) throw error
  // Historial: $8.000/kg hace 40 días, $10.000/kg hace 2 días (+25%).
  const { error: e2 } = await db.from('precios').insert([
    {
      org_id: ORGS.a.id,
      proveedor_id: proveedor,
      producto_id: producto,
      precio_base: 8000,
      fecha: hace(40),
      origen: 'manual',
    },
    {
      org_id: ORGS.a.id,
      proveedor_id: proveedor,
      producto_id: producto,
      precio_base: 10000,
      fecha: hace(2),
      origen: 'manual',
    },
  ])
  if (e2) throw e2
})

test.afterAll(async () => {
  await db.from('productos').update({ activo: false, umbral_alerta_pct: null }).eq('id', producto)
  await db.from('proveedores').update({ activo: false }).eq('id', proveedor)
  await db.auth.signOut({ scope: 'local' })
})

test('el aumento se ve en Inicio y en Precios, y una excepción de umbral lo apaga', async ({
  page,
}) => {
  const admin = USUARIOS.find((u) => u.clave === 'adminA')!
  await page.goto('/')
  await page.getByLabel('Mail').fill(admin.email)
  await page.getByLabel('Contraseña').fill(clave)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()

  // Inicio: la alerta de la semana
  const alerta = page.getByRole('region', { name: /insumos? esta semana/ })
  await expect(alerta.getByText(nombreProducto)).toBeVisible()
  await expect(alerta.getByText('+25%')).toBeVisible()
  if (capturas) await page.screenshot({ path: `${capturas}/c1-inicio.png`, fullPage: true })

  // Precios: el proveedor, el aumento del mes y el gráfico
  await alerta.getByRole('link', { name: 'Ver' }).click()
  await page.getByRole('tab', { name: `Lácteos ${corrida}` }).click()
  await expect(page.getByText(`Lácteos ${corrida} subió`)).toBeVisible()
  await expect(page.getByText('+25% en el mes')).toBeVisible()
  await expect(page.getByRole('img', { name: /Precio por kg: de 8\.000/ })).toBeVisible()
  if (capturas) await page.screenshot({ path: `${capturas}/c2-precios.png`, fullPage: true })

  // Ajustes: excepción para el producto, subida a 30% → ya no alerta
  await page.getByRole('link', { name: /abrir ajustes/ }).click()
  await page.getByRole('button', { name: 'Excepción por proveedor o producto' }).click()
  await page
    .getByLabel('¿Para quién?')
    .selectOption({ label: `${nombreProducto} (Lácteos ${corrida})` })
  const mas = page.getByRole('button', { name: `Más: Umbral de ${nombreProducto}` })
  await expect(mas).toBeVisible()
  const umbral = page.getByRole('group', { name: `Umbral de ${nombreProducto}` })
  for (let i = 0; i < 20; i++) {
    const texto = await umbral.locator('.paso__valor').textContent()
    if (texto === '30%') break
    await mas.click()
    await expect(mas).toBeEnabled()
  }
  await expect(umbral.getByText('30%')).toBeVisible()
  if (capturas) await page.screenshot({ path: `${capturas}/c3-ajustes.png`, fullPage: true })

  await page
    .getByRole('navigation', { name: 'Secciones' })
    .getByRole('link', { name: 'Inicio' })
    .click()
  await expect(page.getByRole('heading', { name: '¿Qué necesitás hoy?' })).toBeVisible()
  await expect(page.getByText(nombreProducto)).toHaveCount(0)
})
