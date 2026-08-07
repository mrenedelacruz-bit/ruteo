/**
 * Registro del service worker.
 *
 * Solo se registra en producción: en desarrollo, un SW cacheando módulos pelea
 * con el hot reload de Vite y produce depuraciones desconcertantes.
 */

import { BASE_URL, SW_ACTIVO } from '../config'

export function registrarServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  if (import.meta.env.DEV) return
  // Compilaciones de un solo archivo (demo, copia local) no publican sw.js.
  if (!SW_ACTIVO) return

  window.addEventListener('load', () => {
    navigator.serviceWorker
      // El scope se deriva de la ruta del archivo: al servirlo desde BASE_URL,
      // cubre toda la app, incluidas las rutas /activo/… del escaneo NFC.
      .register(`${BASE_URL}sw.js`, { scope: BASE_URL })
      .catch((error) => {
        // Que falle el SW no debe impedir usar la app; solo se pierde el offline.
        console.warn('No se pudo registrar el service worker:', error)
      })
  })
}
