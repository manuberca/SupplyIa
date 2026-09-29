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
