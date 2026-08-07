/**
 * Botón «Actualizar ubicación con mi posición GPS actual».
 *
 * Encapsula el ciclo completo —pedir GPS, escribir en el repositorio, informar
 * el resultado— porque aparece en dos sitios (popup del mapa y ficha del
 * activo) y en ambos debe comportarse igual.
 */

import { useState } from 'react'

import { usuarioActual } from '../config'
import { GeoError, obtenerPosicion } from '../lib/geo'
import { repo } from '../lib/repo'
import type { BienMueble } from '../types'

interface Props {
  bien: BienMueble
  /** Se invoca con el bien ya actualizado, para refrescar la vista que lo contiene. */
  alActualizar: (bien: BienMueble) => void
  compacto?: boolean
}

export function BotonUbicacion({ bien, alActualizar, compacto = false }: Props) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function actualizar() {
    setOcupado(true)
    setError(null)
    setOk(null)
    try {
      const posicion = await obtenerPosicion()
      const actualizado = await repo.actualizarUbicacion(bien.ncf, {
        latitud: posicion.latitud,
        longitud: posicion.longitud,
        precisionM: posicion.precisionM,
        usuario: usuarioActual(),
      })
      alActualizar(actualizado)
      setOk(
        posicion.precisionM
          ? `Ubicación actualizada (±${Math.round(posicion.precisionM)} m).`
          : 'Ubicación actualizada.',
      )
    } catch (e) {
      // GeoError ya trae un mensaje accionable; el resto se muestra tal cual.
      setError(e instanceof GeoError || e instanceof Error ? e.message : 'No se pudo actualizar.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <button
        className="boton--primario"
        onClick={actualizar}
        disabled={ocupado}
        style={compacto ? { padding: '9px 12px', fontSize: '0.82rem' } : undefined}
      >
        {ocupado ? 'Obteniendo GPS…' : '📍 Actualizar ubicación con mi posición'}
      </button>
      {error && (
        <p className="aviso aviso--error" style={{ marginTop: '0.5rem' }} role="alert">
          {error}
        </p>
      )}
      {ok && (
        <p className="aviso aviso--ok" style={{ marginTop: '0.5rem' }} role="status">
          {ok}
        </p>
      )}
    </>
  )
}
