import { ROLE_LABELS } from '../config'
import { pendienteDe } from '../workflow'
import type { Etapa, Role, Solicitud } from '../types'
import { EtapaBadge } from './EtapaBadge.tsx'

const ORDEN_ETAPAS: Etapa[] = [
  'SOLICITUD',
  'VISITA_EN_REVISION',
  'CONDICIONES',
  'PRECIO_EN_REVISION',
  'CREDITO_EN_COMITE',
  'APROBADO',
  'RECHAZADO',
]

export function Dashboard({
  solicitudes,
  role,
  onAbrir,
  onNueva,
}: {
  solicitudes: Solicitud[]
  role: Role
  onAbrir: (id: string) => void
  onNueva: () => void
}) {
  const pendientesMias = solicitudes.filter((s) => pendienteDe(s).includes(role))

  return (
    <main>
      <div className="toolbar">
        <div className="counters">
          {ORDEN_ETAPAS.map((e) => {
            const n = solicitudes.filter((s) => s.etapa === e).length
            return n > 0 ? (
              <span key={e} className="counter">
                <EtapaBadge etapa={e} /> {n}
              </span>
            ) : null
          })}
        </div>
        <button className="primary" onClick={onNueva}>
          + Nueva solicitud
        </button>
      </div>

      {pendientesMias.length > 0 && (
        <p className="hint">
          Tienes <strong>{pendientesMias.length}</strong> solicitud(es) esperando tu acción como{' '}
          {ROLE_LABELS[role]} (marcadas con ●).
        </p>
      )}

      {solicitudes.length === 0 ? (
        <p className="empty">
          No hay solicitudes todavía. Cambia el rol a «Vendedor / Asesor de ruta» y crea la primera.
        </p>
      ) : (
        <table className="lista">
          <thead>
            <tr>
              <th></th>
              <th>ID</th>
              <th>Cliente</th>
              <th>Tipo de negocio</th>
              <th>Ruta</th>
              <th>Etapa</th>
              <th>Esperando a</th>
            </tr>
          </thead>
          <tbody>
            {solicitudes.map((s) => {
              const esperando = pendienteDe(s)
              return (
                <tr key={s.id} onClick={() => onAbrir(s.id)}>
                  <td>{esperando.includes(role) ? <span className="dot">●</span> : ''}</td>
                  <td className="mono">{s.id}</td>
                  <td>{s.cliente.nombre}</td>
                  <td>{s.cliente.tipoNegocio}</td>
                  <td>{s.ruta ?? '—'}</td>
                  <td>
                    <EtapaBadge etapa={s.etapa} />
                  </td>
                  <td>{esperando.map((r) => ROLE_LABELS[r]).join(', ') || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </main>
  )
}
