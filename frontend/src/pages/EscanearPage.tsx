/**
 * Entrada manual y escaneo asistido.
 *
 * En un iPhone esta pantalla casi no se usa: iOS lee la etiqueta solo y abre
 * `/activo/{ncf}` directamente. Existe para los tres casos en que ese camino
 * falla, que en campo son frecuentes:
 *   - la etiqueta se despegó o se dañó y solo queda el código impreso;
 *   - el teléfono es un iPhone 7–X, sin lectura en segundo plano;
 *   - el usuario está en Android, donde sí se puede escanear desde la web.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { capacidadesNFC, escucharLecturas, NFCError } from '../lib/nfc'
import { esNCFValido, extraerNCF, normalizarNCF, validarNCF } from '../lib/ncf'

export function EscanearPage() {
  const navegar = useNavigate()
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [escuchando, setEscuchando] = useState(false)
  const [detener, setDetener] = useState<(() => void) | null>(null)

  const caps = capacidadesNFC()

  // Si el usuario abandona la pantalla, se apaga la antena.
  useEffect(() => () => detener?.(), [detener])

  function abrirFicha(entrada: string) {
    try {
      navegar(`/activo/${validarNCF(entrada)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Código inválido.')
    }
  }

  async function escanear() {
    setError(null)
    try {
      const parar = await escucharLecturas((textos) => {
        const encontrado = textos.map(extraerNCF).find(Boolean)
        if (encontrado) {
          parar()
          setEscuchando(false)
          navegar(`/activo/${encontrado}`)
        } else {
          setError('La etiqueta se leyó, pero no contiene un código NCF válido.')
        }
      })
      setDetener(() => parar)
      setEscuchando(true)
    } catch (e) {
      setError(e instanceof NFCError || e instanceof Error ? e.message : 'No se pudo escanear.')
    }
  }

  const normalizado = normalizarNCF(codigo)
  const listo = esNCFValido(normalizado)

  return (
    <div className="panel">
      <h1>Buscar activo</h1>

      <section className="tarjeta">
        <h2>Introducir el código NCF</h2>
        <label>
          Código impreso en la etiqueta
          <input
            value={codigo}
            onChange={(e) => {
              setCodigo(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && listo && abrirFicha(normalizado)}
            placeholder="NCF-202608-MOB-0042K"
            // Estos cuatro atributos evitan que iOS "corrija" el código o lo
            // capitalice a mitad de escritura.
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            className="mono"
          />
        </label>

        {normalizado.length > 8 && !listo && (
          <p className="tenue" style={{ marginTop: '-0.4rem' }}>
            Formato esperado: <span className="mono">NCF-AAAAMM-CAT-NNNNV</span>
          </p>
        )}

        <button className="boton--primario" disabled={!listo} onClick={() => abrirFicha(normalizado)}>
          Abrir ficha
        </button>
        {error && (
          <p className="aviso aviso--error" style={{ marginTop: '0.75rem' }} role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="tarjeta">
        <h2>Escaneo NFC</h2>

        {caps.webNfc ? (
          <>
            <p className="tenue" style={{ marginTop: 0 }}>
              Este dispositivo puede leer etiquetas desde el navegador. Pulse el botón y acerque el
              teléfono a la etiqueta.
            </p>
            <button className="boton--primario" onClick={escanear} disabled={escuchando}>
              {escuchando ? 'Acerque la etiqueta…' : '📡 Escanear etiqueta NFC'}
            </button>
            {escuchando && (
              <button
                style={{ marginTop: '0.5rem', width: '100%' }}
                onClick={() => {
                  detener?.()
                  setEscuchando(false)
                }}
              >
                Cancelar
              </button>
            )}
          </>
        ) : caps.esIOS ? (
          <div className="aviso aviso--info" style={{ marginBottom: 0 }}>
            <strong>En iPhone no hace falta escanear desde aquí.</strong>
            <p style={{ margin: '0.4rem 0 0' }}>
              Con la pantalla encendida, acerque el borde superior del teléfono a la etiqueta:
              iOS mostrará una notificación que abre la ficha del activo directamente. Funciona sin
              abrir ninguna app, en iPhone XS y modelos posteriores.
            </p>
            <p style={{ margin: '0.4rem 0 0' }}>
              En iPhone 7 a X, use el botón <em>Lector de NFC</em> del Centro de Control.
            </p>
          </div>
        ) : (
          <p className="tenue" style={{ margin: 0 }}>
            Este navegador no expone la API Web NFC. Introduzca el código a mano, o use Chrome en
            Android para escanear directamente.
          </p>
        )}

        {!caps.contextoSeguro && (
          <p className="aviso aviso--alerta" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
            La página no se está sirviendo por HTTPS. Sin contexto seguro, ni el NFC ni la
            geolocalización funcionan.
          </p>
        )}
      </section>
    </div>
  )
}
