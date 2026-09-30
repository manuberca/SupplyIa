// Importación del catálogo por Excel (SPEC §9): vista previa con errores por fila,
// y recién al confirmar se importa todo junto. Arma las planillas en el momento.

import { expect, test, type Page } from '@playwright/test'
import writeXlsxFile from 'write-excel-file/node'
import readXlsxFile from 'read-excel-file/node'
import { COLUMNAS_PRODUCTOS, COLUMNAS_PROVEEDORES } from '../../src/catalogo/importacion'
import { USUARIOS } from '../db/datos'

const clave = process.env.DEV_TEST_PASSWORD ?? ''
const capturas = process.env.CAPTURAS

type Fila = (string | number)[]

async function planilla(proveedores: Fila[], productos: Fila[]) {
  const buffer = await writeXlsxFile([
    { sheet: 'Proveedores', data: [[...COLUMNAS_PROVEEDORES], ...proveedores] },
    { sheet: 'Productos', data: [[...COLUMNAS_PRODUCTOS], ...productos] },
  ]).toBuffer()
  return {
    name: 'catalogo.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  }
}

async function irAImportar(page: Page) {
  const u = USUARIOS.find((x) => x.clave === 'adminA')!
  await page.goto('/')
  await page.getByLabel('Mail').fill(u.email)
  await page.getByLabel('Contraseña').fill(clave)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('heading', { name: '¿Qué necesitás hoy?' })).toBeVisible()
  await page.goto('/proveedores/importar')
  await expect(page.getByRole('heading', { name: 'Importar desde Excel' })).toBeVisible()
}

const numero = () => `341 ${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`

test('la plantilla se baja con las hojas y columnas que espera la importación', async ({
  page,
}) => {
  await irAImportar(page)
  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Bajar plantilla' }).click(),
  ])
  expect(descarga.suggestedFilename()).toMatch(/plantilla.*\.xlsx$/)
  const hojas = await readXlsxFile(await descarga.path())
  expect(hojas.map((h) => h.sheet)).toEqual(['Proveedores', 'Productos', 'Instrucciones'])
  expect(hojas[0]!.data[0]).toEqual([...COLUMNAS_PROVEEDORES])
  expect(hojas[1]!.data[0]).toEqual([...COLUMNAS_PRODUCTOS])
})

test('con errores muestra cada fila y no importa nada', async ({ page }) => {
  const corrida = Date.now().toString(36)
  await irAImportar(page)
  await page.getByLabel('Elegir planilla').setInputFiles(
    await planilla(
      [
        [`Mal número ${corrida}`, '555-1234', 'lun a vie', ''],
        [`Bien ${corrida}`, numero(), '', ''],
      ],
      [
        [`Fantasma ${corrida}`, 'Arroz', 'kg', '', '', '', ''],
        [`Bien ${corrida}`, 'Harina', 'bolsón', '', '', '', ''],
        [`Mal número ${corrida}`, 'Fideos', 'kg', '', '', '', ''],
      ],
    ),
  )
  await expect(page.getByText('Hay 4 filas con error')).toBeVisible()
  await expect(page.getByText('Falta el código de área')).toBeVisible()
  await expect(page.getByText(`tiene un error en la hoja Proveedores`)).toBeVisible()
  await expect(page.getByText(`El proveedor "Fantasma ${corrida}" no está`)).toBeVisible()
  await expect(page.getByText('la unidad "bolsón" no existe')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Importar todo' })).toHaveCount(0)
  if (capturas)
    await page.screenshot({ path: `${capturas}/7-importar-errores.png`, fullPage: true })
})

test('una planilla correcta se revisa y se importa entera', async ({ page }) => {
  const corrida = Date.now().toString(36)
  const nombre = `Frigorífico ${corrida}`
  await irAImportar(page)
  await page.getByLabel('Elegir planilla').setInputFiles(
    await planilla(
      [[nombre, numero(), 'lun a sáb', '18:00 del día anterior']],
      [
        [nombre, 'Vacío', 'kg', 'Pieza', '≈ 4,5', 'VACIO X KG', 12500],
        [nombre, 'Vacío', 'kg', 'Caja', 20, '', ''],
        [nombre, 'Chorizo', 'Kilos', '', '', '', '8.900'],
      ],
    ),
  )
  await expect(
    page.getByText('Se van a importar 1 proveedor, 2 productos, 2 presentaciones y 2 precios'),
  ).toBeVisible()
  if (capturas)
    await page.screenshot({ path: `${capturas}/8-importar-revision.png`, fullPage: true })
  await page.getByRole('button', { name: 'Importar todo' }).click()
  await expect(page.getByText('Listo.')).toBeVisible()

  await page.getByRole('link', { name: 'Ver proveedores' }).click()
  await page.getByRole('link', { name: new RegExp(nombre) }).click()
  await expect(page.getByText('kg · pieza de ≈4,5 kg · caja de 20 kg')).toBeVisible()
  await expect(page.getByText('$12.500/kg')).toBeVisible()
  await expect(page.getByText('$8.900/kg')).toBeVisible()
  if (capturas) await page.screenshot({ path: `${capturas}/9-importado.png`, fullPage: true })

  // Subir la misma planilla otra vez no duplica: avisa que ya estaba.
  await page.goto('/proveedores/importar')
  await page
    .getByLabel('Elegir planilla')
    .setInputFiles(
      await planilla([[nombre, numero(), '', '']], [[nombre, 'Vacío', 'kg', '', '', '', '']]),
    )
  await expect(page.getByText('No hay nada nuevo para importar')).toBeVisible()
  await expect(page.getByText(`"${nombre}" ya estaba cargado`)).toBeVisible()

  // Se archiva lo creado (nada se borra).
  await page.goto('/proveedores')
  await page.getByRole('link', { name: new RegExp(nombre) }).click()
  await page.getByRole('button', { name: 'Archivar proveedor' }).click()
  await page.getByRole('button', { name: 'Sí, archivar' }).click()
  await expect(page.getByText('Proveedor archivado.')).toBeVisible()
})
