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
 * Modo de enrutado.
 *
 * `browser` (por defecto) da URLs limpias `/activo/NCF-…`, que es lo que
 * conviene grabar en una etiqueta. Exige que el servidor devuelva el index.html
 * en cualquier ruta.
 *
 * `hash` produce `/#/activo/NCF-…`. Es más largo —cuesta 2 bytes en la
 * etiqueta— pero funciona en cualquier hosting estático que no admita ese
 * reenvío: un bucket S3 sin configurar, un recurso compartido interno o una
 * copia del `dist/` abierta desde el disco.
 */
export const MODO_HASH: boolean = import.meta.env.VITE_ROUTER === 'hash'

/**
 * URL de las teselas del mapa. Vacía = sin base cartográfica: los pines siguen
 * en su posición geográfica correcta, pero sin relieve debajo.
 *
 * Se deja configurable para redes cerradas, servidores de teselas propios o
 * despliegues sin salida a internet.
 */
export const TILE_URL: string =
  import.meta.env.VITE_TILE_URL ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

/** Permite desactivar el service worker donde su caché estorbe. */
export const SW_ACTIVO: boolean = import.meta.env.VITE_SW !== 'off'

/**
 * Origen público desde donde se sirve la PWA. Es la raíz de las URLs que se
 * graban en las etiquetas: `${URL_PUBLICA}/activo/{ncf}`.
 *
 * Se calcula del navegador para que la URL generada sea correcta también en
 * `localhost` o en un túnel de pruebas, sin recompilar. En modo hash incluye el
 * `#`, de modo que la URL mostrada sea exactamente la que hay que grabar.
 */
export const URL_PUBLICA: string = (() => {
  if (import.meta.env.VITE_PUBLIC_BASE_URL) {
    return MODO_HASH
      ? `${import.meta.env.VITE_PUBLIC_BASE_URL.replace(/\/$/, '')}/#`
      : import.meta.env.VITE_PUBLIC_BASE_URL.replace(/\/$/, '')
  }
  if (typeof window === 'undefined') return ''

  // BASE_URL puede ser absoluta ('/ruteo/') o relativa ('./', al compilar un
  // archivo suelto). Concatenar una relativa al origen daría 'https://host./';
  // en ese caso la carpeta correcta es la del documento actual.
  const ruta = BASE_URL.startsWith('/')
    ? BASE_URL
    : window.location.pathname.replace(/[^/]*$/, '')
  const raiz = `${window.location.origin}${ruta}`.replace(/\/$/, '')

  return MODO_HASH ? `${raiz}/#` : raiz
})()

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
