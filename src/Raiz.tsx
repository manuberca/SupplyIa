import { ErrorBoundary } from '@sentry/react'
import { BrowserRouter } from 'react-router'
import { App } from './App'
import { PantallaEstado } from './components/PantallaEstado'
import { SesionProvider } from './sesion/SesionProvider'

/** La app con sesión y rutas. Se carga recién cuando la configuración está completa. */
export function Raiz() {
  return (
    <ErrorBoundary fallback={<AlgoFallo />}>
      <SesionProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </SesionProvider>
    </ErrorBoundary>
  )
}

function AlgoFallo() {
  return (
    <PantallaEstado titulo="Algo falló">
      <p className="formulario__ayuda">
        Recargá la app. Si vuelve a pasar, avisale a quien administra tu bar.
      </p>
      <button className="boton boton--primario" onClick={() => window.location.reload()}>
        Recargar
      </button>
    </PantallaEstado>
  )
}
