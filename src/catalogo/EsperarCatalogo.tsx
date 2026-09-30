import { useState, type ReactNode } from 'react'
import { useCatalogo } from './contexto'
import type { Catalogo } from './tipos'

/** Muestra "cargando" o el error con salida hasta que el catálogo está listo. */
export function EsperarCatalogo({ children }: { children: (catalogo: Catalogo) => ReactNode }) {
  const { catalogo, recargar } = useCatalogo()
  const [reintentando, setReintentando] = useState(false)

  if (catalogo.estado === 'cargando') {
    return (
      <p className="texto-gris" aria-busy="true">
        Cargando proveedores y productos…
      </p>
    )
  }
  if (catalogo.estado === 'error') {
    return (
      <section className="card formulario">
        <p className="aviso aviso--error" role="alert">
          {catalogo.mensaje}
        </p>
        <button
          className="boton boton--primario"
          disabled={reintentando}
          onClick={async () => {
            setReintentando(true)
            await recargar()
            setReintentando(false)
          }}
        >
          {reintentando ? 'Probando…' : 'Probar de nuevo'}
        </button>
      </section>
    )
  }
  return children(catalogo.catalogo)
}
