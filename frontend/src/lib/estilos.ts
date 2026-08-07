/**
 * Mapa de color por estado del bien.
 *
 * Un único origen de verdad para pines del mapa, badges y leyenda: si un color
 * cambia aquí, cambia en las tres partes a la vez.
 */

import type { EstadoBien } from '../types'

export const COLOR_ESTADO: Record<EstadoBien, string> = {
  Bueno: '#22c55e',
  Regular: '#f59e0b',
  'En Reparación': '#3b82f6',
  Baja: '#ef4444',
}

/** Fecha ISO → texto corto legible en español dominicano. */
export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return '—'
  return fecha.toLocaleString('es-DO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** "hace 3 días" — más útil que una fecha para juzgar si un activo está al día. */
export function haceCuanto(iso: string | null | undefined): string {
  if (!iso) return 'nunca'
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return 'nunca'

  const minutos = Math.floor(ms / 60_000)
  if (minutos < 1) return 'hace instantes'
  if (minutos < 60) return `hace ${minutos} min`

  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`

  const dias = Math.floor(horas / 24)
  if (dias < 30) return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`

  const meses = Math.floor(dias / 30)
  return `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`
}

/** Coordenadas con 5 decimales ≈ 1 m de resolución: más dígitos son ruido. */
export function formatearCoordenadas(lat: number | null, lon: number | null): string {
  if (lat === null || lon === null) return 'Sin ubicación registrada'
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
}
