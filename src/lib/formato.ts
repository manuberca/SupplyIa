// Números en formato argentino: $14.200 · 11,6 kg · +9,3%
// Se arma a mano en vez de Intl para que dé igual en todos los navegadores
// (algunos no agrupan los miles en números de 4 cifras).

function agrupar(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Formatea con hasta `maxDecimales` decimales, sin ceros de más a la derecha. */
export function numero(valor: number, maxDecimales = 2): string {
  if (!Number.isFinite(valor)) return '—'
  const fijo = Math.abs(valor).toFixed(maxDecimales)
  const [entero = '0', decimales = ''] = fijo.split('.')
  const dec = decimales.replace(/0+$/, '')
  const cuerpo = agrupar(entero) + (dec ? ',' + dec : '')
  const esCero = Number(fijo) === 0
  return (valor < 0 && !esCero ? '-' : '') + cuerpo
}

/** Plata sin centavos: $14.200 */
export function pesos(valor: number): string {
  if (!Number.isFinite(valor)) return '—'
  const texto = numero(Math.round(valor), 0)
  return texto.startsWith('-') ? '-$' + texto.slice(1) : '$' + texto
}

/** Cantidad con su unidad: 11,6 kg */
export function cantidad(valor: number, unidad: string): string {
  return `${numero(valor, 2)} ${unidad}`
}

/** Variación con signo y un decimal: +9,3% · -2% · 0% */
export function porcentaje(valor: number): string {
  if (!Number.isFinite(valor)) return '—'
  const texto = numero(valor, 1)
  if (texto === '0') return '0%'
  return (valor > 0 ? '+' : '') + texto + '%'
}

/**
 * Lee un número escrito a la argentina: "4,5" · "1.200" · "1.200,50" · "$ 2.900".
 * También acepta el punto decimal ("4.5") cuando no parece separador de miles.
 * Devuelve null si no es un número.
 */
export function leerNumero(texto: string | number | null | undefined): number | null {
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null
  let t = (texto ?? '').replace(/[$\s]/g, '')
  if (!t) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  return Number(t)
}
