import { Link, Outlet } from 'react-router'
import { Package, Settings } from 'lucide-react'
import { BarraInferior } from './BarraInferior'

export function Estructura() {
  // El nombre del local sale de la sesión cuando esté el login.
  const nombreLocal = 'Bar Demo'

  return (
    <div className="app">
      <main className="app__contenido">
        <header className="encabezado">
          <Link to="/" className="marca" aria-label="SupplyIA, ir al inicio">
            <span className="marca__logo">
              <Package size={18} strokeWidth={2} aria-hidden="true" />
            </span>
            <span>
              Supply<span className="marca__ia">IA</span>
            </span>
          </Link>
          <Link to="/ajustes" className="local" aria-label={`${nombreLocal}, abrir ajustes`}>
            {nombreLocal}
            <Settings size={15} strokeWidth={2} aria-hidden="true" />
          </Link>
        </header>
        <Outlet />
      </main>
      <BarraInferior />
    </div>
  )
}
