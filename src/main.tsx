import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './styles/tokens.css'
import './styles/global.css'
import './styles/app.css'
import { App } from './App'
import { SesionProvider } from './sesion/SesionProvider'

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Falta el elemento #root en index.html')

createRoot(raiz).render(
  <StrictMode>
    <SesionProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SesionProvider>
  </StrictMode>,
)
