/**
 * Pantalla principal: mapa con todos los bienes geolocalizados.
 *
 * El filtro por estado vive en la URL (`?estado=Baja`) para que un supervisor
 * pueda compartir por WhatsApp el enlace a "los activos en reparación" y el
 * receptor vea exactamente lo mismo.
 */

import { useSearchParams } from 'react-router-dom'

import { MapaBienes } from '../components/MapaBienes'
import { useBienes } from '../hooks/useBienes'
import { COLOR_ESTADO } from '../lib/estilos'
import { ESTADOS, type BienMueble, type EstadoBien } from '../types'

export function MapaPage() {
  const [params, setParams] = useSearchParams()
  const estadoFiltro = params.get('estado') as EstadoBien | null
  const resaltado = params.get('resaltado') ?? undefined

  const { datos: bienes, cargando, error, setBienes } = useBienes({
    estado: estadoFiltro ?? undefined,
    soloGeolocalizados: true,
  })

  /** Reemplaza el bien editado desde un popup sin recargar la lista completa. */
  function alActualizarBien(actualizado: BienMueble) {
    setBienes(bienes.map((b) => (b.ncf === actualizado.ncf ? actualizado : b)))
  }

  function alternarFiltro(estado: EstadoBien) {
    const siguiente = new URLSearchParams(params)
    if (estadoFiltro === estado) siguiente.delete('estado')
    else siguiente.set('estado', estado)
    siguiente.delete('resaltado') // el resaltado pertenece a la navegación anterior
    setParams(siguiente, { replace: true })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '8px 10px',
          paddingTop: 'calc(8px + env(safe-area-inset-top, 0px))',
          overflowX: 'auto',
          borderBottom: '1px solid var(--borde)',
          background: 'var(--superficie)',
        }}
      >
        {ESTADOS.map((estado) => {
          const activo = estadoFiltro === estado
          return (
            <button
              key={estado}
              onClick={() => alternarFiltro(estado)}
              aria-pressed={activo}
              style={{
                padding: '5px 12px',
                minHeight: 34,
                fontSize: '0.78rem',
                whiteSpace: 'nowrap',
                color: activo ? '#0b1120' : COLOR_ESTADO[estado],
                background: activo ? COLOR_ESTADO[estado] : 'transparent',
                borderColor: COLOR_ESTADO[estado],
              }}
            >
              {estado}
            </button>
          )
        })}
      </div>

      {error && <p className="aviso aviso--error" style={{ margin: '0.5rem' }}>{error}</p>}

      {/* `.contenido` ya reserva el alto de la barra inferior; aquí solo hay que
          dejar que el mapa ocupe todo lo que sobra. */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {cargando ? (
          <div className="cargando">Cargando bienes…</div>
        ) : (
          <MapaBienes bienes={bienes} resaltado={resaltado} alActualizarBien={alActualizarBien} />
        )}
      </div>
    </div>
  )
}
