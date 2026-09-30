import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { reactErrorHandler } from '@sentry/react'
import './styles/tokens.css'
import './styles/global.css'
import './styles/app.css'
import { PantallaEstado } from './components/PantallaEstado'
import { revisarConfig } from './lib/config'
import { iniciarActualizaciones } from './lib/actualizacion'
import { iniciarReportes, reportar } from './lib/errores'

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Falta el elemento #root en index.html')

// Con callback, Sentry reporta y además el error sigue apareciendo en la consola.
const aConsola = (error: unknown) => console.error(error)
const root = createRoot(raiz, {
  onUncaughtError: reactErrorHandler(aConsola),
  onRecoverableError: reactErrorHandler(aConsola),
})
const config = revisarConfig(import.meta.env)

if (!config.ok) {
  console.error('Configuración incompleta', config.faltantes)
  root.render(
    <PantallaEstado titulo="Falta configurar la app">
      <p className="formulario__ayuda">
        La app no puede conectarse porque le faltan datos de configuración. Si sos quien la instala,
        completá <strong>.env.local</strong> (en local) o las variables de entorno de Netlify.
      </p>
      <p className="aviso aviso--error" role="alert">
        {config.faltantes.join(' · ')}
      </p>
    </PantallaEstado>,
  )
} else {
  iniciarReportes(config.config.VITE_SENTRY_DSN)
  iniciarActualizaciones()
  // La app se importa recién ahora: al cargarse, arma el cliente de Supabase con esta configuración.
  import('./Raiz')
    .then(({ Raiz }) =>
      root.render(
        <StrictMode>
          <Raiz />
        </StrictMode>,
      ),
    )
    .catch((error: unknown) => {
      reportar(error, 'No se pudo cargar la app')
      root.render(
        <PantallaEstado titulo="No se pudo abrir la app">
          <p className="formulario__ayuda">Revisá la conexión y recargá.</p>
          <button className="boton boton--primario" onClick={() => window.location.reload()}>
            Recargar
          </button>
        </PantallaEstado>,
      )
    })
}
