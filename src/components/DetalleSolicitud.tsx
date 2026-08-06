import { useState } from 'react'
import { COMITE_CREDITO, PLAZOS_DIAS, ROLE_LABELS, RUTAS } from '../config'
import {
  aprobadorDescuento,
  pendienteDe,
  proponerCondiciones,
  registrarVisita,
  revisarPrecio,
  revisarVisita,
  votarComite,
} from '../workflow'
import type { Decision, Role, Solicitud, TipoPago } from '../types'
import { EtapaBadge } from './EtapaBadge.tsx'

export function DetalleSolicitud({
  solicitud: s,
  role,
  onActualizar,
  onVolver,
}: {
  solicitud: Solicitud
  role: Role
  onActualizar: (s: Solicitud) => void
  onVolver: () => void
}) {
  const esperando = pendienteDe(s)
  const meToca = esperando.includes(role)

  return (
    <main className="detalle">
      <button className="link" onClick={onVolver}>
        ← Volver al tablero
      </button>

      <div className="detalle-head">
        <h2>
          {s.cliente.nombre} <span className="mono id">{s.id}</span>
        </h2>
        <EtapaBadge etapa={s.etapa} />
      </div>

      {esperando.length > 0 && (
        <p className={meToca ? 'hint accion' : 'hint'}>
          {meToca
            ? 'Esta solicitud espera tu acción.'
            : `Esperando a: ${esperando.map((r) => ROLE_LABELS[r]).join(', ')}.`}
        </p>
      )}
      {s.etapa === 'RECHAZADO' && s.motivoCierre && (
        <p className="hint rechazo">Motivo del rechazo: {s.motivoCierre}</p>
      )}

      <section className="panel">
        <h3>Datos del cliente</h3>
        <dl className="datos">
          <div><dt>RNC / Cédula</dt><dd>{s.cliente.rnc || '—'}</dd></div>
          <div><dt>Contacto</dt><dd>{s.cliente.contacto || '—'}</dd></div>
          <div><dt>Teléfono</dt><dd>{s.cliente.telefono || '—'}</dd></div>
          <div><dt>Tipo de negocio</dt><dd>{s.cliente.tipoNegocio}</dd></div>
          <div className="wide"><dt>Dirección</dt><dd>{s.cliente.direccion}</dd></div>
          <div><dt>Ruta asignada</dt><dd>{s.ruta ?? 'Pendiente'}</dd></div>
        </dl>
      </section>

      {s.visita && (
        <section className="panel">
          <h3>Visita al lugar</h3>
          <dl className="datos">
            <div><dt>Fecha</dt><dd>{s.visita.fecha}</dd></div>
            <div>
              <dt>Geolocalización</dt>
              <dd>
                {s.visita.lat != null && s.visita.lng != null ? (
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${s.visita.lat}&mlon=${s.visita.lng}#map=18/${s.visita.lat}/${s.visita.lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {s.visita.lat.toFixed(5)}, {s.visita.lng.toFixed(5)} (ver mapa)
                  </a>
                ) : (
                  'Sin coordenadas'
                )}
              </dd>
            </div>
            <div className="wide"><dt>Notas</dt><dd>{s.visita.notas || '—'}</dd></div>
          </dl>
        </section>
      )}

      {s.condiciones && (
        <section className="panel">
          <h3>Condiciones comerciales</h3>
          <dl className="datos">
            <div><dt>Descuento</dt><dd>{s.condiciones.descuentoPct}%</dd></div>
            <div><dt>Forma de pago</dt><dd>{s.condiciones.tipoPago === 'CREDITO' ? 'Crédito' : 'Contado'}</dd></div>
            {s.condiciones.tipoPago === 'CREDITO' && (
              <>
                <div><dt>Límite de crédito</dt><dd>RD${s.condiciones.limiteCredito.toLocaleString()}</dd></div>
                <div><dt>Plazo</dt><dd>{s.condiciones.plazoDias} días</dd></div>
              </>
            )}
          </dl>
        </section>
      )}

      {(s.etapa === 'CREDITO_EN_COMITE' || Object.keys(s.votosComite).length > 0) && (
        <section className="panel">
          <h3>Comité de crédito (todos deben aprobar)</h3>
          <ul className="votos">
            {COMITE_CREDITO.map((r) => (
              <li key={r}>
                <span>{ROLE_LABELS[r]}</span>
                <span className={`voto voto-${(s.votosComite[r] ?? 'PENDIENTE').toLowerCase()}`}>
                  {s.votosComite[r] === 'APROBADO' && '✔ Aprobó'}
                  {s.votosComite[r] === 'RECHAZADO' && '✘ Rechazó'}
                  {!s.votosComite[r] && '… Pendiente'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {meToca && s.etapa === 'SOLICITUD' && role === 'VENDEDOR' && (
        <FormVisita s={s} onActualizar={onActualizar} />
      )}
      {meToca && s.etapa === 'VISITA_EN_REVISION' && role === 'SUPERVISOR' && (
        <RevisionVisita s={s} onActualizar={onActualizar} />
      )}
      {meToca && s.etapa === 'CONDICIONES' && role === 'VENDEDOR' && (
        <FormCondiciones s={s} onActualizar={onActualizar} />
      )}
      {meToca && s.etapa === 'PRECIO_EN_REVISION' && (
        <PanelDecision
          titulo={`Revisión de precio/descuento (${s.condiciones?.descuentoPct}%)`}
          onDecidir={(d, c) => onActualizar(revisarPrecio(s, role, d, c))}
        />
      )}
      {meToca && s.etapa === 'CREDITO_EN_COMITE' && (
        <PanelDecision
          titulo={`Tu voto en el comité de crédito como ${ROLE_LABELS[role]}`}
          onDecidir={(d, c) => onActualizar(votarComite(s, role, d, c))}
        />
      )}

      <section className="panel">
        <h3>Historial de aprobación</h3>
        <ol className="timeline">
          {s.historial.map((e, i) => (
            <li key={i}>
              <span className="ts">{new Date(e.ts).toLocaleString('es-DO')}</span>
              <span className="who">{ROLE_LABELS[e.role]}</span>
              <span>{e.accion}</span>
              {e.comentario && <span className="comentario">«{e.comentario}»</span>}
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}

function FormVisita({ s, onActualizar }: { s: Solicitud; onActualizar: (s: Solicitud) => void }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [fecha, setFecha] = useState(hoy)
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [notas, setNotas] = useState('')
  const [gpsError, setGpsError] = useState('')

  const usarGps = () => {
    setGpsError('')
    if (!navigator.geolocation) {
      setGpsError('Este navegador no soporta geolocalización; ingresa las coordenadas a mano.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6))
        setLng(pos.coords.longitude.toFixed(6))
      },
      () => setGpsError('No se pudo obtener la ubicación; ingresa las coordenadas a mano.'),
    )
  }

  const registrar = () => {
    const latNum = lat.trim() === '' ? null : Number(lat)
    const lngNum = lng.trim() === '' ? null : Number(lng)
    onActualizar(
      registrarVisita(s, {
        fecha,
        lat: Number.isFinite(latNum as number) ? latNum : null,
        lng: Number.isFinite(lngNum as number) ? lngNum : null,
        notas: notas.trim(),
      }),
    )
  }

  return (
    <section className="panel accion-panel">
      <h3>Registrar visita al lugar</h3>
      <div className="form-grid">
        <label>
          Fecha de la visita
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <label>
          Latitud
          <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="18.4861" />
        </label>
        <label>
          Longitud
          <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-69.9312" />
        </label>
        <label className="wide">
          Notas de la visita (estado del local, potencial de compra, competencia)
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} />
        </label>
      </div>
      {gpsError && <p className="hint rechazo">{gpsError}</p>}
      <div className="actions">
        <button onClick={usarGps}>📍 Usar mi ubicación GPS</button>
        <button className="primary" onClick={registrar}>
          Registrar visita → enviar al supervisor
        </button>
      </div>
    </section>
  )
}

function RevisionVisita({ s, onActualizar }: { s: Solicitud; onActualizar: (s: Solicitud) => void }) {
  const [ruta, setRuta] = useState(RUTAS[0])
  const [comentario, setComentario] = useState('')

  return (
    <section className="panel accion-panel">
      <h3>Validar visita y asignar ruta</h3>
      <div className="form-grid">
        <label>
          Ruta a asignar
          <select value={ruta} onChange={(e) => setRuta(e.target.value)}>
            {RUTAS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="wide">
          Comentario
          <input value={comentario} onChange={(e) => setComentario(e.target.value)} />
        </label>
      </div>
      <div className="actions">
        <button className="danger" onClick={() => onActualizar(revisarVisita(s, 'RECHAZAR', null, comentario))}>
          Rechazar
        </button>
        <button onClick={() => onActualizar(revisarVisita(s, 'DEVOLVER', null, comentario))}>
          Devolver al vendedor
        </button>
        <button className="primary" onClick={() => onActualizar(revisarVisita(s, 'APROBAR', ruta, comentario))}>
          Aprobar visita y asignar ruta
        </button>
      </div>
    </section>
  )
}

function FormCondiciones({ s, onActualizar }: { s: Solicitud; onActualizar: (s: Solicitud) => void }) {
  const [descuento, setDescuento] = useState(s.condiciones?.descuentoPct ?? 0)
  const [tipoPago, setTipoPago] = useState<TipoPago>(s.condiciones?.tipoPago ?? 'CONTADO')
  const [limite, setLimite] = useState(s.condiciones?.limiteCredito ?? 50000)
  const [plazo, setPlazo] = useState(s.condiciones?.plazoDias ?? PLAZOS_DIAS[1])

  const aprobador = aprobadorDescuento(descuento)

  return (
    <section className="panel accion-panel">
      <h3>Proponer condiciones comerciales</h3>
      <div className="form-grid">
        <label>
          Descuento sobre lista (%)
          <input
            type="number"
            min={0}
            max={100}
            value={descuento}
            onChange={(e) => setDescuento(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
          />
        </label>
        <label>
          Forma de pago
          <select value={tipoPago} onChange={(e) => setTipoPago(e.target.value as TipoPago)}>
            <option value="CONTADO">Contado</option>
            <option value="CREDITO">Crédito</option>
          </select>
        </label>
        {tipoPago === 'CREDITO' && (
          <>
            <label>
              Límite de crédito (RD$)
              <input
                type="number"
                min={0}
                step={5000}
                value={limite}
                onChange={(e) => setLimite(Math.max(0, Number(e.target.value) || 0))}
              />
            </label>
            <label>
              Plazo de pago
              <select value={plazo} onChange={(e) => setPlazo(Number(e.target.value))}>
                {PLAZOS_DIAS.map((p) => (
                  <option key={p} value={p}>
                    {p} días
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      <p className="hint">
        {aprobador
          ? `Según la matriz, un ${descuento}% de descuento requiere aprobación de: ${ROLE_LABELS[aprobador]}.`
          : `Un ${descuento}% de descuento queda auto-aprobado según la matriz.`}
        {tipoPago === 'CREDITO' && ' El crédito pasará luego al comité (todos deben aprobar).'}
      </p>
      <div className="actions">
        <button
          className="primary"
          onClick={() =>
            onActualizar(
              proponerCondiciones(s, {
                descuentoPct: descuento,
                tipoPago,
                limiteCredito: tipoPago === 'CREDITO' ? limite : 0,
                plazoDias: tipoPago === 'CREDITO' ? plazo : 0,
              }),
            )
          }
        >
          Enviar condiciones a aprobación
        </button>
      </div>
    </section>
  )
}

function PanelDecision({
  titulo,
  onDecidir,
}: {
  titulo: string
  onDecidir: (d: Decision, comentario: string) => void
}) {
  const [comentario, setComentario] = useState('')
  return (
    <section className="panel accion-panel">
      <h3>{titulo}</h3>
      <div className="form-grid">
        <label className="wide">
          Comentario (obligatorio al rechazar o devolver)
          <input value={comentario} onChange={(e) => setComentario(e.target.value)} />
        </label>
      </div>
      <div className="actions">
        <button
          className="danger"
          disabled={!comentario.trim()}
          onClick={() => onDecidir('RECHAZAR', comentario)}
        >
          Rechazar
        </button>
        <button disabled={!comentario.trim()} onClick={() => onDecidir('DEVOLVER', comentario)}>
          Devolver para ajuste
        </button>
        <button className="primary" onClick={() => onDecidir('APROBAR', comentario)}>
          Aprobar
        </button>
      </div>
    </section>
  )
}
