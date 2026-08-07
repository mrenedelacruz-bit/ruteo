/**
 * Service worker de la PWA.
 *
 * Se escribe a mano en vez de usar vite-plugin-pwa/Workbox porque la política de
 * caché aquí es corta y muy específica del caso de uso, y conviene que sea
 * legible sin conocer la configuración de Workbox.
 *
 * Estrategias:
 *   - Navegaciones  → red primero, con el shell cacheado como respaldo.
 *     Esto es lo que hace que /activo/NCF-... siga abriendo la ficha aunque el
 *     inventario esté en un sótano sin señal.
 *   - Estáticos del mismo origen → caché primero (llevan hash en el nombre).
 *   - GET a la API   → red primero con respaldo a la última respuesta guardada,
 *     para que el técnico vea al menos la ficha de la lectura anterior.
 *   - POST/PUT/PATCH → nunca se cachean; los maneja el "outbox" de la app.
 *
 * Al cambiar VERSION se invalidan todos los cachés anteriores.
 */

const VERSION = 'v1'
const CACHE_SHELL = `bienes-nfc-shell-${VERSION}`
const CACHE_DATOS = `bienes-nfc-datos-${VERSION}`

// La SW se sirve desde la raíz del sitio, así que su scope es la base pública.
const BASE = new URL(self.registration.scope).pathname
const SHELL = `${BASE}index.html`

// Mínimo indispensable para arrancar sin red. Los bundles con hash entran solos
// al caché en la primera visita.
const PRECACHE = [BASE, SHELL, `${BASE}manifest.webmanifest`, `${BASE}icons/icon-192.png`]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_SHELL)
      // `reload` evita precachear una copia rancia que el navegador ya tuviera.
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()), // una URL faltante no debe abortar la instalación
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(
          claves
            .filter((c) => c.startsWith('bienes-nfc-') && !c.endsWith(VERSION))
            .map((c) => caches.delete(c)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

/** Red primero; si falla, lo último que haya en `nombreCache`. */
async function redPrimero(request, nombreCache, respaldo) {
  const cache = await caches.open(nombreCache)
  try {
    const respuesta = await fetch(request)
    if (respuesta.ok && request.method === 'GET') cache.put(request, respuesta.clone())
    return respuesta
  } catch (error) {
    const guardada = await cache.match(request)
    if (guardada) return guardada
    if (respaldo) {
      const shell = await caches.match(respaldo, { ignoreSearch: true })
      if (shell) return shell
    }
    throw error
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Solo GET pasa por caché. Las altas y auditorías deben llegar al servidor o
  // fallar de forma visible para que la app las guarde en su outbox.
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // 1. Navegaciones (incluye el enlace profundo del escaneo NFC).
  if (request.mode === 'navigate') {
    event.respondWith(redPrimero(request, CACHE_SHELL, SHELL))
    return
  }

  // 2. Llamadas a la API, estén donde estén alojadas.
  if (url.pathname.includes('/api/')) {
    event.respondWith(redPrimero(request, CACHE_DATOS))
    return
  }

  // 3. Estáticos propios: caché primero.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(
        (guardada) =>
          guardada ??
          fetch(request).then((respuesta) => {
            if (respuesta.ok) {
              const copia = respuesta.clone()
              caches.open(CACHE_SHELL).then((cache) => cache.put(request, copia))
            }
            return respuesta
          }),
      ),
    )
  }

  // 4. Terceros (tiles de OpenStreetMap): se dejan al caché HTTP del navegador.
  // Cachearlos aquí crecería sin control y su licencia desaconseja el volcado masivo.
})
