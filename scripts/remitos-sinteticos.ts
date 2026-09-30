// Arma remitos de prueba a partir de boletas REALES de La Bodeguita (ya leídas y controladas
// por su personal): cada uno con el estilo de columnas de su proveedor y con defectos de foto
// (torcido, borroso, poca luz). Como se sabe exactamente qué dice cada uno, la lectura con IA
// se puede puntuar sola (npm run remitos:probar). Reemplaza a las fotos reales mientras no haya.
//
// Uso:
//   npm run remitos:armar -- --boletas <boletas.json> --salida <carpeta> [--cantidad 12] [--semilla 7]
//
// Deja en la carpeta: las imágenes (.jpg), proveedores.json (para remitos:probar) y verdad.json
// (lo que debería leerse). La carpeta va fuera del repo: tiene precios reales de proveedores.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'

type Item = {
  productoOriginalBoleta?: string
  producto?: string
  cantidad?: number | string
  unidad?: string
  precioUnit?: number | string
  subtotal?: number | string
}
type Boleta = {
  id: string
  nroBoleta?: string
  proveedor: string
  fecha: string
  total?: number | string
  items?: Item[]
}

export type Verdad = {
  archivo: string
  boleta: string
  proveedor: string
  estilo: Estilo
  defectos: string[]
  nro: string
  fecha: string
  total: number
  items: {
    texto: string
    producto: string
    cantidad: number
    unidad: string
    precio: number
    subtotal: number
  }[]
}

type Estilo = 'factura_a' | 'nota_debito' | 'remito_simple' | 'ticket'

// El estilo de cada proveedor, según los formatos que describe el prompt de La Bodeguita.
const ESTILO_DE: Record<string, Estilo> = {
  Juanchi: 'nota_debito',
  'Cook Express': 'remito_simple',
  'La Esperanza': 'factura_a',
  Climp: 'factura_a',
  Quilmes: 'factura_a',
  Vinesco: 'factura_a',
  Papelera: 'factura_a',
  Tony: 'remito_simple',
  Cepro: 'ticket',
  'Al Vino Vino': 'factura_a',
  Speed: 'ticket',
  'Mayorista Segui': 'ticket',
}

const { values } = parseArgs({
  options: {
    boletas: { type: 'string' },
    salida: { type: 'string' },
    cantidad: { type: 'string', default: '12' },
    semilla: { type: 'string', default: '7' },
  },
})
if (!values.boletas || !existsSync(values.boletas) || !values.salida) {
  console.error(
    'Uso: npm run remitos:armar -- --boletas <boletas.json> --salida <carpeta> [--cantidad 12] [--semilla 7]',
  )
  process.exit(1)
}

// Azar repetible (misma semilla → mismos remitos, así las pruebas se pueden comparar).
let estado = Number(values.semilla)
const azar = () => (estado = (estado * 1103515245 + 12345) % 2147483648) / 2147483648
const entre = (a: number, b: number) => a + (b - a) * azar()

const num = (v: unknown) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.')))
const boletas = (JSON.parse(readFileSync(values.boletas, 'utf8')) as { boletas: Boleta[] }).boletas

// Boletas completas y coherentes, repartidas entre proveedores de estilos distintos.
const aptas = boletas.filter((b) => {
  const items = b.items ?? []
  return (
    ESTILO_DE[b.proveedor] &&
    b.nroBoleta &&
    num(b.total) > 0 &&
    items.length >= 3 &&
    items.length <= 18 &&
    items.every(
      (i) =>
        i.productoOriginalBoleta &&
        num(i.cantidad) > 0 &&
        num(i.precioUnit) > 0 &&
        num(i.subtotal) > 0,
    ) &&
    // Coherentes: cada renglón cierra y la suma da el total (con o sin IVA). Hay boletas cargadas a medias.
    coherente(items, num(b.total))
  )
})

function coherente(items: Item[], total: number): boolean {
  const suma = items.reduce((s, i) => s + num(i.subtotal), 0)
  const renglonesBien = items.every(
    (i) =>
      Math.abs(num(i.cantidad) * num(i.precioUnit) - num(i.subtotal)) <=
      Math.max(2, num(i.subtotal) * 0.02),
  )
  return renglonesBien && total >= suma * 0.99 && total <= suma * 1.3
}
const porProveedor = new Map<string, Boleta[]>()
for (const b of aptas) porProveedor.set(b.proveedor, [...(porProveedor.get(b.proveedor) ?? []), b])
const elegidas: Boleta[] = []
const cantidad = Number(values.cantidad)
for (let vuelta = 0; elegidas.length < cantidad && vuelta < 10; vuelta++) {
  for (const lista of porProveedor.values()) {
    if (elegidas.length >= cantidad) break
    const b = lista[Math.floor(azar() * lista.length)]
    if (b && !elegidas.includes(b)) elegidas.push(b)
  }
}

// ─── Números como los escribe cada proveedor ─────────────────────────────
const arg = (n: number, dec = 2) =>
  n
    .toFixed(dec)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const usa = (n: number, dec = 2) => n.toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

function html(b: Boleta, estilo: Estilo, defectos: string[]): { pagina: string; total: number } {
  const items = (b.items ?? []).map((i) => ({
    texto: i.productoOriginalBoleta!.trim(),
    cantidad: num(i.cantidad),
    precio: num(i.precioUnit),
    subtotal: num(i.subtotal),
  }))
  const neto = items.reduce((s, i) => s + i.subtotal, 0)
  const total = num(b.total)
  // Si el total supera al neto, la diferencia se muestra como IVA (factura A); si no, factura B/remito.
  const iva = estilo === 'factura_a' && total > neto * 1.02 ? total - neto : 0
  const fecha = b.fecha.split(',')[0]
  const f = estilo === 'remito_simple' ? usa : arg
  const codigo = () => String(Math.floor(entre(100, 99999)))
  const filas = items
    .map((i) => {
      switch (estilo) {
        case 'nota_debito':
          return `<tr><td>${codigo()}</td><td class="t">${i.texto}</td><td>${usa(i.cantidad)}</td><td>${usa(i.precio)}</td><td>0.00</td><td>${usa(i.subtotal)}</td></tr>`
        case 'remito_simple':
          return `<tr><td>${usa(i.cantidad)}</td><td class="t">${i.texto}</td><td>${f(i.precio)}</td><td>${f(i.subtotal)}</td></tr>`
        case 'ticket':
          return `<tr><td class="t" colspan="3">${i.texto}</td></tr><tr><td>${arg(i.cantidad, 3)} x</td><td>${arg(i.precio)}</td><td>${arg(i.subtotal)}</td></tr>`
        default:
          return `<tr><td>${codigo()}</td><td class="t">${i.texto}</td><td>${arg(i.cantidad)}</td><td>${arg(i.precio)}</td><td>21,00%</td><td>${arg(i.subtotal)}</td></tr>`
      }
    })
    .join('')
  const encabezados = {
    nota_debito: ['Código', 'Descripción', 'Cantidad', 'Precio', 'Descuento', 'Total'],
    remito_simple: ['CANT', 'DESCRIPCION', 'P.UNIT', 'SUBTOTAL'],
    ticket: ['Cant.', 'P.Unit', 'Importe'],
    factura_a: ['CODIGO', 'DESCRIPCION', 'CANT', 'P.UNITARIO', '%IVA', 'P.TOTAL'],
  }[estilo]
  const titulo = {
    nota_debito: 'NOTA DE DÉBITO INTERNA',
    remito_simple: 'REMITO',
    ticket: 'TICKET',
    factura_a: iva ? 'FACTURA A' : 'FACTURA B',
  }[estilo]
  const totales = iva
    ? `<tr><td>Subtotal Neto Gravado</td><td>$ ${arg(neto)}</td></tr><tr><td>I.V.A. 21%</td><td>$ ${arg(iva)}</td></tr><tr class="g"><td>TOTAL</td><td>$ ${arg(total)}</td></tr>`
    : `<tr class="g"><td>TOTAL</td><td>$ ${f(total)}</td></tr>`

  const giro = defectos.includes('de costado') ? 90 : entre(-3, 3)
  const borroso = defectos.includes('borroso') ? entre(0.7, 1.1) : entre(0.2, 0.45)
  const luz = defectos.includes('poca luz') ? entre(0.62, 0.75) : entre(0.92, 1.05)
  const ancho = estilo === 'ticket' ? 420 : 760
  const pagina = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#6b6258;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:80px;box-sizing:border-box}
    .hoja{width:${ancho}px;padding:28px 30px;background:#f7f3ea;color:#1d1d1d;font:${estilo === 'ticket' ? '13px "Courier New",monospace' : '13px Arial,Helvetica,sans-serif'};
      transform:rotate(${giro}deg) perspective(900px) rotateX(${entre(0, 4)}deg);filter:blur(${borroso}px) brightness(${luz}) contrast(${entre(0.9, 1.1)});
      box-shadow:0 12px 40px rgba(0,0,0,.45);position:relative}
    .hoja:after{content:"";position:absolute;inset:0;background:linear-gradient(${entre(0, 360)}deg,rgba(0,0,0,.18),transparent 45%);pointer-events:none}
    h1{font-size:18px;margin:0 0 2px}.cab{display:flex;justify-content:space-between;border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:10px}
    table{width:100%;border-collapse:collapse}th{font-size:11px;text-align:right;border-bottom:1px solid #333;padding:4px}th:nth-child(${estilo === 'remito_simple' ? 2 : 2}){text-align:left}
    td{padding:3px 4px;text-align:right;vertical-align:top}td.t{text-align:left}.tot{margin-top:14px;margin-left:auto;width:${estilo === 'ticket' ? '100%' : '55%'}}
    .tot td{border-top:1px solid #bbb}.g td{font-weight:bold;font-size:15px}
  </style></head><body><div class="hoja">
    <div class="cab"><div><h1>${b.proveedor.toUpperCase()}</h1><div>CUIT 30-${codigo()}${codigo()}-${Math.floor(entre(0, 9))} · IVA Responsable Inscripto</div><div>Rosario, Santa Fe</div></div>
    <div style="text-align:right"><strong>${titulo}</strong><div>N° ${b.nroBoleta}</div><div>Fecha: ${fecha}</div><div>Cliente: LA BODEGUITA</div></div></div>
    <table><thead><tr>${encabezados.map((e) => `<th>${e}</th>`).join('')}</tr></thead><tbody>${filas}</tbody></table>
    <table class="tot">${totales}</table>
  </div></body></html>`
  return { pagina, total }
}

mkdirSync(values.salida, { recursive: true })
const navegador = await chromium.launch()
const pagina = await navegador.newPage({
  viewport: { width: 1100, height: 1400 },
  deviceScaleFactor: 1.4,
})
const verdades: Verdad[] = []
const proveedores: Record<string, string> = {}

for (const [n, b] of elegidas.entries()) {
  const estilo = ESTILO_DE[b.proveedor]!
  const defectos = [['borroso'], ['poca luz'], [], ['de costado'], [], ['borroso', 'poca luz']][
    n % 6
  ]!
  const { pagina: contenido, total } = html(b, estilo, defectos)
  const archivo = `${String(n + 1).padStart(2, '0')}-${b.proveedor.replace(/\W+/g, '-').toLowerCase()}.jpg`
  await pagina.setContent(contenido)
  // Como una foto: el remito con un poco de mesa alrededor.
  const caja = (await pagina.locator('.hoja').boundingBox())!
  const margen = 60
  await pagina.screenshot({
    path: join(values.salida, archivo),
    type: 'jpeg',
    quality: 82,
    clip: {
      x: Math.max(0, caja.x - margen),
      y: Math.max(0, caja.y - margen),
      width: caja.width + margen * 2,
      height: caja.height + margen * 2,
    },
  })
  proveedores[archivo] = b.proveedor
  verdades.push({
    archivo,
    boleta: b.id,
    proveedor: b.proveedor,
    estilo,
    defectos,
    nro: b.nroBoleta!,
    fecha: b.fecha.split(',')[0]!,
    total,
    items: (b.items ?? []).map((i) => ({
      texto: i.productoOriginalBoleta!.trim(),
      producto: (i.producto ?? '').trim(),
      cantidad: num(i.cantidad),
      unidad: i.unidad ?? '',
      precio: num(i.precioUnit),
      subtotal: num(i.subtotal),
    })),
  })
  console.log(
    `✓ ${archivo} · ${estilo} · ${b.items?.length} renglones${defectos.length ? ` · ${defectos.join(', ')}` : ''}`,
  )
}
await navegador.close()
writeFileSync(join(values.salida, 'proveedores.json'), JSON.stringify(proveedores, null, 2))
writeFileSync(join(values.salida, 'verdad.json'), JSON.stringify(verdades, null, 2))
console.log(`\n${elegidas.length} remitos en ${values.salida}`)
