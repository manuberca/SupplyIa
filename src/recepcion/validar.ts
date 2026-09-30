// Control de cuentas de un remito o factura leída (SPEC §7.4). Portado de validarBoleta()
// de la app de La Bodeguita (netlify/functions/ocr.js), sin las reglas propias de un proveedor.
// Lo usan la función del servidor (sobre la lectura de la IA) y la pantalla de revisión
// (cada vez que la persona corrige un número). Aritmética de la factura argentina:
//   Σ(subtotales de línea) ≈ subtotalNeto
//   subtotalNeto − descuentoGlobal + IVA + percepciones ≈ total

import { numero } from '../lib/formato'

export type Confianza = 'alta' | 'media' | 'baja'

export type LineaLeida = {
  texto: string
  cantidad: number | null
  unidad: string | null
  precioUnit: number | null
  descuentoLinea: number | null
  subtotal: number | null
  confianza: Confianza
  observacion: string
}

export type TotalesLeidos = {
  subtotalNeto: number | null
  descuentoGlobal: number | null
  iva: number | null
  percepciones: number | null
  total: number | null
}

export type LineaValidada = LineaLeida & { esPromo: boolean }

export type Validacion = {
  estado: 'OK' | 'Revisar'
  sumaLineas: number
  diferenciaTotal: number | null
  esRemitoSinValores: boolean
  observaciones: string[]
  lineas: LineaValidada[]
}

const ORDEN_CONFIANZA: Record<Confianza, number> = { alta: 0, media: 1, baja: 2 }
const peor = (a: Confianza, b: Confianza): Confianza =>
  ORDEN_CONFIANZA[b] > ORDEN_CONFIANZA[a] ? b : a

/** El descuento de línea viene como porcentaje (0–100) o, si es mayor, como importe en pesos. */
export function aplicarDescuento(bruto: number, descuento: number | null): number {
  if (!descuento) return bruto
  if (descuento > 0 && descuento <= 100) return bruto * (1 - descuento / 100)
  return Math.max(0, bruto - descuento)
}

const redondear = (n: number) => Math.round(n * 100) / 100
const cerca = (a: number, b: number) => {
  const dif = Math.abs(a - b)
  return dif <= 5 || (b > 0 && dif / b <= 0.015)
}
const pesos = (n: number) => `$${numero(n, 2)}`

function validarLinea(linea: LineaLeida): LineaValidada {
  let { precioUnit, subtotal, confianza } = linea
  const { cantidad, descuentoLinea } = linea
  const obs = linea.observacion ? [linea.observacion] : []

  // Promo o unidad sin cargo: subtotal 0 con precio 0 o descuento 100% es válido.
  const esPromo =
    subtotal === 0 &&
    cantidad !== null &&
    cantidad > 0 &&
    (descuentoLinea === 100 || precioUnit === 0)
  if (esPromo) {
    if (!obs.length) obs.push('Unidad sin cargo')
    return { ...linea, observacion: obs.join(' · '), esPromo }
  }

  if (subtotal === null && cantidad !== null && precioUnit !== null) {
    subtotal = redondear(aplicarDescuento(cantidad * precioUnit, descuentoLinea))
  }
  if (precioUnit === null && cantidad !== null && cantidad > 0 && subtotal !== null) {
    precioUnit = redondear(subtotal / cantidad)
    obs.push('Precio calculado: total de línea ÷ cantidad')
  }

  // Coherencia de línea: acepta el subtotal con o sin el descuento de línea aplicado.
  if (
    cantidad !== null &&
    precioUnit !== null &&
    subtotal !== null &&
    subtotal > 0 &&
    cantidad > 0
  ) {
    const bruto = cantidad * precioUnit
    const conDescuento = aplicarDescuento(bruto, descuentoLinea)
    const dif = Math.min(Math.abs(subtotal - bruto), Math.abs(subtotal - conDescuento)) / subtotal
    if (dif > 0.03) {
      // ¿Precio y subtotal invertidos?
      const siInvertido = cantidad * subtotal
      if (precioUnit > 0 && Math.abs(precioUnit - siInvertido) / precioUnit < 0.03) {
        ;[precioUnit, subtotal] = [subtotal, precioUnit]
        obs.push('Se corrigió precio y total de línea invertidos')
      } else {
        confianza = 'baja'
        obs.push(`Revisar: ${cantidad} × ${precioUnit} no da el total de línea ${subtotal}`)
      }
    }
  }

  if (
    subtotal === 0 &&
    cantidad !== null &&
    cantidad > 0 &&
    precioUnit !== null &&
    precioUnit > 0
  ) {
    confianza = 'baja'
    obs.push('Revisar: el total de línea figura en 0')
  }
  if (precioUnit === null) confianza = peor(confianza, 'baja')
  if (cantidad === null) {
    confianza = peor(confianza, 'baja')
    obs.push('Cantidad no detectada')
  }

  return { ...linea, precioUnit, subtotal, confianza, observacion: obs.join(' · '), esPromo: false }
}

export function validarRemito(lineasLeidas: LineaLeida[], totales: TotalesLeidos): Validacion {
  const lineas = lineasLeidas.map(validarLinea)
  const observaciones: string[] = []
  const sumaLineas = redondear(lineas.reduce((s, l) => s + (l.subtotal ?? 0), 0))
  const { total, subtotalNeto } = totales
  const descuentoGlobal = totales.descuentoGlobal ?? 0
  const iva = totales.iva ?? 0
  const percepciones = totales.percepciones ?? 0

  // Remito sin precios (la factura llega después): no hay nada que controlar todavía.
  const esRemitoSinValores =
    lineas.length > 0 &&
    lineas.every((l) => !(l.precioUnit && l.precioUnit > 0) && !(l.subtotal && l.subtotal > 0)) &&
    !(total && total > 0) &&
    !(subtotalNeto && subtotalNeto > 0)
  if (esRemitoSinValores) for (const l of lineas) l.esPromo = false

  let estado: Validacion['estado'] = 'OK'
  let diferenciaTotal: number | null = null

  // 1) ¿La suma de líneas da el neto declarado? (renglones salteados o mal leídos)
  if (subtotalNeto && subtotalNeto > 0 && !cerca(sumaLineas, subtotalNeto)) {
    if (Math.abs(sumaLineas - subtotalNeto) / subtotalNeto > 0.02) {
      estado = 'Revisar'
      observaciones.push(
        `La suma de los renglones (${pesos(sumaLineas)}) no da el neto (${pesos(subtotalNeto)}): puede faltar o sobrar un renglón.`,
      )
    }
  }

  // 2) ¿Cierra contra el total?
  if (total && total > 0) {
    const base = subtotalNeto ?? sumaLineas
    const esperado = base - descuentoGlobal + iva + percepciones
    diferenciaTotal = redondear(total - esperado)
    if (!cerca(esperado, total)) {
      // Si la boleta declara impuestos, el total tiene que estar por encima del neto.
      const hayImpuesto = iva > 0 || percepciones > 0
      const candidatos = hayImpuesto
        ? [base * 1.105, base * 1.21, sumaLineas * 1.105, sumaLineas * 1.21]
        : [base, base * 1.105, base * 1.21, sumaLineas, sumaLineas * 1.105, sumaLineas * 1.21]
      if (candidatos.some((c) => cerca(c, total))) {
        observaciones.push('Total verificado (el IVA no está discriminado en el detalle).')
      } else {
        estado = 'Revisar'
        observaciones.push(
          `Las cuentas no cierran: los renglones dan ${pesos(esperado)} y el total dice ${pesos(total)}. ` +
            (total < esperado
              ? 'El total es menor que la suma: revisá si se leyó el neto en vez del total.'
              : 'Revisá renglón por renglón antes de pagar.'),
        )
      }
    }
  } else if (esRemitoSinValores) {
    observaciones.push(
      'Remito sin precios: cargá los importes o esperá la factura para controlarlos.',
    )
  } else if (lineas.length > 0) {
    estado = 'Revisar'
    observaciones.push('No se encontró el total del remito.')
  }

  const dudosas = lineas.filter((l) => l.confianza === 'baja' && !l.esPromo).length
  if (dudosas > 0 && !esRemitoSinValores) {
    estado = 'Revisar'
    observaciones.push(
      dudosas === 1
        ? 'Hay 1 renglón dudoso: revisalo contra el papel.'
        : `Hay ${dudosas} renglones dudosos: revisalos contra el papel.`,
    )
  }

  return { estado, sumaLineas, diferenciaTotal, esRemitoSinValores, observaciones, lineas }
}
