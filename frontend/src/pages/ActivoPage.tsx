/**
 * Ruta `/activo/:ncf` — la vista que abre el iPhone al leer la etiqueta NFC.
 *
 * Es la pantalla más importante del sistema y la única que un usuario puede
 * alcanzar sin haber abierto la app antes: llega desde la notificación de iOS.
 * De ahí tres decisiones:
 *
 *  1. Muestra la ficha de inmediato; nada de pantalla de login ni de menú.
 *  2. La acción principal —registrar la auditoría de presencia— es un botón
 *     grande, alcanzable con el pulgar, porque se pulsa con una mano mientras
 *     la otra sostiene el activo.
 *  3. Un NCF mal formado se distingue de un NCF sin registrar: el primero es un
 *     error de tipeo, el segundo una etiqueta que falta dar de alta, y cada uno
 *     lleva a una acción distinta.
 */

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { usuarioActual } from '../config'
import { useBien } from '../hooks/useBienes'
import { formatearFecha, haceCuanto } from '../lib/estilos'
import { obtenerPosicion } from '../lib/geo'
import { esNCFValido, normalizarNCF } from '../lib/ncf'
import { repo } from '../lib/repo'
import type { Auditoria, BienMueble } from '../types'
import { TarjetaActivo } from '../components/TarjetaActivo'

export function ActivoPage() {
  const { ncf } = useParams<{ ncf: string }>()
  const codigo = normalizarNCF(ncf ?? '')
  const formatoValido = esNCFValido(codigo)

  // Si el formato ya es incorrecto no se consulta el repositorio: se ahorra un
  // viaje de red y se da un diagnóstico más preciso.
  const { datos: bien, cargando, error, fijar } = useBien(formatoValido ? codigo : undefined)

  const [eventos, setEventos] = useState<Auditoria[]>([])
  const [sincronizar, setSincronizar] = useState(true)
  const [nota, setNota] = useState('')
  const [registrando, setRegistrando] = useState(false)
  const [resultado, setResultado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const cargarHistorial = useCallback(async () => {
    if (!formatoValido) return
    try {
      setEventos(await repo.historial(codigo, 15))
    } catch {
      // El historial es información secundaria: si falla, la ficha sigue siendo útil.
    }
  }, [codigo, formatoValido])

  useEffect(() => {
    if (bien) void cargarHistorial()
  }, [bien, cargarHistorial])

  /** Auditoría de presencia: confirma que el bien está donde debe estar. */
  async function registrarPresencia() {
    if (!bien) return
    setRegistrando(true)
    setResultado(null)

    // La ubicación es opcional a propósito: si el GPS falla dentro de un
    // almacén, la auditoría igual debe quedar registrada. Se pierde la
    // coordenada, no el chequeo.
    let posicion: Awaited<ReturnType<typeof obtenerPosicion>> | null = null
    let avisoGps = ''
    try {
      posicion = await obtenerPosicion()
    } catch (e) {
      avisoGps = ` (sin coordenadas: ${e instanceof Error ? e.message : 'GPS no disponible'})`
    }

    try {
      const { bien: actualizado } = await repo.registrarAuditoria(bien.ncf, {
        tipo: 'Auditoría de presencia',
        latitud: posicion?.latitud ?? null,
        longitud: posicion?.longitud ?? null,
        precision_gps_m: posicion?.precisionM ?? null,
        usuario: usuarioActual(),
        nota: nota.trim() || null,
        sincronizar_ubicacion: sincronizar && posicion !== null,
      })
      fijar(actualizado)
      setNota('')
      void cargarHistorial()
      setResultado({
        tipo: 'ok',
        texto: `Presencia registrada el ${formatearFecha(actualizado.fecha_ultima_lectura)}${avisoGps}`,
      })
    } catch (e) {
      setResultado({
        tipo: 'error',
        texto: e instanceof Error ? e.message : 'No se pudo registrar la auditoría.',
      })
    } finally {
      setRegistrando(false)
    }
  }

  // --- Estados de error -----------------------------------------------------
  if (!formatoValido) {
    return (
      <div className="panel">
        <div className="aviso aviso--error">
          <strong>Código NCF inválido</strong>
          <p style={{ margin: '0.4rem 0 0' }}>
            <span className="mono">{codigo || '(vacío)'}</span> no tiene el formato
            <span className="mono"> NCF-AAAAMM-CAT-NNNNV</span> o su carácter verificador no
            corresponde. Si lo tecleó a mano, revíselo; si vino de una etiqueta, es probable que
            esté grabada con una URL incorrecta.
          </p>
        </div>
        <Link to="/escanear">← Introducir el código de nuevo</Link>
      </div>
    )
  }

  if (cargando) return <div className="cargando">Cargando ficha del activo…</div>

  if (error || !bien) {
    return (
      <div className="panel">
        <div className="aviso aviso--alerta">
          <strong>Etiqueta sin registrar</strong>
          <p style={{ margin: '0.4rem 0 0' }}>
            El código <span className="mono">{codigo}</span> es válido, pero no hay ningún bien
            asociado. {error}
          </p>
        </div>
        <Link className="boton--primario" to="/admin" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', padding: '12px' }}>
          Dar de alta este activo
        </Link>
      </div>
    )
  }

  // --- Ficha ----------------------------------------------------------------
  return (
    <div className="panel">
      <TarjetaActivo bien={bien} alActualizar={(b: BienMueble) => fijar(b)} />

      <section className="tarjeta">
        <h2>Auditoría de presencia</h2>
        <p className="tenue" style={{ marginTop: 0 }}>
          Confirma que el bien fue visto físicamente. Actualiza la fecha de último chequeo y deja
          constancia en la bitácora.
        </p>

        <label>
          Nota (opcional)
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej.: pata delantera con holgura; se recomienda revisión."
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={sincronizar}
            onChange={(e) => setSincronizar(e.target.checked)}
            style={{ width: 18, height: 18, margin: 0 }}
          />
          Sincronizar también la ubicación con mi posición actual
        </label>

        <button className="boton--primario" onClick={registrarPresencia} disabled={registrando}>
          {registrando ? 'Registrando…' : '✓ Registrar auditoría de presencia'}
        </button>

        {resultado && (
          <p
            className={`aviso ${resultado.tipo === 'ok' ? 'aviso--ok' : 'aviso--error'}`}
            style={{ marginTop: '0.75rem' }}
            role="status"
          >
            {resultado.texto}
          </p>
        )}
      </section>

      <section className="tarjeta">
        <h2>Bitácora</h2>
        {eventos.length === 0 ? (
          <p className="tenue">Sin eventos registrados todavía.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {eventos.map((e) => (
              <li key={e.id} style={{ marginBottom: '0.5rem' }}>
                <strong>{e.tipo}</strong> · <span className="tenue">{haceCuanto(e.registrado_en)}</span>
                <br />
                <span className="tenue">
                  {formatearFecha(e.registrado_en)}
                  {e.usuario ? ` · ${e.usuario}` : ''}
                </span>
                {e.nota && <div style={{ fontSize: '0.85rem' }}>{e.nota}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p style={{ textAlign: 'center' }}>
        <Link to={`/?resaltado=${bien.ncf}`}>Ver en el mapa →</Link>
      </p>
    </div>
  )
}
