import Peer, { type DataConnection } from 'peerjs'
import type { Color } from 'chess.js'

// Prefijo para no chocar con otros usuarios del broker público de PeerJS
const ID_PREFIX = 'ruteo-ajedrez-v1-'

// Por defecto se usa el broker público de PeerJS (0.peerjs.com). Para desarrollo/pruebas
// se puede apuntar a un servidor propio con VITE_PEER_HOST / VITE_PEER_PORT en el build.
const PEER_OPTS = import.meta.env.VITE_PEER_HOST
  ? {
      host: import.meta.env.VITE_PEER_HOST as string,
      port: Number(import.meta.env.VITE_PEER_PORT ?? 443),
      path: (import.meta.env.VITE_PEER_PATH as string) ?? '/',
      secure: import.meta.env.VITE_PEER_INSECURE !== '1',
    }
  : {}
// Alfabeto sin caracteres ambiguos (0/O, 1/I/L)
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function randomCode(len = 5): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

export type NetMsg =
  | { type: 'start'; yourColor: Color }
  | { type: 'move'; from: string; to: string; promotion?: string }
  | { type: 'resign' }
  | { type: 'draw_offer' }
  | { type: 'draw_accept' }
  | { type: 'draw_decline' }
  | { type: 'rematch' }
  | { type: 'rematch_decline' }
  | { type: 'chat'; text: string }

export interface NetEvents {
  /** El canal de datos con el rival quedó abierto. */
  onConnected: () => void
  onMessage: (msg: NetMsg) => void
  /** El rival cerró la conexión o se perdió el enlace. */
  onClosed: () => void
  onError: (friendlyText: string) => void
  /** (solo anfitrión) registrado en el broker, listo para recibir al rival. */
  onReady?: () => void
}

export class NetSession {
  readonly code: string
  readonly isHost: boolean
  private peer: Peer
  private conn: DataConnection | null = null
  private events: NetEvents
  private closedByUs = false

  private constructor(code: string, isHost: boolean, events: NetEvents) {
    this.code = code
    this.isHost = isHost
    this.events = events
    this.peer = isHost ? new Peer(ID_PREFIX + code, PEER_OPTS) : new Peer(PEER_OPTS)

    this.peer.on('error', (err) => {
      const type = (err as { type?: string }).type
      if (type === 'peer-unavailable') {
        events.onError('No se encontró ninguna partida con ese código. Verifica que esté bien escrito y que tu rival siga esperando.')
      } else if (type === 'unavailable-id') {
        events.onError('Ese código ya está en uso. Crea la partida de nuevo para generar otro.')
      } else if (type === 'network' || type === 'server-error' || type === 'socket-error') {
        events.onError('No se pudo conectar con el servicio de emparejamiento. Revisa tu conexión a internet e inténtalo de nuevo.')
      } else if (!this.closedByUs) {
        events.onError(`Error de conexión (${type ?? 'desconocido'}).`)
      }
    })

    if (isHost) {
      this.peer.on('open', () => events.onReady?.())
      this.peer.on('connection', (conn) => {
        if (this.conn) {
          conn.close() // ya hay rival: rechaza conexiones extra
          return
        }
        this.attach(conn)
      })
    } else {
      this.peer.on('open', () => {
        this.attach(this.peer.connect(ID_PREFIX + code, { reliable: true }))
      })
    }
  }

  static host(events: NetEvents): NetSession {
    return new NetSession(randomCode(), true, events)
  }

  static join(code: string, events: NetEvents): NetSession {
    return new NetSession(code.trim().toUpperCase(), false, events)
  }

  private attach(conn: DataConnection): void {
    this.conn = conn
    conn.on('open', () => this.events.onConnected())
    conn.on('data', (data) => {
      if (typeof data === 'object' && data !== null && 'type' in data) {
        this.events.onMessage(data as NetMsg)
      }
    })
    conn.on('close', () => {
      if (!this.closedByUs) this.events.onClosed()
    })
    conn.on('error', () => {
      if (!this.closedByUs) this.events.onClosed()
    })
  }

  get connected(): boolean {
    return this.conn?.open ?? false
  }

  send(msg: NetMsg): void {
    if (this.conn?.open) this.conn.send(msg)
  }

  destroy(): void {
    this.closedByUs = true
    try {
      this.conn?.close()
      this.peer.destroy()
    } catch {
      /* ya destruido */
    }
  }
}
