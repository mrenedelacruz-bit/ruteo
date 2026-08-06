import type { Solicitud } from './types'

const KEY = 'ruteo-aprobacion-clientes-v1'

export function cargarSolicitudes(): Solicitud[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Solicitud[]) : []
  } catch {
    return []
  }
}

export function guardarSolicitudes(solicitudes: Solicitud[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(solicitudes))
  } catch {
    // sin espacio o modo privado: la app sigue funcionando en memoria
  }
}
