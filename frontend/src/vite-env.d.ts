/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base de la API REST. Si se omite, la app corre en modo local. */
  readonly VITE_API_BASE?: string
  /** Origen público de la PWA; solo hace falta si difiere del origen del navegador. */
  readonly VITE_PUBLIC_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
