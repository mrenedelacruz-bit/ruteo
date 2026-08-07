/** Arranque de la PWA. */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { registrarServiceWorker } from './lib/registrarSW'
import './index.css'

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Falta el elemento #root en index.html')

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Se registra después del primer render: la instalación del service worker
// compite por ancho de banda con los recursos que el usuario está esperando.
registrarServiceWorker()
