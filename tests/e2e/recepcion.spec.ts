// Recepción en el navegador, con la lectura de la IA simulada (no gasta lecturas):
// foto → lectura → revisión → confirmar, la falla de la IA con carga a mano, y confirmar sin señal.
// Arma su propio proveedor y pedidos (por la base) y al final archiva lo que creó.

import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types'
import { leerNumero, numero } from '../../src/lib/formato'
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
  await db.auth.signOut({ scope: 'local' })
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
    continuar: null,
    lectura: {
      giro: 0,
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
      incompleta: false,
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
  // El total que leyó la IA queda en la boleta (se puede corregir a mano).
  await expect(page.getByLabel('Total de la boleta')).toHaveValue('242.120')
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

test('a mano: el total de la boleta se carga aparte del precio unitario, y con IVA cierra', async ({
  page,
}) => {
  const pedidoId = await nuevoPedido()
  await entrarComoRecepcion(page)
  await page.goto(`/recibir/pedido/${pedidoId}`)
  await page.getByRole('button', { name: 'Cargar a mano' }).click()

  // Sin total, avisa (como en La Bodeguita) y el pedido quedaría para revisar.
  await expect(page.getByText('Falta cargar el total de la boleta.')).toBeVisible()

  // El total de la boleta trae IVA: es distinto de la suma de precios unitarios, y cierra.
  const suma = leerNumero(await page.locator('.totales-recepcion__total').innerText())!
  const totalConIva = Math.round(suma * 1.21 * 100) / 100
  await page.getByLabel('Número de boleta o remito').fill(`0001-${Date.now() % 1e8}`)
  await page.getByLabel('Total de la boleta').fill(numero(totalConIva, 2))
  await expect(page.getByText('la diferencia es el IVA, las cuentas cierran')).toBeVisible()
  await expect(page.getByText('Falta cargar el total de la boleta.')).toHaveCount(0)
  await captura(page, 'r5-total-boleta')
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText('El pedido quedó a pagar.')).toBeVisible()

  await expect
    .poll(
      async () =>
        (await db.from('pedidos').select('estado').eq('id', pedidoId).single()).data?.estado,
      { timeout: 30_000 },
    )
    .toBe('a_pagar')
  const { data } = await db
    .from('recepciones')
    .select('total_remito, recepcion_items ( precio_unit_base )')
    .eq('pedido_id', pedidoId)
    .single()
  expect(Number(data?.total_remito)).toBe(totalConIva)
  // Los precios unitarios quedan como se cargaron (sin IVA), aparte del total.
  expect(data?.recepcion_items.every((i) => Number(i.precio_unit_base) < totalConIva)).toBe(true)
})

test('una foto de costado con lectura dudosa se endereza sola y se lee de nuevo', async ({
  page,
}) => {
  const linea = (confianza: 'alta' | 'baja', subtotal: number) => ({
    texto: 'VACIO X KG',
    productoId: ids.vacio,
    cantidad: 2,
    unidad: 'kg',
    precioUnit: subtotal / 2,
    descuentoLinea: null,
    subtotal,
    confianza,
    observacion: '',
    esPromo: false,
  })
  const respuesta = (
    giro: 0 | 90 | 270,
    nro: string,
    confianza: 'alta' | 'baja',
  ): RespuestaLectura => ({
    ok: true,
    duplicado: null,
    uso: { usadas: 1, tope: 100 },
    continuar: null,
    lectura: {
      giro,
      nroRemito: nro,
      fecha: null,
      proveedorDetectado: null,
      totales: {
        subtotalNeto: null,
        descuentoGlobal: null,
        iva: null,
        percepciones: null,
        total: 60000,
      },
      lineas: [linea(confianza, 28400), linea(confianza, 31600)],
      validacion: { estado: 'OK', observaciones: [] },
      observaciones: '',
      incompleta: false,
    },
  })
  const pedidos: { imagen: string; alternativa?: string }[] = []
  await page.route('**/api/ocr', async (route) => {
    pedidos.push(JSON.parse(route.request().postData() ?? '{}'))
    // Primera lectura: de costado y dudosa. Segunda: usó la girada 270° y salió bien.
    await route.fulfill({
      json:
        pedidos.length === 1
          ? respuesta(90, 'DUDOSO', 'baja')
          : respuesta(270, `0009-${corrida}`, 'alta'),
    })
  })

  await entrarComoRecepcion(page)
  await page.goto(`/recibir/proveedor/${ids.proveedor}`)
  // Con la pantalla ya dibujada, para que la "foto" tenga contenido (en blanco, girada es igual).
  await expect(page.getByRole('button', { name: 'Sacá la foto del remito' })).toBeVisible()
  await page.getByLabel('Foto del remito').setInputFiles(await foto(page))

  await expect(page.getByText(`Remito 0009-${corrida}`)).toBeVisible()
  expect(pedidos).toHaveLength(2)
  // La primera vez va la foto como se sacó; la segunda, girada para los dos lados.
  expect(pedidos[0]!.alternativa).toBeUndefined()
  expect(pedidos[1]!.alternativa).toBeTruthy()
  expect(pedidos[1]!.imagen).not.toBe(pedidos[0]!.imagen)
  expect(pedidos[1]!.alternativa).not.toBe(pedidos[1]!.imagen)
  await expect(page.getByLabel('Total de la boleta')).toHaveValue('60.000')
})

test('una boleta larga se lee en partes sin que la persona haga nada; si el resto falla, avisa', async ({
  page,
}) => {
  const linea = (texto: string, productoId: string, subtotal: number) => ({
    texto,
    productoId,
    cantidad: 2,
    unidad: 'kg',
    precioUnit: subtotal / 2,
    descuentoLinea: null,
    subtotal,
    confianza: 'alta' as const,
    observacion: '',
    esPromo: false,
  })
  const parte = (
    lineas: ReturnType<typeof linea>[],
    continuar: { leidos: number; pase: string } | null,
  ): RespuestaLectura => ({
    ok: true,
    duplicado: null,
    uso: { usadas: 1, tope: 100 },
    continuar,
    lectura: {
      giro: 0,
      nroRemito: `0010-${corrida}`,
      fecha: null,
      proveedorDetectado: null,
      totales: {
        subtotalNeto: null,
        descuentoGlobal: null,
        iva: null,
        percepciones: null,
        total: 90000,
      },
      lineas,
      validacion: { estado: 'OK', observaciones: [] },
      observaciones: '',
      incompleta: false,
    },
  })
  const primera = parte(
    [linea('VACIO X KG', ids.vacio, 28400), linea('MATAMBRE X KG', ids.matambre, 31600)],
    { leidos: 2, pase: 'pase-de-prueba' },
  )
  let fallaElResto = false
  const pedidos: { continuar?: string }[] = []
  await page.route('**/api/ocr', async (route) => {
    const pedido = JSON.parse(route.request().postData() ?? '{}') as { continuar?: string }
    pedidos.push(pedido)
    if (!pedido.continuar) return route.fulfill({ json: primera })
    if (fallaElResto) {
      return route.fulfill({ json: { ok: false, error: 'El lector está sobrecargado.' } })
    }
    // La continuación repite el renglón de la costura: no tiene que quedar duplicado.
    await route.fulfill({
      json: parte(
        [linea('MATAMBRE X KG', ids.matambre, 31600), linea('ENTRAÑA X KG', ids.entrana, 30000)],
        null,
      ),
    })
  })

  await entrarComoRecepcion(page)
  await page.goto(`/recibir/proveedor/${ids.proveedor}`)
  await expect(page.getByRole('button', { name: 'Sacá la foto del remito' })).toBeVisible()
  await page.getByLabel('Foto del remito').setInputFiles(await foto(page))

  // Las dos partes juntas dan el total de la boleta: 28.400 + 31.600 + 30.000.
  await expect(page.getByText(`Remito 0010-${corrida}`)).toBeVisible()
  await expect(page.getByText('Leído con IA · cuentas verificadas')).toBeVisible()
  await expect(page.getByText(/no se llegó a leer entera/)).toHaveCount(0)
  expect(pedidos.map((p) => p.continuar)).toEqual([undefined, 'pase-de-prueba'])

  // Otra vez, pero el resto no se puede leer: queda lo leído y avisa que faltan renglones.
  fallaElResto = true
  await page.goto(`/recibir/proveedor/${ids.proveedor}`)
  await expect(page.getByRole('button', { name: 'Sacá la foto del remito' })).toBeVisible()
  await page.getByLabel('Foto del remito').setInputFiles(await foto(page))
  await expect(
    page.getByText('no se llegó a leer entera: se leyeron los primeros 2 renglones'),
  ).toBeVisible()
  await expect(page.getByText('Leído con IA · cuentas verificadas')).toHaveCount(0)
})

test('una recepción ya confirmada se corrige desde el pedido, y el pedido se puede repetir', async ({
  page,
}) => {
  // Un pedido que llegó completo pero se cargó con el total y un precio equivocados.
  const pedidoId = await nuevoPedido()
  const recepcionId = randomUUID()
  const renglon = (producto_id: string, cantidad: number, precio: number) => ({
    id: randomUUID(),
    producto_id,
    texto_remito: '',
    cantidad_pedida_base: cantidad,
    cantidad_base: cantidad,
    precio_unit_base: precio,
    precio_anterior_base: precio,
    subtotal: cantidad * precio,
    resultado: 'ok',
  })
  const { error } = await db.rpc('confirmar_recepcion', {
    recepcion: {
      id: recepcionId,
      local_id: LOCALES.aPichincha.id,
      proveedor_id: ids.proveedor,
      pedido_id: pedidoId,
      origen: 'manual',
      nro_remito: `0007-${corrida}`,
      total_remito: 100000,
      estado_pedido: 'a_pagar',
      items: [
        renglon(ids.vacio, 12, 14200),
        renglon(ids.matambre, 6, 11800),
        renglon(ids.entrana, 4, 18500),
      ],
      diferencias: [],
      correcciones: [],
    },
  })
  if (error) throw error

  // Recepción (el rol) no corrige; el encargado sí.
  await entrarComoRecepcion(page)
  await page.goto(`/pedidos/${pedidoId}`)
  await expect(page.getByText('Llegó todo bien.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Corregir la recepción' })).toHaveCount(0)
  await page.getByRole('link', { name: /abrir ajustes/ }).click()
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()

  const encargado = USUARIOS.find((x) => x.clave === 'encargadoA')!
  await page.getByLabel('Mail').fill(encargado.email)
  await page.getByLabel('Contraseña').fill(clave)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  // El pedido es de Pichincha: el encargado, que ve todos los locales, se para en ese.
  await page.getByLabel('Local en el que estás').selectOption({ label: 'Pichincha' })
  await page.goto(`/pedidos/${pedidoId}`)
  await page.getByRole('link', { name: 'Corregir la recepción' }).click()

  // La misma pantalla de revisión, con lo que estaba guardado.
  await expect(page.getByRole('heading', { name: 'Corregir recepción' })).toBeVisible()
  await expect(page.getByLabel('Número de boleta o remito')).toHaveValue(`0007-${corrida}`)
  await expect(page.getByLabel('Total de la boleta')).toHaveValue('100.000')
  // Con el total mal cargado, la app ya avisaba que los renglones no daban.
  await expect(
    page.getByText(/Los renglones suman \$315\.200 pero el total dice \$100\.000/),
  ).toBeVisible()

  // El matambre en realidad vino a 12.900 (subió 9,3%), y el total era otro.
  await page.getByRole('button', { name: /^Matambre/ }).click()
  await page.getByLabel(/^Precio/).fill('12900')
  await page.getByRole('button', { name: 'Listo' }).click()
  await expect(page.getByText(/Subió 9,3%/)).toBeVisible()
  await page.getByLabel('Total de la boleta').fill('321.800')
  await expect(page.getByText(/Los renglones suman/)).toHaveCount(0)
  await captura(page, 'r6-corregir')
  await page.getByRole('button', { name: 'Guardar la corrección' }).click()
  await expect(page.getByRole('heading', { name: 'Recepción corregida' })).toBeVisible()

  await expect
    .poll(
      async () =>
        (await db.from('recepciones').select('total_remito').eq('id', recepcionId).single()).data
          ?.total_remito,
      { timeout: 30_000 },
    )
    .toBe(321800)
  const { data } = await db
    .from('recepciones')
    .select(
      'corregida_at, recepcion_items ( producto_id, precio_unit_base ), recepcion_versiones ( anterior )',
    )
    .eq('id', recepcionId)
    .single()
  expect(data?.corregida_at).not.toBeNull()
  expect(data?.recepcion_items.find((i) => i.producto_id === ids.matambre)?.precio_unit_base).toBe(
    12900,
  )
  expect(data?.recepcion_versiones).toHaveLength(1)

  // En el pedido se ve corregida, y se puede repetir con las mismas cantidades.
  await page.getByRole('link', { name: 'Ver el pedido' }).click()
  await expect(page.getByText(/corregida/)).toBeVisible()
  await expect(page.getByText('$321.800')).toBeVisible()
  await page.getByRole('button', { name: 'Repetir este pedido' }).click()
  await expect(page.getByRole('heading', { name: 'Nuevo pedido' })).toBeVisible()
  await expect(page.getByText('Cargamos las cantidades del pedido anterior')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Resumen del pedido' })).toContainText(
    '3 productos',
  )
})
