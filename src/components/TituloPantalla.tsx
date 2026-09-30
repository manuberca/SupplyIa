import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronLeft } from 'lucide-react'

type Props = { titulo: string; volver?: string; subtitulo?: ReactNode }

/** Título de una pantalla interna, con la flecha para volver. */
export function TituloPantalla({ titulo, volver, subtitulo }: Props) {
  return (
    <div>
      <div className="titulo-pantalla">
        {volver && (
          <Link to={volver} className="volver" aria-label="Volver">
            <ChevronLeft size={26} strokeWidth={2.2} aria-hidden="true" />
          </Link>
        )}
        <h1>{titulo}</h1>
      </div>
      {subtitulo && <p className="subtitulo">{subtitulo}</p>}
    </div>
  )
}
