import { Minus, Plus } from 'lucide-react'

/** − valor + (umbral de alerta, tolerancias). */
export function Paso({
  valor,
  onCambiar,
  min = 0,
  max = 100,
  paso = 1,
  texto,
  etiqueta,
  deshabilitado,
}: {
  valor: number
  onCambiar: (v: number) => void
  min?: number
  max?: number
  paso?: number
  texto: (v: number) => string
  etiqueta: string
  deshabilitado?: boolean
}) {
  return (
    <span className="paso" role="group" aria-label={etiqueta}>
      <button
        type="button"
        aria-label={`Menos: ${etiqueta}`}
        disabled={deshabilitado || valor <= min}
        onClick={() => onCambiar(Math.max(min, valor - paso))}
      >
        <Minus size={18} aria-hidden="true" />
      </button>
      <span className="paso__valor" aria-live="polite">
        {texto(valor)}
      </span>
      <button
        type="button"
        aria-label={`Más: ${etiqueta}`}
        disabled={deshabilitado || valor >= max}
        onClick={() => onCambiar(Math.min(max, valor + paso))}
      >
        <Plus size={18} aria-hidden="true" />
      </button>
    </span>
  )
}
