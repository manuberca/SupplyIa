// Recepción en el navegador, con la lectura de la IA simulada (no gasta lecturas):
// foto → lectura → revisión → confirmar, la falla de la IA con carga a mano, y confirmar sin señal.
// Arma su propio proveedor y pedidos (por la base) y al final archiva lo que creó.

import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types'
import type { RespuestaLectura } from '../../src/recepcion/lectura'
import { LOCALES, USUARIOS } from '../db/datos'

const clave = process.env.DEV_TEST_PASSWORD ?? ''
const capturas = process.env.CAPTURAS
const corrida = Date.now().toString(36)
const nombre = `Frigorífico recepción ${corrida}`
const ids = {
  proveedor: randomUUID(),
  vacio: randomUUID(),
  matambre: randomUUID(),
  entrana: randomUUID(),
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

async function nuevoPedido(): Promise<string> {
  const id = randomUUID()
  const { error } = await db.rpc('guardar_pedido', {
    pedido: {
      id,
      local_id: LOCALES.aPichincha.id,
      proveedor_id: ids.proveedor,
      items: [
        { id: randomUUID(), producto_id: ids.vacio, cantidad: 12, precio_estimado_base: 14200 },
        { id: randomUUID(), producto_id: ids.matambre, cantidad: 6, precio_estimado_base: 11800 },
        { id: randomUUID(), producto_id: ids.entrana, cantidad: 4, precio_estimado_base: 18500 },
      ],
    },
  })
  if (error) throw error
  return id
}

async function entrarComoRecepcion(page: Page) {
  const u = USUARIOS.find((x) => x.clave === 'recepcionA')!
  await page.goto('/')
  await page.getByLabel('Mail').fill(u.email)
  await page.getByLabel('Contraseña').fill(clave)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('heading', { name: '¿Qué necesitás hoy?' })).toBeVisible()
}

/** Una imagen de verdad para la "foto" (la app la comprime antes de mandarla). */
async function foto(page: Page) {
  return { name: 'remito.png', mimeType: 'image/png', buffer: await page.screenshot() }
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  const encargado = USUARIOS.find((x) => x.clave === 'encargadoA')!
  const { error: e1 } = await db.auth.signInWithPassword({
    email: encargado.email,
    password: clave,
  })
  if (e1) throw e1
  const { data: unidades } = await db.from('unidades').select('id, nombre').eq('archivada', false)
  const kg = unidades!.find((u) => u.nombre === 'kg')!.id
  const { error } = await db.rpc('importar_catalogo', {
    datos: {
      proveedores: [
        {
          id: ids.proveedor,
          nombre,
          whatsapp: `+549341${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
        },
      ],
      productos: [
        { id: ids.vacio, proveedor_id: ids.proveedor, nombre: 'Vacío', unidad_base_id: kg },
        { id: ids.matambre, proveedor_id: ids.proveedor, nombre: 'Matambre', unidad_base_id: kg },
        { id: ids.entrana, proveedor_id: ids.proveedor, nombre: 'Entraña', unidad_base_id: kg },
      ],
      precios: [
        {
          id: randomUUID(),
          proveedor_id: ids.proveedor,
          producto_id: ids.vacio,
          precio_base: 14200,
        },
        {
          id: randomUUID(),
          proveedor_id: ids.proveedor,
          producto_id: ids.matambre,
          precio_base: 11800,
        },
        {
          id: randomUUID(),
          proveedor_id: ids.proveedor,
          producto_id: ids.entrana,
          precio_base: 18500,
        },
      ],
    },
  })
  if (error) throw error
  // Excepción para este proveedor: alerta desde el 5% (el general del bar es 10%).
  await db.from('proveedores').update({ umbral_alerta_pct: 5 }).eq('id', ids.proveedor)
})

test.afterAll(async () => {
  await db
    .from('productos')
    .update({ activo: false })
    .in('id', [ids.vacio, ids.matambre, ids.entrana])
  await db.from('proveedores').update({ activo: false }).eq('id', ids.proveedor)
  await db.auth.signOut()
})

test('con la IA: lee el remito, marca el aumento y el faltante, y el pedido queda para revisar', async ({
  page,
}) => {
  const pedidoId = await nuevoPedido()
  // Lo que devolvería la IA: el ejemplo de diseno/Recepcion.dc.html (Entraña no vino, Matambre subió).
  const lectura: RespuestaLectura = {
    ok: true,
    duplicado: null,
    uso: { usadas: 1, tope: 100 },
    lectura: {
      nroRemito: `0003-${corrida}`,
      fecha: '30/09/2026',
      proveedorDetectado: nombre,
      totales: {
        subtotalNeto: null,
        descuentoGlobal: null,
        iva: null,
        percepciones: null,
        total: 242120,
      },
      lineas: [
        {
          texto: 'VACIO X KG',
          productoId: ids.vacio,
          cantidad: 11.6,
          unidad: 'kg',
          precioUnit: 14200,
          descuentoLinea: null,
          subtotal: 164720,
          confianza: 'alta',
          observacion: '',
          esPromo: false,
        },
        {
          texto: 'MATAMBRE',
          productoId: ids.matambre,
          cantidad: 6,
          unidad: 'kg',
          precioUnit: 12900,
          descuentoLinea: null,
          subtotal: 77400,
          confianza: 'alta',
          observacion: '',
          esPromo: false,
        },
      ],
      validacion: { estado: 'OK', observaciones: [] },
      observaciones: '',
    },
  }
  let pedidoAlLector: { proveedorId?: string; tipo?: string } = {}
  await page.route('**/api/ocr', async (route) => {
    pedidoAlLector = JSON.parse(route.request().postData() ?? '{}')
    await route.fulfill({ json: lectura })
  })

  await entrarComoRecepcion(page)
  await page
    .getByRole('navigation', { name: 'Secciones' })
    .getByRole('link', { name: 'Recibir' })
    .click()
  await expect(page.getByRole('heading', { name: '¿Qué llegó?' })).toBeVisible()
  await page.getByRole('link', { name: new RegExp(nombre) }).click()
  await page.getByLabel('Foto del remito').setInputFiles(await foto(page))

  await expect(page.getByText('Leído con IA · cuentas verificadas')).toBeVisible()
  expect(pedidoAlLector).toMatchObject({ proveedorId: ids.proveedor, tipo: 'image/jpeg' })
  await expect(page.getByText('Correcto · dentro del 10% de tolerancia en peso')).toBeVisible()
  await expect(page.getByText('Subió 9,3% · antes $11.800/kg')).toBeVisible()
  await expect(page.getByText('No vino en el remito')).toBeVisible()
  await expect(page.getByText('1 con faltante')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Reclamar por WhatsApp' })).toBeVisible()
  await captura(page, 'r1-revision')

  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText('El pedido quedó para revisar.')).toBeVisible()
  await captura(page, 'r2-listo')

  // En la base: el pedido para revisar, las diferencias y lo que aprendió.
  await expect
    .poll(
      async () =>
        (await db.from('pedidos').select('estado').eq('id', pedidoId).single()).data?.estado,
      { timeout: 10_000 },
    )
    .toBe('revisar')
  const { data: rec } = await db
    .from('recepciones')
    .select('origen, nro_remito, diferencias ( tipo ), recepcion_items ( resultado )')
    .eq('pedido_id', pedidoId)
    .single()
  expect(rec?.origen).toBe('ia')
  expect(rec?.diferencias.map((d) => d.tipo).sort()).toEqual(['faltante', 'precio'])
  const precio = await db
    .from('ultimos_precios')
    .select('precio_base')
    .eq('producto_id', ids.matambre)
    .single()
  expect(precio.data?.precio_base).toBe(12900)
  const eq = await db.from('equivalencias').select('texto_remito').eq('producto_id', ids.vacio)
  expect(eq.data).toEqual([{ texto_remito: 'VACIO X KG' }])

  // El encargado ve la recepción en el pedido y resuelve la diferencia.
  await page.getByRole('link', { name: 'Ver el pedido' }).click()
  await expect(page.getByRole('heading', { name: 'Recepción' })).toBeVisible()
  await expect(page.getByText('No vino Entraña (4 kg)')).toBeVisible()
  await captura(page, 'r3-pedido')
})

test('si la IA falla, se carga a mano; y sin señal se confirma igual y se sube sola', async ({
  page,
  context,
}) => {
  const pedidoId = await nuevoPedido()
  await page.route('**/api/ocr', (route) =>
    route.fulfill({
      json: {
        ok: false,
        error: 'El lector está saturado en este momento. Esperá un minuto y sacá la foto de nuevo.',
      },
    }),
  )

  await entrarComoRecepcion(page)
  await page.goto(`/recibir/pedido/${pedidoId}`)
  await page.getByLabel('Foto del remito').setInputFiles(await foto(page))
  await expect(page.getByText('El lector está saturado')).toBeVisible()

  // Plan B: a mano, arranca con lo pedido.
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Cargar a mano' }).click()
  await expect(page.getByText('Cargado a mano')).toBeVisible()
  // Llegaron 3 kg de entraña en vez de 4: faltante.
  await page.getByRole('button', { name: /^Entraña/ }).click()
  await page.getByLabel('Llegó (kg)').fill('3')
  await page.getByRole('button', { name: 'Listo' }).click()
  await expect(page.getByText('Faltó: llegó 3 kg de 4 kg')).toBeVisible()
  await captura(page, 'r4-a-mano')
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText('Sin señal: se sube sola cuando vuelva.')).toBeVisible()
  expect((await db.from('recepciones').select('id').eq('pedido_id', pedidoId)).data).toEqual([])

  await context.setOffline(false)
  await expect
    .poll(
      async () =>
        (await db.from('pedidos').select('estado').eq('id', pedidoId).single()).data?.estado,
      { timeout: 30_000 },
    )
    .toBe('revisar')
  const { data } = await db.from('recepciones').select('origen').eq('pedido_id', pedidoId).single()
  expect(data?.origen).toBe('manual')
})
