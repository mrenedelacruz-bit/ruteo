import { useEffect, useState } from 'react'
import { ROLES, ROLE_LABELS } from './config'
import { cargarSolicitudes, guardarSolicitudes } from './storage'
import type { Role, Solicitud } from './types'
import { Dashboard } from './components/Dashboard.tsx'
import { NuevaSolicitud } from './components/NuevaSolicitud.tsx'
import { DetalleSolicitud } from './components/DetalleSolicitud.tsx'

type Vista = { tipo: 'lista' } | { tipo: 'nueva' } | { tipo: 'detalle'; id: string }

export default function App() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>(cargarSolicitudes)
  const [role, setRole] = useState<Role>('VENDEDOR')
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' })

  useEffect(() => {
    guardarSolicitudes(solicitudes)
  }, [solicitudes])

  const actualizar = (s: Solicitud) => {
    setSolicitudes((prev) => prev.map((x) => (x.id === s.id ? s : x)))
  }

  const agregar = (s: Solicitud) => {
    setSolicitudes((prev) => [s, ...prev])
    setVista({ tipo: 'detalle', id: s.id })
  }

  const activa =
    vista.tipo === 'detalle' ? solicitudes.find((s) => s.id === vista.id) : undefined

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Aprobación de Clientes</h1>
          <p className="subtitle">Distribuidora de lubricantes · flujo solicitud → visita → precio → crédito</p>
        </div>
        <label className="role-switcher">
          Actuando como
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
      </header>

      {vista.tipo === 'lista' && (
        <Dashboard
          solicitudes={solicitudes}
          role={role}
          onAbrir={(id) => setVista({ tipo: 'detalle', id })}
          onNueva={() => setVista({ tipo: 'nueva' })}
        />
      )}

      {vista.tipo === 'nueva' && (
        <NuevaSolicitud onCrear={agregar} onCancelar={() => setVista({ tipo: 'lista' })} />
      )}

      {vista.tipo === 'detalle' && activa && (
        <DetalleSolicitud
          solicitud={activa}
          role={role}
          onActualizar={actualizar}
          onVolver={() => setVista({ tipo: 'lista' })}
        />
      )}
    </div>
  )
}
