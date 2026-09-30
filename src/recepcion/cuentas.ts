// Total de la boleta contra los renglones. Portado de chequearCuentas() de la app de La
// Bodeguita (index.html), sin la regla propia de Papelera. Son dos cosas distintas: el precio
// unitario de cada producto y el total que dice la boleta. Los renglones suelen ser sin IVA y el
// total lo incluye, así que el total puede ser la suma, la suma con 10,5 % o con 21 % (o algo en
// el medio, si la boleta mezcla las dos tasas).

import { pesos } from '../lib/formato'

export type RenglonConPrecio = { cantidad: number | null; precio: number | null }

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

export function chequearCuentas(renglones: RenglonConPrecio[], total: number | null): Cuentas {
  const llegaron = renglones.filter((r) => (r.cantidad ?? 0) > 0)
  const conDatos = llegaron.filter((r) => (r.precio ?? 0) > 0)
  const suma =
    Math.round(conDatos.reduce((s, r) => s + (r.cantidad ?? 0) * (r.precio ?? 0), 0) * 100) / 100
  const completo = llegaron.length > 0 && conDatos.length === llegaron.length
  const tot = total ?? 0
  const alertas: string[] = []
  let nota: string | null = null

  if (tot <= 0) alertas.push('Falta cargar el total de la boleta.')
  if (tot > 0 && suma > 0) {
    const coherente =
      [suma, suma * 1.105, suma * 1.21].some((b) => cerca(b, tot)) ||
      (tot >= suma * 1.1 && tot <= suma * 1.215)
    if (suma > tot * 1.25) {
      alertas.push(
        `Los renglones suman ${pesos(suma)} pero el total dice ${pesos(tot)}: revisá si algún precio está cargado por caja o pack en vez de por unidad.`,
      )
    } else if (completo && !coherente) {
      alertas.push(
        `Las cuentas no cierran: los renglones suman ${pesos(suma)} y el total dice ${pesos(tot)}.`,
      )
    } else if (coherente && Math.abs(suma - tot) > 1) {
      nota = `La boleta dice ${pesos(tot)}: la diferencia es el IVA, las cuentas cierran.`
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
