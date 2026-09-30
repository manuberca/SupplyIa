// Importación del catálogo desde Excel (SPEC §9): valida todo antes de guardar y arma
// los datos para public.importar_catalogo, que los guarda de una vez (todo o nada).
// La importación solo agrega: lo que ya está cargado se deja como está.

import { leerDias } from '../lib/dias'
import { leerNumero } from '../lib/formato'
import { normalizar, normalizarUnidad } from '../lib/normalizar'
import { normalizarWhatsapp } from '../lib/whatsapp'
import type { Catalogo } from './tipos'

export type Celda = string | number | boolean | Date | null | undefined
export type Hoja = { nombre: string; filas: Celda[][] }

export const COLUMNAS_PROVEEDORES = [
  'Nombre',
  'WhatsApp',
  'Días de entrega',
  'Pedir antes de',
] as const
export const COLUMNAS_PRODUCTOS = [
  'Proveedor',
  'Producto',
  'Unidad',
  'Presentación',
  'Cantidad por presentación',
  'Cómo figura en el remito',
  'Último precio',
] as const

export type Problema = { hoja: string; fila: number | null; mensaje: string }

export type DatosImportacion = {
  proveedores: {
    id: string
    nombre: string
    whatsapp: string
    dias_entrega: number[]
    hora_limite: string | null
  }[]
  productos: { id: string; proveedor_id: string; nombre: string; unidad_base_id: string }[]
  presentaciones: {
    id: string
    producto_id: string
    nombre: string
    factor_a_base: number
    aproximada: boolean
  }[]
  equivalencias: { id: string; proveedor_id: string; texto_remito: string; producto_id: string }[]
  precios: { id: string; proveedor_id: string; producto_id: string; precio_base: number }[]
}

export type ResultadoImportacion = {
  errores: Problema[]
  avisos: Problema[]
  datos: DatosImportacion
}

/** Texto de una celda. Las horas que Excel guarda como fecha o fracción del día pasan a "18:00". */
export function textoCelda(valor: Celda): string {
  if (valor === null || valor === undefined) return ''
  if (valor instanceof Date) {
    const h = String(valor.getUTCHours()).padStart(2, '0')
    const m = String(valor.getUTCMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }
  return String(valor).trim()
}

function horaDeExcel(valor: Celda): string {
  if (typeof valor === 'number' && valor > 0 && valor < 1) {
    const minutos = Math.round(valor * 24 * 60)
    return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`
  }
  return textoCelda(valor)
}

type Tabla = { filas: { numero: number; valores: Record<string, Celda> }[] } | { error: string }

/** Ubica cada columna por su título (en cualquier orden) y descarta las filas vacías. */
function leerTabla(hoja: Hoja, columnas: readonly string[]): Tabla {
  const titulos = (hoja.filas[0] ?? []).map((c) => normalizar(textoCelda(c)))
  const posicion: Record<string, number> = {}
  for (const col of columnas) {
    const i = titulos.indexOf(normalizar(col))
    if (i !== -1) posicion[col] = i
  }
  // Las dos primeras columnas son obligatorias; las demás pueden faltar.
  const faltan = columnas.slice(0, 2).filter((c) => posicion[c] === undefined)
  if (faltan.length) {
    return {
      error: `No encontramos las columnas ${faltan.map((c) => `"${c}"`).join(' y ')} en la primera fila. Usá la plantilla.`,
    }
  }
  const filas = hoja.filas.slice(1).flatMap((fila, i) => {
    if (fila.every((c) => textoCelda(c) === '')) return []
    const valores: Record<string, Celda> = {}
    for (const col of columnas)
      valores[col] = posicion[col] === undefined ? null : fila[posicion[col]!]
    return [{ numero: i + 2, valores }]
  })
  return { filas }
}

export function prepararImportacion(
  hojas: Hoja[],
  catalogo: Catalogo,
  nuevoId: () => string = () => crypto.randomUUID(),
): ResultadoImportacion {
  const errores: Problema[] = []
  const avisos: Problema[] = []
  const datos: DatosImportacion = {
    proveedores: [],
    productos: [],
    presentaciones: [],
    equivalencias: [],
    precios: [],
  }

  const hojaProveedores = hojas.find((h) => normalizar(h.nombre) === 'proveedores')
  const hojaProductos = hojas.find((h) => normalizar(h.nombre) === 'productos')
  if (!hojaProveedores && !hojaProductos) {
    errores.push({
      hoja: 'Planilla',
      fila: null,
      mensaje: 'No tiene las hojas "Proveedores" ni "Productos". Bajá la plantilla y completala.',
    })
    return { errores, avisos, datos }
  }

  // ─── Proveedores ─────────────────────────────────────────────────────────
  // Nombre normalizado → id (los que ya estaban y los nuevos de la planilla)
  const proveedorPorNombre = new Map<string, string>()
  const activos = catalogo.proveedores.filter((p) => p.activo)
  for (const p of activos) proveedorPorNombre.set(normalizar(p.nombre), p.id)
  const numerosUsados = new Map(activos.map((p) => [p.whatsapp, p.nombre]))
  const conError = new Set<string>() // proveedores de la planilla que tienen un error

  if (hojaProveedores) {
    const tabla = leerTabla(hojaProveedores, COLUMNAS_PROVEEDORES)
    if ('error' in tabla) errores.push({ hoja: 'Proveedores', fila: 1, mensaje: tabla.error })
    else {
      const enLaPlanilla = new Set<string>()
      for (const { numero, valores } of tabla.filas) {
        const nombre = textoCelda(valores['Nombre'])
        const clave = normalizar(nombre)
        const problema = (mensaje: string) => {
          errores.push({ hoja: 'Proveedores', fila: numero, mensaje })
          if (clave) conError.add(clave)
        }
        if (!nombre) {
          problema('Falta el nombre del proveedor.')
          continue
        }
        if (enLaPlanilla.has(clave)) {
          problema(`"${nombre}" está repetido en la planilla.`)
          continue
        }
        enLaPlanilla.add(clave)
        if (proveedorPorNombre.has(clave)) {
          avisos.push({
            hoja: 'Proveedores',
            fila: numero,
            mensaje: `"${nombre}" ya estaba cargado: se deja como está.`,
          })
          continue
        }
        const whatsapp = normalizarWhatsapp(textoCelda(valores['WhatsApp']))
        if (!whatsapp.ok) {
          problema(`${nombre}: ${whatsapp.mensaje}`)
          continue
        }
        const duenio = numerosUsados.get(whatsapp.numero)
        if (duenio) {
          problema(`${nombre}: ese WhatsApp ya lo tiene ${duenio}.`)
          continue
        }
        const dias = leerDias(textoCelda(valores['Días de entrega']))
        if (!dias.ok) {
          problema(`${nombre}: ${dias.mensaje}`)
          continue
        }
        const hora = horaDeExcel(valores['Pedir antes de'])
        if (hora.length > 60) {
          problema(`${nombre}: "Pedir antes de" es muy largo (hasta 60 letras).`)
          continue
        }
        const id = nuevoId()
        numerosUsados.set(whatsapp.numero, nombre)
        proveedorPorNombre.set(clave, id)
        datos.proveedores.push({
          id,
          nombre,
          whatsapp: whatsapp.numero,
          dias_entrega: dias.dias,
          hora_limite: hora || null,
        })
      }
    }
  }

  // ─── Productos ───────────────────────────────────────────────────────────
  if (hojaProductos) {
    const tabla = leerTabla(hojaProductos, COLUMNAS_PRODUCTOS)
    if ('error' in tabla) errores.push({ hoja: 'Productos', fila: 1, mensaje: tabla.error })
    else {
      const unidades = catalogo.unidades.filter((u) => !u.archivada)
      const nombresUnidades = unidades.map((u) => u.nombre).join(', ')
      const existentes = new Set(
        catalogo.productos
          .filter((p) => p.activo)
          .map((p) => `${p.proveedor_id}|${normalizar(p.nombre)}`),
      )
      // Un producto puede ocupar varias filas (una por presentación).
      const nuevos = new Map<
        string,
        {
          id: string
          proveedorId: string
          unidadId: string
          presentaciones: Set<string>
          remitos: Set<string>
        }
      >()
      const remitosPorProveedor = new Map<string, Set<string>>()
      const avisados = new Set<string>()

      for (const { numero, valores } of tabla.filas) {
        const problema = (mensaje: string) =>
          errores.push({ hoja: 'Productos', fila: numero, mensaje })
        const proveedor = textoCelda(valores['Proveedor'])
        const nombre = textoCelda(valores['Producto'])
        if (!proveedor || !nombre) {
          problema(!proveedor ? 'Falta el proveedor.' : 'Falta el nombre del producto.')
          continue
        }
        const proveedorId = proveedorPorNombre.get(normalizar(proveedor))
        if (!proveedorId) {
          problema(
            conError.has(normalizar(proveedor))
              ? `${nombre}: el proveedor "${proveedor}" tiene un error en la hoja Proveedores. Corregilo primero.`
              : `El proveedor "${proveedor}" no está en la hoja Proveedores ni cargado en la app.`,
          )
          continue
        }
        const clave = `${proveedorId}|${normalizar(nombre)}`
        if (existentes.has(clave)) {
          if (!avisados.has(clave)) {
            avisos.push({
              hoja: 'Productos',
              fila: numero,
              mensaje: `${nombre} (${proveedor}) ya estaba cargado: se deja como está.`,
            })
            avisados.add(clave)
          }
          continue
        }

        const textoUnidad = textoCelda(valores['Unidad'])
        const unidad = unidades.find(
          (u) => normalizarUnidad(u.nombre) === normalizarUnidad(textoUnidad),
        )
        if (!textoUnidad || !unidad) {
          problema(
            textoUnidad
              ? `${nombre}: la unidad "${textoUnidad}" no existe. Usá una de estas: ${nombresUnidades} (o creala en Ajustes).`
              : `${nombre}: falta la unidad (por ejemplo kg o unidad).`,
          )
          continue
        }

        let producto = nuevos.get(clave)
        if (producto && producto.unidadId !== unidad.id) {
          problema(
            `${nombre}: en otra fila tiene otra unidad. Cada producto se compra en una sola unidad.`,
          )
          continue
        }

        // Presentación (opcional): "Caja" + 18. "≈ 4,5" o "aprox 4,5" la marca como aproximada.
        const presentacion = textoCelda(valores['Presentación'])
        const textoCantidad = textoCelda(valores['Cantidad por presentación'])
        const aproximada = /≈|~|aprox/i.test(textoCantidad)
        const cantidad = leerNumero(textoCantidad.replace(/≈|~|aprox\.?/gi, ''))
        if (presentacion && (cantidad === null || cantidad <= 0)) {
          problema(
            `${nombre}: poné cuántos ${unidad.nombre} trae la presentación "${presentacion}" (un número mayor a 0).`,
          )
          continue
        }
        if (!presentacion && textoCantidad) {
          problema(
            `${nombre}: hay una cantidad por presentación pero falta el nombre de la presentación.`,
          )
          continue
        }
        if (presentacion && producto?.presentaciones.has(normalizarUnidad(presentacion))) {
          problema(`${nombre}: la presentación "${presentacion}" está repetida.`)
          continue
        }

        const remito = textoCelda(valores['Cómo figura en el remito'])
        const remitos = remitosPorProveedor.get(proveedorId) ?? new Set<string>()
        if (
          remito &&
          remitos.has(normalizar(remito)) &&
          !producto?.remitos.has(normalizar(remito))
        ) {
          problema(`${nombre}: "${remito}" ya está usado para otro producto de ${proveedor}.`)
          continue
        }

        const textoPrecio = textoCelda(valores['Último precio'])
        const precio = textoPrecio ? leerNumero(textoPrecio) : null
        if (textoPrecio && (precio === null || precio < 0)) {
          problema(`${nombre}: el último precio "${textoPrecio}" no es un número.`)
          continue
        }

        if (!producto) {
          producto = {
            id: nuevoId(),
            proveedorId,
            unidadId: unidad.id,
            presentaciones: new Set(),
            remitos: new Set(),
          }
          nuevos.set(clave, producto)
          datos.productos.push({
            id: producto.id,
            proveedor_id: proveedorId,
            nombre,
            unidad_base_id: unidad.id,
          })
        }
        if (presentacion && cantidad) {
          producto.presentaciones.add(normalizarUnidad(presentacion))
          datos.presentaciones.push({
            id: nuevoId(),
            producto_id: producto.id,
            nombre: presentacion,
            factor_a_base: cantidad,
            aproximada,
          })
        }
        if (remito && !producto.remitos.has(normalizar(remito))) {
          producto.remitos.add(normalizar(remito))
          remitos.add(normalizar(remito))
          remitosPorProveedor.set(proveedorId, remitos)
          datos.equivalencias.push({
            id: nuevoId(),
            proveedor_id: proveedorId,
            texto_remito: remito,
            producto_id: producto.id,
          })
        }
        if (precio !== null) {
          // Si el producto aparece en varias filas con precio, vale el último.
          const productoId = producto.id
          datos.precios = datos.precios.filter((p) => p.producto_id !== productoId)
          datos.precios.push({
            id: nuevoId(),
            proveedor_id: proveedorId,
            producto_id: productoId,
            precio_base: precio,
          })
        }
      }
    }
  }

  return { errores, avisos, datos }
}
