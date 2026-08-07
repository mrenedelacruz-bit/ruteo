/**
 * Geolocalización del dispositivo.
 *
 * Notas de iOS que condicionan este módulo:
 *  - Safari solo entrega la posición en contextos seguros (HTTPS o localhost).
 *  - El permiso se pide en respuesta a un gesto del usuario; por eso nunca se
 *    llama al cargar, siempre desde un botón.
 *  - `enableHighAccuracy` enciende el GPS real en vez de triangular por Wi-Fi:
 *    tarda más y gasta batería, pero es lo que se necesita para ubicar un
 *    activo dentro de un edificio con precisión útil.
 */

export interface Posicion {
  latitud: number
  longitud: number
  /** Radio de incertidumbre en metros, tal como lo reporta el dispositivo. */
  precisionM: number | null
  momento: Date
}

export class GeoError extends Error {
  constructor(
    mensaje: string,
    readonly codigo: 'no-soportado' | 'permiso' | 'no-disponible' | 'timeout',
  ) {
    super(mensaje)
  }
}

/** Traduce el error opaco de la API del navegador a algo accionable en pantalla. */
function traducir(error: GeolocationPositionError): GeoError {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return new GeoError(
        'Permiso de ubicación denegado. En el iPhone: Ajustes › Safari › Ubicación, ' +
          'o el ícono «aA» de la barra de direcciones › Ajustes del sitio web.',
        'permiso',
      )
    case error.POSITION_UNAVAILABLE:
      return new GeoError(
        'No se pudo obtener la posición. Si está bajo techo, acérquese a una ventana.',
        'no-disponible',
      )
    default:
      return new GeoError(
        'La ubicación tardó demasiado. Verifique que el GPS esté activo e intente otra vez.',
        'timeout',
      )
  }
}

/** Pide una lectura GPS puntual. Rechaza con `GeoError`. */
export function obtenerPosicion(timeoutMs = 15_000): Promise<Posicion> {
  if (!('geolocation' in navigator)) {
    return Promise.reject(
      new GeoError('Este navegador no expone geolocalización.', 'no-soportado'),
    )
  }

  return new Promise((resolver, rechazar) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolver({
          latitud: pos.coords.latitude,
          longitud: pos.coords.longitude,
          precisionM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
          momento: new Date(pos.timestamp),
        }),
      (err) => rechazar(traducir(err)),
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        // 0 = nada de posiciones cacheadas: si el usuario pulsa "actualizar
        // ubicación", espera la lectura de dónde está parado ahora mismo.
        maximumAge: 0,
      },
    )
  })
}

/** Distancia en metros entre dos puntos (fórmula de Haversine). */
export function distanciaM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6_371_000
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
