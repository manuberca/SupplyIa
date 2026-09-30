// Criterio de "listo" de la etapa 2, en el navegador: se carga un proveedor con productos
// en caja y en kg, y no se puede duplicar. Usa nombres propios en cada corrida y al final
// archiva lo que creó (nada se borra).
// Con CAPTURAS=<carpeta> guarda una captura de cada pantalla para revisarlas.

import { expect, test, type Page } from '@playwright/test'
import { USUARIOS } from '../db/datos'

const clave = process.env.DEV_TEST_PASSWORD ?? ''
const capturas = process.env.CAPTURAS

async function captura(page: Page, nombre: string) {
  if (capturas) await page.screenshot({ path: `${capturas}/${nombre}.png`, fullPage: true })
}

async function entrar(page: Page, clave_: 'encargadoA' | 'adminA') {
  const u = USUARIOS.find((x) => x.clave === clave_)!
  await page.goto('/')
  await page.getByLabel('Mail').fill(u.email)
  await page.getByLabel('Contraseña').fill(clave)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('heading', { name: '¿Qué necesitás hoy?' })).toBeVisible()
}

test('se carga un proveedor con un producto en caja y otro en kg, sin duplicados', async ({
  page,
}) => {
  const corrida = Date.now().toString(36)
  const nombre = `Verdulería ${corrida}`
  const numero = `341 ${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`

  await entrar(page, 'encargadoA')
  await page
    .getByRole('navigation', { name: 'Secciones' })
    .getByRole('link', { name: 'Proveedores' })
    .click()
  await expect(page.getByRole('heading', { name: 'Proveedores' })).toBeVisible()
  await captura(page, '1-proveedores')

  // Alta del proveedor
  await page.getByRole('link', { name: 'Agregar' }).first().click()
  await expect(page.getByRole('heading', { name: 'Nuevo proveedor' })).toBeVisible()
  await page.getByLabel('Nombre', { exact: true }).fill(nombre)
  await page.getByLabel('WhatsApp para pedidos').fill('555')
  await page.getByLabel('WhatsApp para pedidos').blur()
  await expect(page.getByText('Falta el código de área')).toBeVisible()
  await page.getByLabel('WhatsApp para pedidos').fill(numero)
  await expect(page.getByText('Número válido')).toBeVisible()
  for (const dia of ['lunes', 'miércoles', 'viernes'])
    await page.getByRole('button', { name: dia }).click()
  await page.getByLabel('Pedir antes de').fill('18:00 del día anterior')
  await captura(page, '2-nuevo-proveedor')
  await page.getByRole('button', { name: 'Guardar proveedor' }).click()

  // Ficha
  await expect(page.getByRole('heading', { name: nombre })).toBeVisible()
  await expect(page.getByText('Lun, mié y vie · antes de 18:00 del día anterior')).toBeVisible()

  // Producto en kg que viene en caja
  await page.getByRole('link', { name: 'Agregar producto' }).click()
  await page.getByLabel('Nombre', { exact: true }).fill('Tomate perita')
  await page.getByRole('button', { name: 'kg', exact: true }).click()
  await page.getByLabel('Presentación 1: nombre').fill('Caja')
  await page.getByLabel('Presentación 1: cuánto trae').fill('18')
  await captura(page, '3-nuevo-producto')
  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page.getByText('kg · caja de 18 kg')).toBeVisible()

  // Producto por unidad que viene en jaula
  await page.getByRole('link', { name: 'Agregar producto' }).click()
  await page.getByLabel('Nombre', { exact: true }).fill('Lechuga')
  await page.getByRole('button', { name: 'unidad', exact: true }).click()
  await page.getByLabel('Presentación 1: nombre').fill('Jaula')
  await page.getByLabel('Presentación 1: cuánto trae').fill('12')
  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page.getByText('unidad · jaula de 12')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Productos (2)' })).toBeVisible()
  await captura(page, '4-ficha')

  // El mismo producto no se puede cargar dos veces
  await page.getByRole('link', { name: 'Agregar producto' }).click()
  await page.getByLabel('Nombre', { exact: true }).fill('tomate  PERITA')
  await expect(
    page.getByText(`${nombre} ya tiene un producto que se llama "Tomate perita"`),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Volver' }).click()

  // Ni otro proveedor con el mismo WhatsApp
  await page.goto('/proveedores/nuevo')
  await page.getByLabel('Nombre', { exact: true }).fill(`Otro ${corrida}`)
  await page.getByLabel('WhatsApp para pedidos').fill(`0${numero.replace(' ', ' 15 ')}`)
  await expect(page.getByText(`Ese número ya lo tiene ${nombre}`)).toBeVisible()
  await captura(page, '5-whatsapp-repetido')

  // Se archiva (nada se borra) y deja de estar en la lista
  await page.goto('/proveedores')
  await page.getByRole('link', { name: new RegExp(nombre) }).click()
  await page.getByRole('button', { name: 'Archivar proveedor' }).click()
  await page.getByRole('button', { name: 'Sí, archivar' }).click()
  await expect(page.getByText('Proveedor archivado.')).toBeVisible()
  await captura(page, '6-archivado')
})

test('administración crea y archiva unidades desde Ajustes', async ({ page }) => {
  const nombre = `pote${Date.now().toString(36)}`
  await entrar(page, 'adminA')
  await page.getByRole('link', { name: /abrir ajustes/ }).click()
  await expect(page.getByRole('heading', { name: 'Unidades' })).toBeVisible()

  // Una que ya existe, escrita en plural, no se duplica.
  await page.getByRole('button', { name: 'Nueva unidad' }).click()
  await page.getByLabel('Nueva unidad').fill('Cajas')
  await expect(page.getByText('Ya existe: caja')).toBeVisible()

  await page.getByLabel('Nueva unidad').fill(nombre)
  await page.getByRole('button', { name: 'Se cuenta (unidad, caja, atado)' }).click()
  await page.getByRole('button', { name: 'Crear unidad' }).click()
  await expect(page.getByRole('button', { name: `Archivar ${nombre}` })).toBeVisible()
  await captura(page, '10-ajustes-unidades')

  await page.getByRole('button', { name: `Archivar ${nombre}` }).click()
  await expect(page.getByRole('button', { name: `Archivar ${nombre}` })).toHaveCount(0)
})
