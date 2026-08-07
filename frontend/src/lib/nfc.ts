/**
 * Capa de NFC del navegador (Web NFC).
 *
 * Estado real del soporte, que es lo que dicta el diseño de este módulo:
 *
 *   • Android + Chrome/Edge 89+  → `NDEFReader` disponible: la app puede leer y
 *     **grabar** etiquetas directamente. Requiere HTTPS y un gesto del usuario.
 *   • iOS / Safari (cualquier versión) → `NDEFReader` NO existe. WebKit no
 *     expone el chip NFC a las páginas web. No hay bandera ni permiso que lo
 *     habilite: es una decisión de plataforma.
 *
 * Consecuencia arquitectónica: la **escritura** de etiquetas desde iPhone se
 * delega a una app puente (NFC Tools, gratuita) siguiendo `docs/GUIA-NFC-IPHONE.md`,
 * mientras que la **lectura** en campo no necesita ninguna app — iOS lee las
 * etiquetas NDEF con URL en segundo plano (iPhone XS y posteriores) y muestra
 * una notificación que abre la PWA directamente.
 *
 * Este módulo, por tanto: detecta capacidades, graba donde se pueda, y en iOS
 * entrega lo necesario (URL exacta) para el flujo con app puente.
 */

/** Subconjunto tipado de la Web NFC API (aún no está en lib.dom.d.ts). */
interface NDEFRecordInit {
  recordType: string
  data?: string | BufferSource
  mediaType?: string
  encoding?: string
  lang?: string
}
interface NDEFWriteOptions {
  overwrite?: boolean
  signal?: AbortSignal
}
interface NDEFMessageInit {
  records: NDEFRecordInit[]
}
interface NDEFReaderLike extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>
  write(message: NDEFMessageInit | string, options?: NDEFWriteOptions): Promise<void>
}
type NDEFReaderCtor = new () => NDEFReaderLike

function ctorNDEF(): NDEFReaderCtor | null {
  const w = window as unknown as { NDEFReader?: NDEFReaderCtor }
  return w.NDEFReader ?? null
}

export interface CapacidadesNFC {
  /** El navegador expone la Web NFC API (en la práctica: Chrome en Android). */
  webNfc: boolean
  /** El dispositivo es iOS/iPadOS: la escritura va por app puente. */
  esIOS: boolean
  /** La página corre en contexto seguro; sin esto, Web NFC ni siquiera aparece. */
  contextoSeguro: boolean
}

export function capacidadesNFC(): CapacidadesNFC {
  const ua = navigator.userAgent
  return {
    webNfc: ctorNDEF() !== null,
    // iPadOS 13+ se anuncia como Mac; el test táctil lo desenmascara.
    esIOS: /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1),
    contextoSeguro: window.isSecureContext,
  }
}

export class NFCError extends Error {}

/**
 * Graba una URL en la etiqueta que se acerque, como registro NDEF de tipo `url`.
 *
 * Debe invocarse desde un manejador de evento del usuario (un click): el
 * navegador exige activación del usuario para encender la antena.
 *
 * @param url       URL absoluta a grabar (la de `urlEtiqueta()`).
 * @param timeoutMs cuánto esperar a que aparezca una etiqueta.
 */
export async function escribirURL(url: string, timeoutMs = 20_000): Promise<void> {
  const Ctor = ctorNDEF()
  if (!Ctor) {
    throw new NFCError(
      'Este navegador no permite grabar etiquetas NFC. ' +
        'En iPhone use la app NFC Tools siguiendo la guía; en Android use Chrome.',
    )
  }

  const abort = new AbortController()
  const reloj = setTimeout(() => abort.abort(), timeoutMs)
  try {
    await new Ctor().write(
      // recordType 'url' produce un registro NDEF URI (0x55) con el prefijo
      // abreviado 'https://' (0x04), que es lo que iOS reconoce para abrir el
      // enlace desde la notificación de lectura en segundo plano.
      { records: [{ recordType: 'url', data: url }] },
      { overwrite: true, signal: abort.signal },
    )
  } catch (error) {
    if (abort.signal.aborted) {
      throw new NFCError('No se detectó ninguna etiqueta. Acérquela al teléfono y reintente.')
    }
    const detalle = error instanceof Error ? error.message : String(error)
    throw new NFCError(`No se pudo grabar la etiqueta: ${detalle}`)
  } finally {
    clearTimeout(reloj)
  }
}

/**
 * Escucha lecturas NFC y entrega el texto crudo de cada registro.
 * Solo funciona donde hay Web NFC; en iOS el "escaneo" lo hace el sistema.
 *
 * @returns función para detener la escucha.
 */
export async function escucharLecturas(
  alLeer: (textos: string[]) => void,
): Promise<() => void> {
  const Ctor = ctorNDEF()
  if (!Ctor) throw new NFCError('Este navegador no permite leer etiquetas NFC.')

  const abort = new AbortController()
  const lector = new Ctor()

  lector.addEventListener('reading', (evento) => {
    const { message } = evento as unknown as {
      message: { records: { recordType: string; data?: DataView; encoding?: string }[] }
    }
    const textos = message.records
      .map((r) => {
        if (!r.data) return ''
        try {
          return new TextDecoder(r.encoding ?? 'utf-8').decode(r.data)
        } catch {
          return ''
        }
      })
      .filter(Boolean)
    if (textos.length) alLeer(textos)
  })

  await lector.scan({ signal: abort.signal })
  return () => abort.abort()
}

/** Copia texto al portapapeles. Es el puente práctico hacia NFC Tools en iPhone. */
export async function copiar(texto: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(texto)
    return
  }
  // Safari antiguo: respaldo con un textarea fuera de pantalla.
  const area = document.createElement('textarea')
  area.value = texto
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  document.execCommand('copy')
  document.body.removeChild(area)
}
