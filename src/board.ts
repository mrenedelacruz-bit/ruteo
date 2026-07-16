import type { Chess, Color, PieceSymbol, Square } from 'chess.js'

// Glifos rellenos para ambos colores; el color real se da por CSS (.piece-w / .piece-b)
const GLYPHS: Record<PieceSymbol, string> = {
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const

export interface BoardState {
  chess: Chess
  orientation: Color
  selected: Square | null
  targets: Square[]
  lastMove: { from: Square; to: Square } | null
  checkSquare: Square | null
}

export class BoardView {
  private el: HTMLElement
  onSquareClick: ((sq: Square) => void) | null = null

  constructor(el: HTMLElement) {
    this.el = el
    this.el.addEventListener('click', (ev) => {
      const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-square]')
      if (target && this.onSquareClick) this.onSquareClick(target.dataset.square as Square)
    })
  }

  render(state: BoardState): void {
    const { chess, orientation, selected, targets, lastMove, checkSquare } = state
    const targetSet = new Set<string>(targets)
    this.el.innerHTML = ''
    this.el.classList.toggle('flipped', orientation === 'b')

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const file = orientation === 'w' ? col : 7 - col
        const rank = orientation === 'w' ? 8 - row : row + 1
        const sq = `${FILES[file]}${rank}` as Square
        const piece = chess.get(sq)

        const div = document.createElement('div')
        div.dataset.square = sq
        div.className = `square ${(file + rank) % 2 === 0 ? 'dark' : 'light'}`
        if (selected === sq) div.classList.add('selected')
        if (lastMove && (lastMove.from === sq || lastMove.to === sq)) div.classList.add('last-move')
        if (checkSquare === sq) div.classList.add('in-check')
        if (targetSet.has(sq)) div.classList.add(piece ? 'target-capture' : 'target')

        if (col === 0) {
          const lbl = document.createElement('span')
          lbl.className = 'coord rank'
          lbl.textContent = String(rank)
          div.appendChild(lbl)
        }
        if (row === 7) {
          const lbl = document.createElement('span')
          lbl.className = 'coord file'
          lbl.textContent = FILES[file]
          div.appendChild(lbl)
        }

        if (piece) {
          const span = document.createElement('span')
          span.className = `piece piece-${piece.color}`
          span.textContent = GLYPHS[piece.type]
          div.appendChild(span)
        }
        this.el.appendChild(div)
      }
    }
  }
}

/** Casilla del rey del color indicado, o null si no está (posiciones de prueba). */
export function kingSquare(chess: Chess, color: Color): Square | null {
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.type === 'k' && cell.color === color) return cell.square
    }
  }
  return null
}
