/** Barra de pestañas inferior — el patrón de navegación nativo en iOS. */

import { NavLink } from 'react-router-dom'

const PESTANAS = [
  { a: '/', texto: 'Mapa', icono: 'M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z' },
  { a: '/escanear', texto: 'Escanear', icono: 'M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4zM7 11h10v2H7v-2z' },
  { a: '/admin', texto: 'Inventario', icono: 'M4 4h16v4H4V4zm0 6h16v4H4v-4zm0 6h16v4H4v-4z' },
  { a: '/etiquetas', texto: 'Etiquetas', icono: 'M12 3c-3 0-5.5 2-5.5 2v14s2.5-2 5.5-2 5.5 2 5.5 2V5S15 3 12 3zm0 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4z' },
]

export function BarraNavegacion() {
  return (
    <nav className="nav" aria-label="Navegación principal">
      {PESTANAS.map((p) => (
        <NavLink
          key={p.a}
          to={p.a}
          // `end` solo en la raíz: si no, "Mapa" quedaría activo en todas las rutas.
          end={p.a === '/'}
          className={({ isActive }) => (isActive ? 'activo' : '')}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d={p.icono} />
          </svg>
          {p.texto}
        </NavLink>
      ))}
    </nav>
  )
}
