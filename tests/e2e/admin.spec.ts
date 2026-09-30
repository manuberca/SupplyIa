// Etapa 6 — Panel de administración: el resumen del proveedor, el Excel con los mismos números,
// el seguimiento de una diferencia y los pagos. Arma su propio proveedor con dos pedidos que
// llegaron (uno bien, otro con faltante) y al final lo archiva.

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import readXlsxFile from 'read-excel-file/node'
import type { Database } from '../../src/lib/database.types'
import { LOCALES, USUARIOS } from '../db/datos'

const clave = process.env.DEV_TEST_PASSWORD ?? ''
const capturas = process.env.CAPTURAS
const corrida = Date.now().toString(36)
const proveedor = randomUUID()
const tomate = randomUUID()
const nombreProveedor = `Verdulería ${corrida}`
const pedidoBien = randomUUID()
const pedidoFaltante = randomUUID()
const diferencia = randomUUID()
const admin = USUARIOS.find((u) => u.clave === 'adminA')!
const numeros: Record<string, number> = {}

const db = createClient<Database>(
  process.env.VITE_SUPABASE_URL ?? '',
  process.env.VITE_SUPABASE_ANON_KEY ?? '',
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function ok<T extends { error: unknown }>(p: PromiseLike<T>): Promise<T> {
  const r = await p
  if (r.error) throw r.error
  return r
}

test.beforeAll(async () => {
  await ok(db.auth.signInWithPassword({ email: admin.email, password: clave }))
  const { data: unidades } = await db.from('unidades').select('id, nombre').eq('archivada', false)
  const kg = unidades!.find((u) => u.nombre === 'kg')!.id
  await ok(
    db.rpc('importar_catalogo', {
      datos: {
        proveedores: [
          {
            id: proveedor,
            nombre: nombreProveedor,
            whatsapp: `+549341${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
          },
        ],
        productos: [
          { id: tomate, proveedor_id: proveedor, nombre: 'Tomate perita', unidad_base_id: kg },
        ],
      },
    }),
  )

  // Dos pedidos de 10 kg de tomate a $2.900 (estimado $29.000 cada uno).
  for (const id of [pedidoBien, pedidoFaltante]) {
    await ok(
      db.rpc('guardar_pedido', {
        pedido: {
          id,
          local_id: LOCALES.aCentro.id,
          proveedor_id: proveedor,
          items: [
            { id: randomUUID(), producto_id: tomate, cantidad: 10, precio_estimado_base: 2900 },
          ],
        },
      }),
    )
  }
  const { data: pedidos } = await ok(
    db.from('pedidos').select('id, numero').in('id', [pedidoBien, pedidoFaltante]),
  )
  for (const p of pedidos!) numeros[p.id] = p.numero

  const recepcion = (pedido: string, extra: Record<string, unknown>) => ({
    id: randomUUID(),
    local_id: LOCALES.aCentro.id,
    proveedor_id: proveedor,
    pedido_id: pedido,
    origen: 'manual',
    diferencias: [],
    correcciones: [],
    ...extra,
  })
  // Llegó todo: $30.000, queda a pagar.
  await ok(
    db.rpc('confirmar_recepcion', {
      recepcion: recepcion(pedidoBien, {
        nro_remito: `0001-${corrida}`,
        total_remito: 30000,
        estado_pedido: 'a_pagar',
        items: [
          {
            id: randomUUID(),
            producto_id: tomate,
            cantidad_pedida_base: 10,
            cantidad_base: 10,
            precio_unit_base: 3000,
            subtotal: 30000,
            resultado: 'ok',
          },
        ],
      }),
    }),
  )
  // Llegaron 4 de 10 kg: $11.600, faltan $17.400, queda para revisar.
  await ok(
    db.rpc('confirmar_recepcion', {
      recepcion: recepcion(pedidoFaltante, {
        nro_remito: `0002-${corrida}`,
        total_remito: 11600,
        estado_pedido: 'revisar',
        items: [
          {
            id: randomUUID(),
            producto_id: tomate,
            cantidad_pedida_base: 10,
            cantidad_base: 4,
            precio_unit_base: 2900,
            subtotal: 11600,
            resultado: 'faltante',
          },
        ],
        diferencias: [
          {
            id: diferencia,
            producto_id: tomate,
            tipo: 'faltante',
            monto: -17400,
            detalle: 'Faltaron 6 kg de tomate',
          },
        ],
      }),
    }),
  )
})

test.afterAll(async () => {
  await db.from('productos').update({ activo: false }).eq('id', tomate)
  await db.from('proveedores').update({ activo: false }).eq('id', proveedor)
  await db.auth.signOut()
})

test('resumen, Excel con los mismos números, diferencia reclamada y pagos', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.getByLabel('Mail').fill(admin.email)
  await page.getByLabel('Contraseña').fill(clave)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()

  // Desde Ajustes al panel, y filtrado por el proveedor de la prueba
  await page.getByRole('link', { name: /abrir ajustes/ }).click()
  await page.getByRole('link', { name: 'Panel de administración' }).click()
  await expect(page.getByRole('heading', { name: 'Resumen de compras' })).toBeVisible()
  await page.getByLabel('Proveedor').selectOption({ label: nombreProveedor })

  const kpi = (titulo: string) => page.locator('.kpi', { hasText: titulo }).locator('.kpi__valor')
  await expect(kpi('Compras del período')).toHaveText('$41.600')
  await expect(kpi('Pedidos')).toHaveText('2')
  await expect(kpi('Cumplimiento promedio')).toHaveText('50%')
  await expect(kpi('Diferencias detectadas')).toHaveText('$17.400')
  if (capturas) await page.screenshot({ path: `${capturas}/a1-resumen.png`, fullPage: true })

  // Excel: las mismas cuentas que la pantalla
  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar a Excel' }).click(),
  ])
  expect(descarga.suggestedFilename()).toBe(
    `SupplyIA - Bar Prueba A - ${nombreDelMes()} - ${nombreProveedor}.xlsx`,
  )
  const hojas = await readXlsxFile(await descarga.path())
  const hoja = (nombre: string) => hojas.find((h) => h.sheet === nombre)!.data
  expect(hoja('Resumen').slice(2)).toEqual([
    ['Compras del período', 41600],
    ['Proveedores con compras', 1],
    ['Pedidos hechos', 2],
    ['Pedidos en camino', 0],
    ['Cumplimiento promedio (%)', 50],
    ['Diferencias detectadas', 17400],
    ['Recepciones con diferencias', 1],
  ])
  expect(hoja('Compras por proveedor')[1]).toEqual([nombreProveedor, 41600, 2])
  expect(hoja('Diferencias')[1]!.slice(1)).toEqual([
    nombreProveedor,
    numeros[pedidoFaltante],
    'Faltaron 6 kg de tomate',
    17400,
    'Pendiente',
  ])

  // La diferencia se reclamó al proveedor
  await page.getByLabel('Estado de: Faltaron 6 kg de tomate').selectOption('reclamado')
  await expect(page.getByLabel('Estado de: Faltaron 6 kg de tomate')).toHaveValue('reclamado')
  const { data: dif } = await db.from('diferencias').select('estado').eq('id', diferencia).single()
  expect(dif?.estado).toBe('reclamado')

  // Pagos: el que llegó bien se paga; el del faltante primero se revisa
  await page.getByRole('link', { name: 'Pagos' }).click()
  const numero = (id: string) => `#${String(numeros[id]).padStart(4, '0')}`
  const aPagar = page.locator('.bloque', { has: page.getByRole('heading', { name: 'A pagar' }) })
  const revisar = page.locator('.bloque', {
    has: page.getByRole('heading', { name: 'Para revisar antes de pagar' }),
  })
  await expect(aPagar.getByRole('cell', { name: '$30.000' })).toBeVisible()
  await revisar
    .getByRole('row', { name: numero(pedidoFaltante) })
    .getByRole('button', { name: 'Ya está, pasar a pagar' })
    .click()
  await expect(aPagar.getByRole('row', { name: numero(pedidoFaltante) })).toBeVisible()
  await aPagar
    .getByRole('row', { name: numero(pedidoBien) })
    .getByRole('button', { name: 'Marcar pagado' })
    .click()
  const pagados = page.locator('.bloque', { has: page.getByRole('heading', { name: 'Pagados' }) })
  await expect(pagados.getByRole('row', { name: numero(pedidoBien) })).toBeVisible()
  await expect(aPagar.getByRole('row', { name: numero(pedidoBien) })).toHaveCount(0)
  if (capturas) await page.screenshot({ path: `${capturas}/a2-pagos.png`, fullPage: true })

  const { data: pagado } = await db
    .from('pedidos')
    .select('estado, pagado_at')
    .eq('id', pedidoBien)
    .single()
  expect(pagado?.estado).toBe('pagado')
  expect(pagado?.pagado_at).not.toBeNull()
})

function nombreDelMes() {
  const meses = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ]
  const hoy = new Date()
  return `${meses[hoy.getMonth()]} ${hoy.getFullYear()}`
}
