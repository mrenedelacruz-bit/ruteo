/**
 * Configuración de ejecución del cliente.
 *
 * La decisión de diseño central: la PWA no depende del backend para funcionar.
 * Si `VITE_API_BASE` está definida habla con la API REST; si no, guarda todo en
 * el navegador (`localStorage`). Eso permite publicar una demo funcional en
 * GitHub Pages —que solo sirve archivos estáticos— y pasar a producción
 * cambiando una variable de entorno, sin tocar componentes.
 */

/** URL base de la API, sin barra final. Vacía = modo local. */
export const API_BASE: string = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

/** true cuando no hay backend configurado y se usa almacenamiento del navegador. */
export const MODO_LOCAL: boolean = API_BASE === ''

/** Prefijo de rutas de la app (`/ruteo/` en GitHub Pages, `/` en dominio propio). */
export const BASE_URL: string = import.meta.env.BASE_URL

/**
 * Origen público desde donde se sirve la PWA. Es la raíz de las URLs que se
 * graban en las etiquetas: `${URL_PUBLICA}/activo/{ncf}`.
 *
 * Se calcula del navegador para que la URL generada sea correcta también en
 * `localhost` o en un túnel de pruebas, sin recompilar.
 */
export const URL_PUBLICA: string =
  import.meta.env.VITE_PUBLIC_BASE_URL ??
  (typeof window !== 'undefined'
    ? `${window.location.origin}${BASE_URL}`.replace(/\/$/, '')
    : '')

/** Nombre que queda en la bitácora de auditoría. Editable desde la app. */
const CLAVE_USUARIO = 'bienes-nfc:usuario'

export function usuarioActual(): string {
  return localStorage.getItem(CLAVE_USUARIO) ?? 'inspector'
}

export function fijarUsuario(nombre: string): void {
  localStorage.setItem(CLAVE_USUARIO, nombre.trim() || 'inspector')
}

/** Centro por defecto del mapa: Distrito Nacional, Santo Domingo. */
export const CENTRO_POR_DEFECTO: [number, number] = [18.4721, -69.9312]
export const ZOOM_POR_DEFECTO = 13
