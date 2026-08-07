/** Píldora de color con el estado del bien. */

import { COLOR_ESTADO } from '../lib/estilos'
import type { EstadoBien } from '../types'

export function EstadoBadge({ estado }: { estado: EstadoBien }) {
  return (
    <span className="badge" style={{ color: COLOR_ESTADO[estado] }}>
      <i className="badge__punto" aria-hidden="true" />
      {estado}
    </span>
  )
}
