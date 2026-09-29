import type { ReactNode } from 'react'
import { Marca } from './Marca'

type Props = { titulo: string; children?: ReactNode; cargando?: boolean }

/** Pantalla completa para "cargando", errores y usuarios sin acceso. */
export function PantallaEstado({ titulo, children, cargando }: Props) {
  return (
    <div className="app">
      <main className="app__contenido app__contenido--sin-barra" aria-busy={cargando}>
        <header className="encabezado">
          <Marca />
        </header>
        <h1>{titulo}</h1>
        {children && <section className="card formulario">{children}</section>}
      </main>
    </div>
  )
}
