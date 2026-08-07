/**
 * Panel de administración: alta de bienes y listado general.
 *
 * El NCF no se pide en el formulario: lo asigna el sistema al guardar. Dejar
 * que un operador teclee el correlativo es la vía más rápida a códigos
 * duplicados, y el código es la llave que relaciona la etiqueta física con la
 * base de datos.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { EstadoBadge } from '../components/EstadoBadge'
import { usuarioActual } from '../config'
import { mensajeError, useBienes } from '../hooks/useBienes'
import { haceCuanto } from '../lib/estilos'
import { obtenerPosicion } from '../lib/geo'
import { repo } from '../lib/repo'
import { CATEGORIAS, ESTADOS, type CategoriaBien, type EstadoBien } from '../types'

const FORMULARIO_VACIO = {
  nombre: '',
  descripcion: '',
  categoria: 'Mobiliario' as CategoriaBien,
  estado: 'Bueno' as EstadoBien,
  usuario_asignado: '',
  ubicacion_descriptiva: '',
  foto_url: '',
}

export function AdminPage() {
  const { datos: bienes, cargando, error, recargar } = useBienes()
  const [form, setForm] = useState(FORMULARIO_VACIO)
  const [coords, setCoords] = useState<{ lat: number; lon: number; prec: number | null } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [busqueda, setBusqueda] = useState('')

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return bienes
    return bienes.filter((b) =>
      [b.ncf, b.nombre, b.usuario_asignado, b.ubicacion_descriptiva, b.categoria]
        .filter(Boolean)
        .some((campo) => String(campo).toLowerCase().includes(q)),
    )
  }, [bienes, busqueda])

  const resumen = useMemo(() => {
    const porEstado = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<EstadoBien, number>
    for (const b of bienes) porEstado[b.estado]++
    return { total: bienes.length, porEstado, sinUbicar: bienes.filter((b) => b.latitud === null).length }
  }, [bienes])

  function cambiar<K extends keyof typeof FORMULARIO_VACIO>(campo: K, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  /** Captura la posición actual para el alta. Opcional: se puede ubicar después. */
  async function capturarPosicion() {
    setAviso(null)
    try {
      const p = await obtenerPosicion()
      setCoords({ lat: p.latitud, lon: p.longitud, prec: p.precisionM })
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeError(e) })
    }
  }

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault()
    setGuardando(true)
    setAviso(null)
    try {
      const creado = await repo.crear({
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        categoria: form.categoria,
        estado: form.estado,
        usuario_asignado: form.usuario_asignado.trim() || usuarioActual(),
        ubicacion_descriptiva: form.ubicacion_descriptiva.trim() || null,
        foto_url: form.foto_url.trim() || null,
        latitud: coords?.lat ?? null,
        longitud: coords?.lon ?? null,
        precision_gps_m: coords?.prec ?? null,
      })
      setForm(FORMULARIO_VACIO)
      setCoords(null)
      await recargar()
      setAviso({
        tipo: 'ok',
        texto: `Alta registrada con el código ${creado.ncf}. Ya puede grabar su etiqueta desde la pestaña Etiquetas.`,
      })
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeError(e) })
    } finally {
      setGuardando(false)
    }
  }

  async function cambiarEstado(ncf: string, estado: EstadoBien) {
    try {
      await repo.actualizar(ncf, { estado })
      await recargar()
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeError(e) })
    }
  }

  async function eliminar(ncf: string, nombre: string) {
    if (!window.confirm(`¿Eliminar "${nombre}" (${ncf}) del inventario?\n\nPara dar de baja el activo conservando su historial, cambie el estado a "Baja" en su lugar.`)) {
      return
    }
    try {
      await repo.eliminar(ncf)
      await recargar()
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeError(e) })
    }
  }

  return (
    <div className="panel">
      <h1>Inventario</h1>

      <section className="tarjeta">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{resumen.total}</div>
            <div className="tenue">bienes registrados</div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {ESTADOS.map((e) => (
              <div key={e} style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700 }}>{resumen.porEstado[e]}</div>
                <EstadoBadge estado={e} />
              </div>
            ))}
          </div>
        </div>
        {resumen.sinUbicar > 0 && (
          <p className="tenue" style={{ margin: '0.75rem 0 0' }}>
            {resumen.sinUbicar} sin coordenadas — no aparecen en el mapa hasta que se les asigne
            una posición.
          </p>
        )}
      </section>

      {/* ------------------------------ Alta ------------------------------ */}
      <form className="tarjeta" onSubmit={guardar}>
        <h2>Registrar un bien nuevo</h2>
        <p className="tenue" style={{ marginTop: 0 }}>
          El código NCF se genera automáticamente al guardar.
        </p>

        <label>
          Nombre del activo *
          <input
            required
            minLength={2}
            value={form.nombre}
            onChange={(e) => cambiar('nombre', e.target.value)}
            placeholder="Ej.: Escritorio ejecutivo en L"
          />
        </label>

        <label>
          Descripción
          <textarea
            value={form.descripcion}
            onChange={(e) => cambiar('descripcion', e.target.value)}
            placeholder="Marca, modelo, número de serie, observaciones…"
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <label>
            Categoría
            <select value={form.categoria} onChange={(e) => cambiar('categoria', e.target.value)}>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Estado
            <select value={form.estado} onChange={(e) => cambiar('estado', e.target.value)}>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Usuario o área asignada
          <input
            value={form.usuario_asignado}
            onChange={(e) => cambiar('usuario_asignado', e.target.value)}
            placeholder="Ej.: Contabilidad"
          />
        </label>

        <label>
          Ubicación descriptiva
          <input
            value={form.ubicacion_descriptiva}
            onChange={(e) => cambiar('ubicacion_descriptiva', e.target.value)}
            placeholder="Ej.: Torre A — Piso 3"
          />
        </label>

        <label>
          URL de la fotografía
          <input
            type="url"
            value={form.foto_url}
            onChange={(e) => cambiar('foto_url', e.target.value)}
            placeholder="https://…"
          />
        </label>

        <div className="botonera">
          <button type="button" onClick={capturarPosicion}>
            {coords
              ? `📍 ${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`
              : '📍 Usar mi posición actual'}
          </button>
          {coords && (
            <button type="button" onClick={() => setCoords(null)}>
              Quitar posición
            </button>
          )}
        </div>

        <button className="boton--primario" type="submit" disabled={guardando} style={{ marginTop: '0.75rem' }}>
          {guardando ? 'Guardando…' : 'Guardar y generar NCF'}
        </button>

        {aviso && (
          <p
            className={`aviso ${aviso.tipo === 'ok' ? 'aviso--ok' : 'aviso--error'}`}
            style={{ marginTop: '0.75rem' }}
            role="status"
          >
            {aviso.texto}
          </p>
        )}
      </form>

      {/* ---------------------------- Listado ----------------------------- */}
      <section className="tarjeta">
        <h2>Listado general</h2>

        <label>
          Buscar
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Código, nombre, área o ubicación"
            type="search"
          />
        </label>

        {error && <p className="aviso aviso--error">{error}</p>}
        {cargando && <p className="tenue">Cargando…</p>}

        {!cargando && filtrados.length === 0 && (
          <p className="tenue">No hay bienes que coincidan con la búsqueda.</p>
        )}

        {filtrados.length > 0 && (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>NCF</th>
                  <th>Activo</th>
                  <th>Estado</th>
                  <th>Últ. lectura</th>
                  <th>Ubicación</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtrados.map((b) => (
                  <tr key={b.ncf}>
                    <td>
                      <Link className="mono" to={`/activo/${b.ncf}`}>
                        {b.ncf}
                      </Link>
                    </td>
                    <td>
                      {b.nombre}
                      <div className="tenue">{b.categoria}</div>
                    </td>
                    <td>
                      <select
                        value={b.estado}
                        onChange={(e) => cambiarEstado(b.ncf, e.target.value as EstadoBien)}
                        aria-label={`Estado de ${b.nombre}`}
                        style={{ marginTop: 0, padding: '5px 8px', fontSize: '0.8rem' }}
                      >
                        {ESTADOS.map((e) => (
                          <option key={e} value={e}>
                            {e}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="tenue">{haceCuanto(b.fecha_ultima_lectura)}</td>
                    <td className="tenue">
                      {b.ubicacion_descriptiva ?? (b.latitud === null ? 'Sin ubicar' : '—')}
                    </td>
                    <td>
                      <button
                        className="boton--peligro"
                        onClick={() => eliminar(b.ncf, b.nombre)}
                        aria-label={`Eliminar ${b.nombre}`}
                        style={{ padding: '5px 10px', minHeight: 32, fontSize: '0.8rem' }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
