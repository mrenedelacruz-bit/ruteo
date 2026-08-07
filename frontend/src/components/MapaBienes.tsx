/**
 * Mapa interactivo de bienes muebles.
 *
 * Leaflet + OpenStreetMap en vez de Mapbox/Google: sin clave de API, sin cuota
 * mensual y sin coste, que para un inventario interno con unos cientos de pines
 * es todo lo que hace falta. Cambiar de proveedor sería sustituir el TileLayer.
 */

import L from 'leaflet'
import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

import { CENTRO_POR_DEFECTO, TILE_URL, ZOOM_POR_DEFECTO } from '../config'
import { COLOR_ESTADO } from '../lib/estilos'
import { ESTADOS, type BienMueble, type EstadoBien } from '../types'
import { TarjetaActivo } from './TarjetaActivo'

/**
 * Pin como `divIcon`: el color sale de una variable en línea, así que los
 * cuatro estados no requieren cuatro imágenes ni una petición extra.
 */
function iconoPin(estado: EstadoBien, resaltado: boolean): L.DivIcon {
  return L.divIcon({
    className: '', // sin esto Leaflet añade su fondo blanco por defecto
    html: `<div class="pin ${resaltado ? 'pin--parpadea' : ''}" style="background:${COLOR_ESTADO[estado]}"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26], // la punta del pin, no su centro
    popupAnchor: [0, -24],
  })
}

/**
 * Encuadra el mapa. Si hay un bien resaltado vuela hacia él; si no, ajusta el
 * zoom para que entren todos los pines. Debe ser un componente hijo porque
 * `useMap()` solo funciona dentro de `MapContainer`.
 */
function Encuadre({ bienes, resaltado }: { bienes: BienMueble[]; resaltado?: string }) {
  const mapa = useMap()

  useEffect(() => {
    const destacado = bienes.find((b) => b.ncf === resaltado)
    if (destacado?.latitud != null && destacado.longitud != null) {
      mapa.flyTo([destacado.latitud, destacado.longitud], 17, { duration: 0.8 })
      return
    }

    const puntos = bienes
      .filter((b) => b.latitud != null && b.longitud != null)
      .map((b) => [b.latitud!, b.longitud!] as [number, number])

    if (puntos.length > 1) {
      mapa.fitBounds(L.latLngBounds(puntos), { padding: [48, 48], maxZoom: 16 })
    } else if (puntos.length === 1) {
      mapa.setView(puntos[0], 16)
    }
  }, [mapa, bienes, resaltado])

  return null
}

interface Props {
  bienes: BienMueble[]
  /** NCF a centrar y hacer parpadear (p. ej. el recién escaneado). */
  resaltado?: string
  /** Refresca la lista cuando un popup cambia la ubicación de su bien. */
  alActualizarBien: (bien: BienMueble) => void
}

export function MapaBienes({ bienes, resaltado, alActualizarBien }: Props) {
  // Solo los geolocalizados llegan al mapa; los demás viven en el panel de
  // administración hasta que alguien los ubique.
  const conUbicacion = useMemo(
    () => bienes.filter((b) => b.latitud != null && b.longitud != null),
    [bienes],
  )

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <MapContainer
        className="mapa"
        center={CENTRO_POR_DEFECTO}
        zoom={ZOOM_POR_DEFECTO}
        zoomControl={false} // en móvil estorba; se navega con gestos
        scrollWheelZoom
      >
        {/* Sin TILE_URL no hay base cartográfica: los pines conservan su posición
            geográfica real, solo falta el relieve debajo. Ver config.ts. */}
        {TILE_URL && (
          <TileLayer
            url={TILE_URL}
            attribution='&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            maxZoom={19}
          />
        )}

        <Encuadre bienes={conUbicacion} resaltado={resaltado} />

        {conUbicacion.map((bien) => (
          <Marker
            key={bien.ncf}
            position={[bien.latitud!, bien.longitud!]}
            icon={iconoPin(bien.estado, bien.ncf === resaltado)}
          >
            <Popup>
              <TarjetaActivo bien={bien} alActualizar={alActualizarBien} compacta />
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {!TILE_URL && (
        <div className="leyenda" style={{ left: 10, right: 10, bottom: 'auto', top: 10 }}>
          <span>Sin base cartográfica — los pines están en su posición real</span>
        </div>
      )}

      <div className="leyenda" aria-label="Leyenda de estados">
        {ESTADOS.map((estado) => (
          <span key={estado}>
            <i style={{ background: COLOR_ESTADO[estado] }} />
            {estado}
          </span>
        ))}
      </div>
    </div>
  )
}
