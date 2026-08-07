/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base de la API REST. Si se omite, la app corre en modo local. */
  readonly VITE_API_BASE?: string
  /** Origen público de la PWA; solo hace falta si difiere del origen del navegador. */
  readonly VITE_PUBLIC_BASE_URL?: string
  /** `hash` para hostings estáticos sin reenvío al index.html. Por defecto, `browser`. */
  readonly VITE_ROUTER?: 'browser' | 'hash'
  /** Plantilla de teselas del mapa. Cadena vacía = sin base cartográfica. */
  readonly VITE_TILE_URL?: string
  /** `off` desactiva el registro del service worker. */
  readonly VITE_SW?: 'on' | 'off'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
