import { Link, Outlet, useLocation } from 'react-router'
import { Settings } from 'lucide-react'
import { BarraInferior } from './BarraInferior'
import { Marca } from './Marca'
import { useSesion, useSesionLista } from '../sesion/contexto'
import { EstadoConexion } from '../offline/EstadoConexion'

export function Estructura() {
  const { local, org } = useSesionLista()
  const { claveProvisoria } = useSesion()
  const enAjustes = useLocation().pathname === '/ajustes'
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
        <EstadoConexion />
        {claveProvisoria && !enAjustes && (
          <Link to="/ajustes" className="aviso aviso--atencion aviso--enlace">
            Estás con una contraseña provisoria. Tocá acá para cambiarla.
          </Link>
        )}
        <Outlet />
      </main>
      <BarraInferior />
    </div>
  )
}
