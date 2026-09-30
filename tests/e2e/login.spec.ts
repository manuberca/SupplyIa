// Flujo de login y lo que ve cada rol. Usa los usuarios de `npm run db:datos-prueba`.
// El login con código por mail no se prueba acá: necesita una casilla real.

import { expect, test, type Page } from '@playwright/test'
import { USUARIOS } from '../db/datos'

const clave = process.env.DEV_TEST_PASSWORD ?? ''

function usuario(c: (typeof USUARIOS)[number]['clave']) {
  const u = USUARIOS.find((x) => x.clave === c)
  if (!u) throw new Error(`No existe el usuario de prueba ${c}`)
  return u
}

async function entrar(page: Page, email: string, contrasena = clave) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Entrá a tu bar' })).toBeVisible()
  await page.getByLabel('Mail').fill(email)
  await page.getByLabel('Contraseña').fill(contrasena)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
}

const barra = (page: Page) => page.getByRole('navigation', { name: 'Secciones' })

test('administración entra con contraseña y ve todas las secciones', async ({ page }) => {
  await entrar(page, usuario('adminA').email)

  await expect(page.getByRole('heading', { name: '¿Qué necesitás hoy?' })).toBeVisible()
  for (const seccion of ['Inicio', 'Pedir', 'Recibir', 'Proveedores', 'Precios']) {
    await expect(barra(page).getByRole('link', { name: seccion })).toBeVisible()
  }

  await page.getByRole('link', { name: /abrir ajustes/ }).click()
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible()
  await expect(page.getByText('Bar Prueba A')).toBeVisible()
  await expect(page.getByText('Administración')).toBeVisible()
  // Bar Prueba A tiene dos locales: aparece el selector.
  await expect(page.getByLabel('Local en el que estás')).toBeVisible()
})

test('recepción solo ve Inicio y Recibir, y no puede entrar a Pedir', async ({ page }) => {
  await entrar(page, usuario('recepcionA').email)

  await expect(page.getByRole('heading', { name: '¿Qué necesitás hoy?' })).toBeVisible()
  await expect(barra(page).getByRole('link')).toHaveText(['Inicio', 'Recibir'])
  // Solo tiene acceso al local Pichincha.
  await expect(page.getByRole('link', { name: /Pichincha, abrir ajustes/ })).toBeVisible()

  // Aunque escriba la dirección a mano, vuelve al inicio.
  await page.goto('/pedir')
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: '¿Qué necesitás hoy?' })).toBeVisible()

  await page.goto('/ajustes')
  await expect(page.getByRole('heading', { name: 'Tu cuenta' })).toBeVisible()
})

test('cada organización ve solo lo suyo', async ({ page }) => {
  await entrar(page, usuario('adminB').email)

  await page.getByRole('link', { name: /abrir ajustes/ }).click()
  await expect(page.getByText('Bar Prueba B')).toBeVisible()
  await expect(page.getByText('Bar Prueba A')).toHaveCount(0)
  // Bar Prueba B tiene un solo local: no hay selector.
  await expect(page.getByLabel('Local en el que estás')).toHaveCount(0)
})

test('con la contraseña equivocada avisa qué hacer', async ({ page }) => {
  await entrar(page, usuario('adminA').email, 'no-es-la-clave')

  await expect(page.getByRole('alert')).toContainText('no coinciden')
  await expect(page.getByRole('heading', { name: 'Entrá a tu bar' })).toBeVisible()
})

test('con un mail mal escrito avisa antes de mandar nada', async ({ page }) => {
  await entrar(page, 'esto-no-es-un-mail')

  await expect(page.getByRole('alert')).toContainText('Revisá el mail')
})

test('cerrar sesión vuelve al login y no deja volver atrás', async ({ page }) => {
  await entrar(page, usuario('encargadoA').email)
  await expect(page.getByRole('heading', { name: '¿Qué necesitás hoy?' })).toBeVisible()

  await page.getByRole('link', { name: /abrir ajustes/ }).click()
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page.getByRole('heading', { name: 'Entrá a tu bar' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Entrá a tu bar' })).toBeVisible()
})
