import { useState } from 'react'
import { TIPOS_NEGOCIO } from '../config'
import { crearSolicitud } from '../workflow'
import type { Cliente, Solicitud } from '../types'

export function NuevaSolicitud({
  onCrear,
  onCancelar,
}: {
  onCrear: (s: Solicitud) => void
  onCancelar: () => void
}) {
  const [cliente, setCliente] = useState<Cliente>({
    nombre: '',
    rnc: '',
    contacto: '',
    telefono: '',
    tipoNegocio: TIPOS_NEGOCIO[0],
    direccion: '',
  })

  const set = (campo: keyof Cliente, valor: string) =>
    setCliente((c) => ({ ...c, [campo]: valor }))

  const valido = cliente.nombre.trim() && cliente.direccion.trim()

  return (
    <main className="panel">
      <h2>Nueva solicitud de cliente</h2>
      <p className="hint">
        La llena el vendedor con los datos del negocio. Después registrará la visita al lugar con
        geolocalización para que el supervisor la valide y asigne la ruta.
      </p>
      <div className="form-grid">
        <label>
          Nombre del negocio *
          <input value={cliente.nombre} onChange={(e) => set('nombre', e.target.value)} />
        </label>
        <label>
          RNC / Cédula
          <input value={cliente.rnc} onChange={(e) => set('rnc', e.target.value)} />
        </label>
        <label>
          Persona de contacto
          <input value={cliente.contacto} onChange={(e) => set('contacto', e.target.value)} />
        </label>
        <label>
          Teléfono
          <input value={cliente.telefono} onChange={(e) => set('telefono', e.target.value)} />
        </label>
        <label>
          Tipo de negocio
          <select value={cliente.tipoNegocio} onChange={(e) => set('tipoNegocio', e.target.value)}>
            {TIPOS_NEGOCIO.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="wide">
          Dirección *
          <input value={cliente.direccion} onChange={(e) => set('direccion', e.target.value)} />
        </label>
      </div>
      <div className="actions">
        <button onClick={onCancelar}>Cancelar</button>
        <button className="primary" disabled={!valido} onClick={() => onCrear(crearSolicitud(cliente))}>
          Crear solicitud
        </button>
      </div>
    </main>
  )
}
