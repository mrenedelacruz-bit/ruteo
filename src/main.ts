import { Chess, type Color, type Move, type Square } from 'chess.js'
import { BoardView, kingSquare } from './board.ts'
import { NetSession, type NetMsg } from './net.ts'
import './style.css'

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T

const GLYPHS: Record<string, string> = { q: '♛', r: '♜', b: '♝', n: '♞', p: '♟', k: '♚' }

// ---------- Estado ----------
type Mode = 'local' | 'host' | 'guest'

let mode: Mode | null = null
let net: NetSession | null = null
let chess = new Chess()
let myColor: Color | null = null // null en modo local (se juegan ambos lados)
let orientation: Color = 'w'
let selected: Square | null = null
let targets: Square[] = []
let lastMove: { from: Square; to: Square } | null = null
let gameOverText: string | null = null
let rivalConnected = false
let incomingOffer: 'draw' | 'rematch' | null = null
let sentRematch = false

const board = new BoardView($('board'))
board.onSquareClick = onSquareClick

// ---------- Pantallas ----------
function showScreen(name: 'menu' | 'waiting' | 'game'): void {
  $('menu').hidden = name !== 'menu'
  $('waiting').hidden = name !== 'waiting'
  $('game').hidden = name !== 'game'
}

// ---------- Sonido ----------
let audioCtx: AudioContext | null = null
function beep(freq: number, duration = 0.08): void {
  try {
    audioCtx ??= new AudioContext()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration)
    osc.connect(gain).connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + duration)
  } catch {
    /* sin audio */
  }
}

// ---------- Utilidades ----------
function colorName(c: Color): string {
  return c === 'w' ? 'blancas' : 'negras'
}

function bottomColor(): Color {
  return mode === 'local' ? orientation : (myColor ?? 'w')
}

function isMyTurn(): boolean {
  if (gameOverText) return false
  if (mode === 'local') return true
  return rivalConnected && myColor === chess.turn()
}

// ---------- Render ----------
function refresh(): void {
  const checkSq = chess.inCheck() && !gameOverText ? kingSquare(chess, chess.turn()) : null
  board.render({ chess, orientation, selected, targets, lastMove, checkSquare: checkSq })
  renderStatus()
  renderMoves()
  renderCaptured()
  renderBadge()

  const remote = mode === 'host' || mode === 'guest'
  $('chat-block').hidden = !remote
  $('btn-draw').hidden = !remote || !!gameOverText || !rivalConnected
  $('btn-resign').hidden = !!gameOverText || (remote && !rivalConnected)
  $('btn-rematch').hidden = !gameOverText || (remote && !rivalConnected)
  $('btn-rematch').textContent = mode === 'local' ? '↻ Nueva partida' : sentRematch ? '↻ Revancha pedida…' : '↻ Revancha'
  ;($('btn-rematch') as HTMLButtonElement).disabled = sentRematch

  const bottom = bottomColor()
  if (mode === 'local') {
    $('me-name').textContent = bottom === 'w' ? 'Blancas' : 'Negras'
    $('rival-name').textContent = bottom === 'w' ? 'Negras' : 'Blancas'
  } else {
    $('me-name').textContent = `Tú (${colorName(myColor ?? 'w')})`
    $('rival-name').textContent = `Rival (${colorName(myColor === 'w' ? 'b' : 'w')})`
  }
}

function renderStatus(): void {
  const el = $('status')
  el.classList.remove('good', 'bad')
  if (gameOverText) {
    el.textContent = gameOverText
    return
  }
  if ((mode === 'host' || mode === 'guest') && !rivalConnected) {
    el.textContent = 'El rival se desconectó. Puedes esperar a que vuelva con el mismo enlace o salir.'
    el.classList.add('bad')
    return
  }
  const jaque = chess.inCheck() ? ' — ¡Jaque!' : ''
  if (mode === 'local') {
    el.textContent = `Turno de las ${colorName(chess.turn())}${jaque}`
  } else if (isMyTurn()) {
    el.textContent = `Tu turno${jaque}`
    el.classList.add('good')
  } else {
    el.textContent = `Turno del rival${jaque}`
  }
}

function renderMoves(): void {
  const list = $('moves')
  list.innerHTML = ''
  const history = chess.history()
  for (let i = 0; i < history.length; i += 2) {
    const li = document.createElement('li')
    li.textContent = history[i + 1] ? `${history[i]}  ${history[i + 1]}` : history[i]
    list.appendChild(li)
  }
  list.scrollTop = list.scrollHeight
}

function renderCaptured(): void {
  const byBottom: string[] = []
  const byTop: string[] = []
  const bottom = bottomColor()
  for (const mv of chess.history({ verbose: true }) as Move[]) {
    if (!mv.captured) continue
    ;(mv.color === bottom ? byBottom : byTop).push(GLYPHS[mv.captured])
  }
  $('captured-me').textContent = byBottom.join(' ')
  $('captured-rival').textContent = byTop.join(' ')
}

function renderBadge(): void {
  const badge = $('conn-badge')
  if (!mode) {
    badge.hidden = true
    return
  }
  badge.hidden = false
  if (mode === 'local') {
    badge.textContent = 'Partida local'
    badge.className = 'badge'
  } else if (rivalConnected) {
    badge.textContent = '● Conectado'
    badge.className = 'badge ok'
  } else {
    badge.textContent = '● Sin conexión'
    badge.className = 'badge err'
  }
}

// ---------- Interacción con el tablero ----------
function onSquareClick(sq: Square): void {
  if (!isMyTurn()) return
  const piece = chess.get(sq)

  if (selected && targets.includes(sq)) {
    void tryMove(selected, sq)
    return
  }
  if (piece && piece.color === chess.turn()) {
    selected = sq
    targets = (chess.moves({ square: sq, verbose: true }) as Move[]).map((m) => m.to)
  } else {
    selected = null
    targets = []
  }
  refresh()
}

async function tryMove(from: Square, to: Square): Promise<void> {
  const candidates = (chess.moves({ square: from, verbose: true }) as Move[]).filter((m) => m.to === to)
  if (candidates.length === 0) return
  let promotion: string | undefined
  if (candidates[0].promotion) {
    const choice = await askPromotion()
    if (choice) {
      promotion = choice
    } else {
      selected = null
      targets = []
      refresh()
      return
    }
  }
  applyMove({ from, to, promotion }, true)
}

function applyMove(input: { from: string; to: string; promotion?: string }, sendToRival: boolean): boolean {
  let mv: Move
  try {
    mv = chess.move(input)
  } catch {
    return false
  }
  selected = null
  targets = []
  lastMove = { from: mv.from, to: mv.to }
  beep(mv.captured ? 300 : 480)
  if (sendToRival) net?.send({ type: 'move', from: mv.from, to: mv.to, promotion: mv.promotion })
  checkGameEnd()
  refresh()
  return true
}

function checkGameEnd(): void {
  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? 'b' : 'w'
    let suffix = ''
    if (myColor) suffix = winner === myColor ? ' ¡Ganaste! 🎉' : ' Perdiste.'
    gameOverText = `Jaque mate: ganan las ${colorName(winner)}.${suffix}`
  } else if (chess.isStalemate()) {
    gameOverText = 'Tablas por rey ahogado.'
  } else if (chess.isInsufficientMaterial()) {
    gameOverText = 'Tablas por material insuficiente.'
  } else if (chess.isThreefoldRepetition()) {
    gameOverText = 'Tablas por triple repetición.'
  } else if (chess.isDraw()) {
    gameOverText = 'Tablas por la regla de los 50 movimientos.'
  }
  if (gameOverText) beep(200, 0.3)
}

// ---------- Promoción ----------
function askPromotion(): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = $('promo')
    overlay.hidden = false
    const done = (piece: string | null) => {
      overlay.hidden = true
      overlay.querySelectorAll('button').forEach((b) => (b.onclick = null))
      overlay.onclick = null
      resolve(piece)
    }
    overlay.querySelectorAll<HTMLButtonElement>('button[data-piece]').forEach((btn) => {
      btn.onclick = () => done(btn.dataset.piece ?? 'q')
    })
    overlay.onclick = (ev) => {
      if (ev.target === overlay) done(null)
    }
  })
}

// ---------- Ofertas (tablas / revancha) ----------
function showOffer(kind: 'draw' | 'rematch'): void {
  incomingOffer = kind
  $('offer-bar').hidden = false
  $('offer-text').textContent =
    kind === 'draw' ? 'El rival ofrece tablas.' : 'El rival quiere la revancha.'
}

function hideOffer(): void {
  incomingOffer = null
  $('offer-bar').hidden = true
}

// ---------- Partida ----------
function startGame(color: Color | null): void {
  chess = new Chess()
  myColor = color
  orientation = color ?? 'w'
  selected = null
  targets = []
  lastMove = null
  gameOverText = null
  sentRematch = false
  hideOffer()
  $('chat-log').innerHTML = ''
  showScreen('game')
  refresh()
}

function startRematch(): void {
  const newColor = myColor === 'w' ? 'b' : 'w'
  const keepChat = $('chat-log').innerHTML
  startGame(newColor)
  $('chat-log').innerHTML = keepChat
  addChatLine('Sistema', 'Nueva partida: los colores se intercambian.')
}

function leaveGame(): void {
  net?.destroy()
  net = null
  mode = null
  rivalConnected = false
  hideOffer()
  history.replaceState(null, '', location.pathname)
  showScreen('menu')
  renderBadge()
}

// ---------- Red ----------
function netEvents(onFirstConnect: () => void) {
  return {
    onReady: () => {
      $('wait-status').textContent = 'Listo. En cuanto tu rival abra el enlace, empieza la partida.'
    },
    onConnected: () => {
      rivalConnected = true
      onFirstConnect()
      refresh()
    },
    onMessage: handleMsg,
    onClosed: () => {
      rivalConnected = false
      if (!$('game').hidden) refresh()
    },
    onError: (text: string) => {
      alert(text)
      leaveGame()
    },
  }
}

function handleMsg(msg: NetMsg): void {
  switch (msg.type) {
    case 'start':
      startGame(msg.yourColor)
      break
    case 'move':
      if (mode === 'local' || chess.turn() === myColor) return // no es su turno: ignora
      if (!applyMove({ from: msg.from, to: msg.to, promotion: msg.promotion }, false)) {
        alert('Las partidas quedaron fuera de sincronía. Inicien una nueva partida.')
      }
      break
    case 'resign': {
      const winner = myColor ?? 'w'
      gameOverText = `El rival se rindió: ganan las ${colorName(winner)}. ¡Ganaste! 🎉`
      beep(600, 0.2)
      refresh()
      break
    }
    case 'draw_offer':
      showOffer('draw')
      break
    case 'draw_accept':
      gameOverText = 'Tablas de común acuerdo.'
      refresh()
      break
    case 'draw_decline':
      addChatLine('Sistema', 'El rival rechazó las tablas.')
      break
    case 'rematch':
      if (sentRematch) startRematch()
      else showOffer('rematch')
      break
    case 'rematch_decline':
      sentRematch = false
      addChatLine('Sistema', 'El rival no quiere revancha por ahora.')
      refresh()
      break
    case 'chat':
      addChatLine('Rival', String(msg.text).slice(0, 300))
      beep(700, 0.05)
      break
  }
}

// ---------- Chat ----------
function addChatLine(who: string, text: string): void {
  const log = $('chat-log')
  const line = document.createElement('div')
  line.className = `chat-line ${who === 'Tú' ? 'mine' : who === 'Sistema' ? 'system' : ''}`
  const b = document.createElement('b')
  b.textContent = who === 'Sistema' ? '' : `${who}: `
  line.appendChild(b)
  line.appendChild(document.createTextNode(text))
  log.appendChild(line)
  log.scrollTop = log.scrollHeight
}

// ---------- Flujos de inicio ----------
function hostGame(): void {
  const pref = ($('host-color') as HTMLSelectElement).value
  const color: Color = pref === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : (pref as Color)
  mode = 'host'
  net = NetSession.host(
    netEvents(() => {
      net?.send({ type: 'start', yourColor: color === 'w' ? 'b' : 'w' })
      startGame(color)
    }),
  )
  const link = `${location.origin}${location.pathname}?p=${net.code}`
  $('wait-title').textContent = 'Esperando al rival…'
  $('wait-share').hidden = false
  $('wait-code').textContent = net.code
  ;($('wait-link') as HTMLInputElement).value = link
  $('wait-status').textContent = 'Conectando con el servicio de emparejamiento…'
  showScreen('waiting')
}

function joinGame(code: string): void {
  if (!code.trim()) return
  mode = 'guest'
  net = NetSession.join(
    code,
    netEvents(() => {
      $('wait-status').textContent = 'Conectado. Iniciando partida…'
      // La partida arranca cuando llegue el mensaje "start" del anfitrión.
    }),
  )
  $('wait-title').textContent = `Uniéndote a la partida ${net.code}…`
  $('wait-share').hidden = true
  $('wait-status').textContent = 'Buscando la partida…'
  showScreen('waiting')
}

// ---------- Eventos de UI ----------
$('btn-host').onclick = hostGame
$('btn-join').onclick = () => joinGame(($('join-code') as HTMLInputElement).value)
;($('join-code') as HTMLInputElement).onkeydown = (ev) => {
  if (ev.key === 'Enter') joinGame(($('join-code') as HTMLInputElement).value)
}
$('btn-local').onclick = () => {
  mode = 'local'
  startGame(null)
}
$('btn-cancel-host').onclick = leaveGame
$('btn-copy-link').onclick = async () => {
  const link = ($('wait-link') as HTMLInputElement).value
  try {
    await navigator.clipboard.writeText(link)
    $('btn-copy-link').textContent = '¡Copiado!'
  } catch {
    ;($('wait-link') as HTMLInputElement).select()
    document.execCommand('copy')
    $('btn-copy-link').textContent = '¡Copiado!'
  }
  setTimeout(() => ($('btn-copy-link').textContent = 'Copiar'), 1500)
}

$('btn-flip').onclick = () => {
  orientation = orientation === 'w' ? 'b' : 'w'
  refresh()
}

$('btn-resign').onclick = () => {
  if (gameOverText) return
  if (!confirm('¿Seguro que quieres rendirte?')) return
  if (mode === 'local') {
    const winner = chess.turn() === 'w' ? 'b' : 'w'
    gameOverText = `Las ${colorName(chess.turn())} se rinden: ganan las ${colorName(winner)}.`
  } else {
    net?.send({ type: 'resign' })
    gameOverText = `Te rendiste: ganan las ${colorName(myColor === 'w' ? 'b' : 'w')}.`
  }
  refresh()
}

$('btn-draw').onclick = () => {
  if (gameOverText) return
  net?.send({ type: 'draw_offer' })
  addChatLine('Sistema', 'Ofreciste tablas.')
}

$('btn-rematch').onclick = () => {
  if (mode === 'local') {
    startGame(null)
    return
  }
  sentRematch = true
  net?.send({ type: 'rematch' })
  refresh()
}

$('btn-exit').onclick = () => {
  if (!gameOverText && mode !== 'local' && rivalConnected) {
    if (!confirm('La partida sigue en curso. ¿Salir de todos modos?')) return
    net?.send({ type: 'resign' })
  }
  leaveGame()
}

$('btn-offer-yes').onclick = () => {
  if (incomingOffer === 'draw') {
    net?.send({ type: 'draw_accept' })
    gameOverText = 'Tablas de común acuerdo.'
  } else if (incomingOffer === 'rematch') {
    net?.send({ type: 'rematch' })
    startRematch()
  }
  hideOffer()
  refresh()
}
$('btn-offer-no').onclick = () => {
  if (incomingOffer === 'draw') net?.send({ type: 'draw_decline' })
  else if (incomingOffer === 'rematch') net?.send({ type: 'rematch_decline' })
  hideOffer()
}

$('chat-form').onsubmit = (ev) => {
  ev.preventDefault()
  const input = $('chat-input') as HTMLInputElement
  const text = input.value.trim()
  if (!text) return
  net?.send({ type: 'chat', text })
  addChatLine('Tú', text)
  input.value = ''
}

// ---------- Auto-unirse por enlace (?p=CODIGO) ----------
const joinParam = new URLSearchParams(location.search).get('p')
if (joinParam) {
  ;($('join-code') as HTMLInputElement).value = joinParam.toUpperCase()
  joinGame(joinParam)
} else {
  showScreen('menu')
}
