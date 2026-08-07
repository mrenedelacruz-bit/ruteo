/**
 * Tarjeta resumen de un bien.
 *
 * Dos densidades:
 *  - `compacta` para el popup del mapa, donde el ancho útil son 230 px.
 *  - completa para la ficha que abre el escaneo NFC.
 */

import { Link } from 'react-router-dom'

import { formatearCoordenadas, formatearFecha, haceCuanto } from '../lib/estilos'
import type { BienMueble } from '../types'
import { BotonUbicacion } from './BotonUbicacion'
import { EstadoBadge } from './EstadoBadge'

interface Props {
  bien: BienMueble
  alActualizar: (bien: BienMueble) => void
  compacta?: boolean
}

export function TarjetaActivo({ bien, alActualizar, compacta = false }: Props) {
  if (compacta) {
    return (
      <div>
        <strong>{bien.nombre}</strong>
        <div className="ncf">{bien.ncf}</div>
        <div style={{ margin: '6px 0' }}>
          <EstadoBadge estado={bien.estado} />
        </div>
        <p className="tenue" style={{ margin: '0 0 8px' }}>
          {bien.ubicacion_descriptiva ?? bien.categoria}
          <br />
          Última lectura: {haceCuanto(bien.fecha_ultima_lectura)}
        </p>
        <BotonUbicacion bien={bien} alActualizar={alActualizar} compacto />
        <p style={{ margin: '8px 0 0', fontSize: '0.8rem' }}>
          <Link to={`/activo/${bien.ncf}`}>Ver ficha completa →</Link>
        </p>
      </div>
    )
  }

  return (
    <article className="tarjeta">
      <header className="tarjeta__titulo">
        <div>
          <h1>{bien.nombre}</h1>
          <div className="ncf">{bien.ncf}</div>
        </div>
        <EstadoBadge estado={bien.estado} />
      </header>

      {bien.foto_url && (
        <img
          src={bien.foto_url}
          alt={`Fotografía de ${bien.nombre}`}
          style={{ width: '100%', borderRadius: 10, margin: '0.75rem 0' }}
          loading="lazy"
        />
      )}

      {bien.descripcion && <p style={{ marginBottom: 0 }}>{bien.descripcion}</p>}

      <dl className="datos">
        <dt>Categoría</dt>
        <dd>{bien.categoria}</dd>

        <dt>Asignado a</dt>
        <dd>{bien.usuario_asignado ?? '—'}</dd>

        <dt>Ubicación</dt>
        <dd>{bien.ubicacion_descriptiva ?? '—'}</dd>

        <dt>Coordenadas</dt>
        <dd>
          {formatearCoordenadas(bien.latitud, bien.longitud)}
          {bien.precision_gps_m != null && (
            <span className="tenue"> (±{Math.round(bien.precision_gps_m)} m)</span>
          )}
        </dd>

        <dt>Última lectura</dt>
        <dd>
          {formatearFecha(bien.fecha_ultima_lectura)}{' '}
          <span className="tenue">({haceCuanto(bien.fecha_ultima_lectura)})</span>
        </dd>

        <dt>Alta</dt>
        <dd>{formatearFecha(bien.creado_en)}</dd>
      </dl>

      <div style={{ marginTop: '1rem' }}>
        <BotonUbicacion bien={bien} alActualizar={alActualizar} />
      </div>
    </article>
  )
}
