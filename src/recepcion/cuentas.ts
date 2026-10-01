// Total de la boleta contra los renglones. Portado de chequearCuentas() de la app de La
// Bodeguita (index.html), sin la regla propia de Papelera. Son dos cosas distintas: el precio
// unitario de cada producto y el total que dice la boleta. Los renglones suelen ser sin IVA y el
// total lo incluye, así que el total puede ser la suma, la suma con 10,5 % o con 21 % (o algo en
// el medio, si la boleta mezcla las dos tasas).

import { pesos } from '../lib/formato'

/** Un renglón de la boleta: el subtotal, si está, ya trae los descuentos del renglón. */
export type RenglonConPrecio = {
  cantidad: number | null
  precio: number | null
  subtotal?: number | null
}

export type Cuentas = {
  estado: 'ok' | 'revisar'
  /** Suma de cantidad × precio de los renglones con los dos datos. */
  suma: number
  alertas: string[]
  /** Si el total no es igual a la suma pero cierra con IVA, lo dice (para no asustar). */
  nota: string | null
  /** Renglones que llegaron y no tienen precio. */
  sinPrecio: number
}

const cerca = (a: number, b: number) =>
  b > 0 && (Math.abs(a - b) <= 5 || Math.abs(a - b) / b <= 0.02)

export function chequearCuentas(
  renglones: RenglonConPrecio[],
  total: number | null,
  /** IVA + percepciones + impuestos internos que leyó la IA en el pie de la boleta (si los leyó). */
  impuestos = 0,
): Cuentas {
  const llegaron = renglones.filter((r) => (r.cantidad ?? 0) > 0)
  const importe = (r: RenglonConPrecio) => r.subtotal ?? (r.cantidad ?? 0) * (r.precio ?? 0)
  // Un renglón con precio o subtotal en 0 es un regalo o una promo: tiene su dato, no le falta.
  const conDatos = llegaron.filter((r) => r.precio !== null || (r.subtotal ?? null) !== null)
  const suma = Math.round(conDatos.reduce((s, r) => s + importe(r), 0) * 100) / 100
  const completo = llegaron.length > 0 && conDatos.length === llegaron.length
  const tot = total ?? 0
  const alertas: string[] = []
  let nota: string | null = null

  if (tot <= 0) alertas.push('Falta cargar el total de la boleta.')
  if (tot > 0 && suma > 0) {
    const igual = cerca(suma, tot)
    const conIva =
      [suma * 1.105, suma * 1.21].some((b) => cerca(b, tot)) ||
      (tot >= suma * 1.1 && tot <= suma * 1.215)
    // Bebidas y similares: impuestos internos y percepciones se suman aparte del IVA.
    const conImpuestos = impuestos > 0 && cerca(suma + impuestos, tot)
    const coherente = igual || conIva || conImpuestos
    if (suma > tot * 1.25) {
      alertas.push(
        `Los renglones suman ${pesos(suma)} pero el total dice ${pesos(tot)}: revisá si algún precio está cargado por caja o pack en vez de por unidad.`,
      )
    } else if (completo && !coherente) {
      alertas.push(
        `Las cuentas no cierran: los renglones suman ${pesos(suma)} y el total dice ${pesos(tot)}.`,
      )
    } else if (conIva && !igual) {
      nota = `La boleta dice ${pesos(tot)}: la diferencia es el IVA, las cuentas cierran.`
    } else if (conImpuestos && !igual) {
      nota = `La boleta dice ${pesos(tot)}: la diferencia son los impuestos (${pesos(impuestos)}), las cuentas cierran.`
    } else if (igual && Math.abs(suma - tot) > 1) {
      nota = `La boleta dice ${pesos(tot)}: ${pesos(Math.abs(tot - suma))} ${tot > suma ? 'más' : 'menos'} que los renglones (redondeos o percepciones), las cuentas cierran.`
    }
  }

  return {
    estado: alertas.length ? 'revisar' : 'ok',
    suma,
    alertas,
    nota,
    sinPrecio: llegaron.length - conDatos.length,
  }
}
