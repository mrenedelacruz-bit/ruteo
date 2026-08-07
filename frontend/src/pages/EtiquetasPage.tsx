/**
 * Preparación de etiquetas NFC.
 *
 * Aquí se cierra el círculo entre el registro digital y el objeto físico: se
 * elige un bien, se obtiene la URL exacta que debe llevar su etiqueta y se
 * graba —directamente desde el navegador si la plataforma lo permite, o con
 * NFC Tools en iPhone, que es el caso normal en este proyecto.
 *
 * El motivo de la bifurcación está explicado en `src/lib/nfc.ts`: WebKit no
 * expone el chip NFC a las páginas web, y no es algo que se pueda sortear.
 */

import { useMemo, useState } from 'react'

import { URL_PUBLICA } from '../config'
import { useBienes } from '../hooks/useBienes'
import { urlEtiqueta } from '../lib/ncf'
import { capacidadesNFC, copiar, escribirURL, NFCError } from '../lib/nfc'

/**
 * Bytes que ocupa la URL dentro del mensaje NDEF, para avisar antes de que la
 * grabación falle por falta de espacio.
 *
 * Desglose: cabecera del registro (5 B) + tipo "U" (1 B) + 1 B de prefijo
 * abreviado (0x04 = "https://", 0x03 = "http://", que ahorran esos caracteres)
 * + el resto de la URL en UTF-8. Se añaden 2 B de margen por el TLV del
 * contenedor NDEF.
 */
function bytesNDEF(url: string): number {
  const sinPrefijo = url.replace(/^https?:\/\//, '')
  return new TextEncoder().encode(sinPrefijo).length + 9
}

/** Capacidad NDEF útil de los chips más comunes (memoria total menos overhead). */
const CHIPS = [
  { nombre: 'NTAG213', util: 132 },
  { nombre: 'NTAG215', util: 492 },
  { nombre: 'NTAG216', util: 872 },
]

export function EtiquetasPage() {
  const { datos: bienes, cargando } = useBienes()
  const [ncfElegido, setNcfElegido] = useState('')
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [grabando, setGrabando] = useState(false)

  const caps = capacidadesNFC()
  const bien = bienes.find((b) => b.ncf === ncfElegido) ?? null
  const url = useMemo(
    () => (bien ? (bien.url_etiqueta ?? urlEtiqueta(bien.ncf, URL_PUBLICA)) : ''),
    [bien],
  )
  const bytes = url ? bytesNDEF(url) : 0

  async function alCopiar() {
    try {
      await copiar(url)
      setMensaje({ tipo: 'ok', texto: 'URL copiada. Péguela en NFC Tools › Escribir › Añadir un registro › URL.' })
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo copiar. Seleccione la URL y cópiela a mano.' })
    }
  }

  async function alGrabar() {
    setGrabando(true)
    setMensaje(null)
    try {
      await escribirURL(url)
      setMensaje({ tipo: 'ok', texto: '✓ Etiqueta grabada. Pruébela acercando el teléfono de nuevo.' })
    } catch (e) {
      setMensaje({
        tipo: 'error',
        texto: e instanceof NFCError || e instanceof Error ? e.message : 'No se pudo grabar.',
      })
    } finally {
      setGrabando(false)
    }
  }

  return (
    <div className="panel">
      <h1>Etiquetas NFC</h1>

      <section className="tarjeta">
        <h2>1. Elija el bien</h2>
        {cargando ? (
          <p className="tenue">Cargando inventario…</p>
        ) : (
          <label>
            Activo a etiquetar
            <select value={ncfElegido} onChange={(e) => { setNcfElegido(e.target.value); setMensaje(null) }}>
              <option value="">— Seleccione —</option>
              {bienes.map((b) => (
                <option key={b.ncf} value={b.ncf}>
                  {b.nombre} · {b.ncf}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {bien && (
        <>
          <section className="tarjeta">
            <h2>2. URL a grabar</h2>
            <p className="tenue" style={{ marginTop: 0 }}>
              Es exactamente lo que iOS mostrará en la notificación al acercar el iPhone.
            </p>
            <p className="mono" style={{ background: 'var(--superficie-alta)', padding: '0.6rem', borderRadius: 8 }}>
              {url}
            </p>

            <p className="tenue">
              Ocupa ≈ {bytes} bytes en el mensaje NDEF.{' '}
              {CHIPS.map((c) => `${c.nombre}: ${bytes <= c.util ? '✓' : '✗'}`).join(' · ')}
            </p>

            <button onClick={alCopiar} style={{ width: '100%' }}>
              📋 Copiar URL
            </button>

            {caps.webNfc && (
              <button
                className="boton--primario"
                onClick={alGrabar}
                disabled={grabando}
                style={{ marginTop: '0.5rem' }}
              >
                {grabando ? 'Acerque la etiqueta…' : '📡 Grabar etiqueta ahora'}
              </button>
            )}

            {mensaje && (
              <p
                className={`aviso ${mensaje.tipo === 'ok' ? 'aviso--ok' : 'aviso--error'}`}
                style={{ marginTop: '0.75rem' }}
                role="status"
              >
                {mensaje.texto}
              </p>
            )}
          </section>

          <section className="tarjeta">
            <h2>3. Grabar la etiqueta</h2>

            {caps.webNfc ? (
              <p className="tenue" style={{ marginTop: 0 }}>
                Este dispositivo graba directamente desde el navegador con el botón de arriba. Si
                prefiere una app dedicada, los pasos de NFC Tools también sirven.
              </p>
            ) : (
              <div className="aviso aviso--info">
                <strong>En iPhone la grabación va por NFC Tools.</strong>
                <p style={{ margin: '0.4rem 0 0' }}>
                  Safari no puede escribir en el chip NFC: es una restricción de iOS, no de esta
                  app. NFC Tools es gratuita y solo se necesita una vez por etiqueta. La{' '}
                  <strong>lectura</strong> en campo, en cambio, no requiere ninguna app.
                </p>
              </div>
            )}

            <ol style={{ paddingLeft: '1.2rem', margin: 0 }}>
              <li style={{ marginBottom: '0.5rem' }}>
                Abra <strong>NFC Tools</strong> y toque <strong>Escribir</strong>.
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                <strong>Añadir un registro</strong> → <strong>URL / URI</strong>.
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                Pegue la URL copiada. Compruebe que empieza por <span className="mono">https://</span>{' '}
                — NFC Tools la comprime a 1 byte y así cabe hasta en una NTAG213.
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                <strong>Aceptar</strong> → <strong>Escribir</strong> y acerque la etiqueta al borde
                superior del iPhone, con la pantalla encendida.
              </li>
              <li>
                Verifique: aparte el teléfono, vuelva a acercarlo y confirme que la notificación
                abre esta app en la ficha de <strong>{bien.nombre}</strong>.
              </li>
            </ol>

            <p className="tenue" style={{ marginBottom: 0 }}>
              Guía completa, incluida la protección contra reescritura:{' '}
              <span className="mono">docs/GUIA-NFC-IPHONE.md</span>
            </p>
          </section>
        </>
      )}

      {!bien && !cargando && (
        <p className="tenue">
          Seleccione un bien para ver la URL de su etiqueta. Si aún no lo ha registrado, hágalo
          primero en la pestaña <strong>Inventario</strong>.
        </p>
      )}
    </div>
  )
}
