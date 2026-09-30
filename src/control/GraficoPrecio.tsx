import { numero } from '../lib/formato'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fechaCorta = (iso: string) => {
  const d = new Date(iso)
  return `${d.getDate()} ${MESES[d.getMonth()]}`
}

/** Precio de un producto compra por compra (SVG propio, con los colores del diseño). */
export function GraficoPrecio({
  serie,
  unidad,
}: {
  serie: { fecha: string; precio: number }[]
  unidad: string
}) {
  if (serie.length < 2) {
    return (
      <p className="formulario__ayuda">Hay una sola compra: el gráfico aparece desde la segunda.</p>
    )
  }
  const W = 320
  const H = 150
  const izq = 44
  const abajo = 22
  const arriba = 8
  const precios = serie.map((p) => p.precio)
  const min = Math.min(...precios)
  const max = Math.max(...precios)
  const margen = (max - min || max * 0.1 || 1) * 0.15
  const bajo = Math.max(0, min - margen)
  const alto = max + margen
  const x = (i: number) => izq + (i / (serie.length - 1)) * (W - izq - 8)
  const y = (p: number) => arriba + (1 - (p - bajo) / (alto - bajo)) * (H - arriba - abajo)
  const puntos = serie.map((p, i) => `${x(i)},${y(p.precio)}`).join(' ')
  const area = `${x(0)},${H - abajo} ${puntos} ${x(serie.length - 1)},${H - abajo}`
  const marcas = [alto - margen, (alto + bajo) / 2, bajo + margen]
  const ultimo = serie.at(-1)!

  return (
    <svg
      className="grafico"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Precio por ${unidad}: de ${numero(serie[0]!.precio, 0)} el ${fechaCorta(serie[0]!.fecha)} a ${numero(ultimo.precio, 0)} el ${fechaCorta(ultimo.fecha)}`}
    >
      {marcas.map((m) => (
        <g key={m}>
          <line className="grafico__guia" x1={izq} x2={W - 4} y1={y(m)} y2={y(m)} />
          <text className="grafico__eje" x={izq - 6} y={y(m) + 3} textAnchor="end">
            {numero(Math.round(m), 0)}
          </text>
        </g>
      ))}
      <polygon className="grafico__area" points={area} />
      <polyline className="grafico__linea" points={puntos} />
      {serie.map((p, i) => (
        <circle
          key={i}
          className="grafico__punto"
          cx={x(i)}
          cy={y(p.precio)}
          r={i === serie.length - 1 ? 4 : 2.5}
        />
      ))}
      <text className="grafico__eje" x={izq} y={H - 4}>
        {fechaCorta(serie[0]!.fecha)}
      </text>
      <text className="grafico__eje" x={W - 4} y={H - 4} textAnchor="end">
        {fechaCorta(ultimo.fecha)}
      </text>
    </svg>
  )
}
