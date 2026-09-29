import { Link, Outlet } from 'react-router'
import { Settings } from 'lucide-react'
import { BarraInferior } from './BarraInferior'
import { Marca } from './Marca'
import { useSesionLista } from '../sesion/contexto'

export function Estructura() {
  const { local, org } = useSesionLista()
  const nombre = local?.nombre ?? org.nombre

  return (
    <div className="app">
      <main className="app__contenido">
        <header className="encabezado">
          <Marca />
          <Link to="/ajustes" className="local" aria-label={`${nombre}, abrir ajustes`}>
            <span className="local__nombre">{nombre}</span>
            <Settings size={15} strokeWidth={2} aria-hidden="true" />
          </Link>
        </header>
        <Outlet />
      </main>
      <BarraInferior />
    </div>
  )
}
