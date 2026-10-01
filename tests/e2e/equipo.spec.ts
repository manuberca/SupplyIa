// Etapa 7 — Ajustes: locales (agregar, renombrar, archivar) y equipo (sumar, cambiar el rol,
// dar de baja). Usa siempre el mismo mail de prueba: si quedó de otra corrida, arranca dado de baja.

import { devices, expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types'
import { USUARIOS } from '../db/datos'

const clave = process.env.DEV_TEST_PASSWORD ?? ''
const capturas = process.env.CAPTURAS
const corrida = Date.now().toString(36)
const admin = USUARIOS.find((u) => u.clave === 'adminA')!
const INVITADO = 'invitado-e2e@supplyia.test'

const db = createClient<Database>(
  process.env.VITE_SUPABASE_URL ?? '',
  process.env.VITE_SUPABASE_ANON_KEY ?? '',
  { auth: { autoRefreshToken: false, persistSession: false } },
)

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  const { error } = await db.auth.signInWithPassword({ email: admin.email, password: clave })
  if (error) throw error
  await db.from('miembros').update({ activo: false }).eq('email', INVITADO)
})

test.afterAll(async () => {
  await db.from('miembros').update({ activo: false }).eq('email', INVITADO)
  await db.from('locales').update({ activo: false }).like('nombre', `%${corrida}%`)
  // Solo esta sesión: un cierre global también cortaría la del navegador de la prueba.
  await db.auth.signOut({ scope: 'local' })
})

test('administración maneja sus locales y su equipo desde Ajustes', async ({ page, browser }) => {
  await page.goto('/')
  await page.getByLabel('Mail').fill(admin.email)
  await page.getByLabel('Contraseña').fill(clave)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.getByRole('link', { name: /abrir ajustes/ }).click()

  // ─── Locales ───
  const locales = page.getByRole('region', { name: 'Locales' })
  await expect(locales.getByText('Pichincha')).toBeVisible()
  await locales.getByRole('button', { name: 'Nuevo local' }).click()
  await locales.getByLabel('Nombre del local nuevo').fill(`Depósito ${corrida}`)
  await locales.getByRole('button', { name: 'Agregar local' }).click()
  await expect(locales.getByText(`Depósito ${corrida}`)).toBeVisible()
  // El local nuevo aparece también en el selector de arriba (la sesión se actualiza sola).
  await expect(
    page.getByLabel('Local en el que estás').getByRole('option', { name: `Depósito ${corrida}` }),
  ).toBeAttached()

  await locales.getByRole('button', { name: `Editar el local Depósito ${corrida}` }).click()
  await locales.getByLabel('Nombre del local', { exact: true }).fill(`Galpón ${corrida}`)
  await locales.getByRole('button', { name: 'Guardar' }).click()
  await expect(locales.getByText(`Galpón ${corrida}`)).toBeVisible()

  // ─── Equipo ───
  const equipo = page.getByRole('region', { name: 'Equipo' })
  await expect(equipo.getByText(admin.nombre)).toBeVisible()
  await equipo.getByRole('button', { name: 'Sumar a una persona' }).click()
  await equipo.getByRole('button', { name: 'Sumar al equipo' }).click()
  await expect(equipo.getByText('Revisá el mail: parece que está mal escrito.')).toBeVisible()

  await equipo.getByLabel('Mail de la persona').fill(INVITADO)
  await equipo.getByLabel('Nombre').fill(`Inés ${corrida}`)
  await equipo.getByLabel('Rol').selectOption('recepcion')
  await equipo
    .getByRole('group', { name: 'Locales' })
    .getByRole('button', { name: 'Pichincha' })
    .click()
  if (capturas) await page.screenshot({ path: `${capturas}/e1-sumar.png`, fullPage: true })
  await equipo.getByRole('button', { name: 'Sumar al equipo' }).click()
  await expect(equipo.getByText(`Inés ${corrida} ya está en el equipo.`)).toBeVisible()
  // La contraseña provisoria se muestra una sola vez, lista para mandarla.
  const provisoria = await equipo.locator('.clave-provisoria').innerText()
  expect(provisoria).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/)
  await expect(equipo.getByRole('link', { name: 'Mandársela por WhatsApp' })).toHaveAttribute(
    'href',
    new RegExp(`wa\\.me/\\?text=.*invitado-e2e.*${provisoria}`),
  )
  if (capturas) await page.screenshot({ path: `${capturas}/e2-clave.png`, fullPage: true })
  await equipo.getByRole('button', { name: 'Listo' }).click()
  await expect(equipo.locator('.clave-provisoria')).toHaveCount(0)
  const fila = equipo.locator('.lista__fila', { hasText: `Inés ${corrida}` })
  await expect(fila.getByText('Recepción · Pichincha')).toBeVisible()

  // ─── La persona entra en su celular con esa contraseña y la cambia ───
  const suCelular = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-AR' })
  const suya = await suCelular.newPage()
  await suya.goto('/')
  await suya.getByLabel('Mail').fill(INVITADO)
  await suya.getByLabel('Contraseña').fill(provisoria)
  await suya.getByRole('button', { name: 'Entrar', exact: true }).click()
  // Recepción en Pichincha: entra, y la app le recuerda cambiar la contraseña.
  await suya.getByRole('link', { name: /contraseña provisoria/ }).click()
  await expect(suya.getByRole('heading', { name: 'Tu cuenta' })).toBeVisible()
  await suya.getByRole('button', { name: 'Cambiar contraseña' }).click()
  await suya.getByLabel('Contraseña nueva').fill('corta')
  await suya.getByLabel('Repetila').fill('corta')
  await suya.getByRole('button', { name: 'Guardar contraseña' }).click()
  await expect(suya.getByText('al menos 8 caracteres.').last()).toBeVisible()
  const propia = `mia-${corrida}-${provisoria.slice(0, 4)}`
  await suya.getByLabel('Contraseña nueva').fill(propia)
  await suya.getByLabel('Repetila').fill(propia)
  await suya.getByRole('button', { name: 'Guardar contraseña' }).click()
  await expect(suya.getByText('Listo: ya tenés tu contraseña nueva.')).toBeVisible()
  // Ya no es provisoria: el recordatorio desaparece, y entra con la suya.
  await suya.getByRole('link', { name: 'Inicio', exact: true }).click()
  await expect(suya.getByRole('link', { name: /contraseña provisoria/ })).toHaveCount(0)
  await suya.getByRole('link', { name: /abrir ajustes/ }).click()
  await suya.getByRole('button', { name: 'Cerrar sesión' }).click()
  await suya.getByLabel('Mail').fill(INVITADO)
  await suya.getByLabel('Contraseña').fill(propia)
  await suya.getByRole('button', { name: 'Entrar', exact: true }).click()
  // Vuelve a la pantalla donde estaba (Ajustes), ya con su contraseña.
  await expect(suya.getByRole('heading', { name: 'Tu cuenta' })).toBeVisible()
  await expect(suya.getByText('contraseña provisoria')).toHaveCount(0)
  await suCelular.close()

  // Si la pierde, administración le genera otra.
  await equipo.getByRole('button', { name: `Editar a Inés ${corrida}` }).click()
  await equipo.getByRole('button', { name: 'Nueva contraseña' }).click()
  await expect(equipo.getByText(`Inés ${corrida} tiene una contraseña nueva.`)).toBeVisible()
  expect(await equipo.locator('.clave-provisoria').innerText()).not.toBe(provisoria)
  await equipo.getByRole('button', { name: 'Listo' }).click()

  // Cambiarle el rol: como encargada ve todos los locales.
  await equipo.getByRole('button', { name: `Editar a Inés ${corrida}` }).click()
  await equipo.getByLabel('Rol').selectOption('encargado')
  await equipo
    .getByRole('group', { name: 'Locales' })
    .getByRole('button', { name: 'Todos' })
    .click()
  await equipo.getByRole('button', { name: 'Guardar' }).click()
  await expect(fila.getByText('Encargado · Todos los locales')).toBeVisible()

  // Darla de baja: sale del equipo activo y queda en "dados de baja" (no se borra).
  await equipo.getByRole('button', { name: `Editar a Inés ${corrida}` }).click()
  await equipo.getByRole('button', { name: 'Dar de baja' }).click()
  await expect(equipo.getByRole('button', { name: `Editar a Inés ${corrida}` })).toHaveCount(0)
  await equipo.getByRole('button', { name: /Ver dados de baja/ }).click()
  await expect(equipo.getByRole('button', { name: `Reactivar a Inés ${corrida}` })).toBeVisible()

  const { data } = await db.from('miembros').select('rol, activo').eq('email', INVITADO).single()
  expect(data).toEqual({ rol: 'encargado', activo: false })

  // Archivar el local de la prueba.
  await locales.getByRole('button', { name: `Editar el local Galpón ${corrida}` }).click()
  await locales.getByRole('button', { name: 'Archivar' }).click()
  await expect(
    locales.getByRole('button', { name: `Editar el local Galpón ${corrida}` }),
  ).toHaveCount(0)
  await locales.getByRole('button', { name: /Ver archivados/ }).click()
  await expect(
    locales.getByRole('button', { name: `Reactivar el local Galpón ${corrida}` }),
  ).toBeVisible()
})

test('encargado y recepción no ven el equipo ni los locales en Ajustes', async ({ page }) => {
  const encargado = USUARIOS.find((u) => u.clave === 'encargadoA')!
  await page.goto('/')
  await page.getByLabel('Mail').fill(encargado.email)
  await page.getByLabel('Contraseña').fill(clave)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.getByRole('link', { name: /abrir ajustes/ }).click()
  await expect(page.getByRole('heading', { name: 'Tu cuenta' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Equipo' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Locales' })).toHaveCount(0)
})
