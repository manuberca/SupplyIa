import { useFalloActualizacion } from '../lib/actualizacion'

/** Arriba de todo, si la app no pudo bajar la versión nueva. */
export function AvisoActualizacion() {
  const fallo = useFalloActualizacion()
  if (!fallo) return null
  return (
    <div className="aviso aviso--atencion aviso-actualizacion" role="alert">
      <span>
        No pudimos bajar la versión nueva de la app ({fallo}). Recargá; si sigue, avisale a quien
        administra tu bar.
      </span>
      <button
        className="boton boton--secundario boton--chico"
        onClick={() => window.location.reload()}
      >
        Recargar
      </button>
    </div>
  )
}
