/**
 * Raíz de la aplicación: enrutado y estructura común.
 *
 * Se usa `BrowserRouter` y no `HashRouter` porque la URL grabada en la etiqueta
 * tiene que ser limpia (`/activo/NCF-…`, no `/#/activo/NCF-…`): cada carácter
 * cuenta en una NTAG213 y, sobre todo, algunos lectores y validadores de NDEF
 * tratan el fragmento de forma inconsistente. El precio es que el servidor debe
 * devolver el index.html en cualquier ruta; en GitHub Pages eso lo resuelve la
 * copia `404.html` que genera `scripts/postbuild.mjs`.
 */

import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { BarraNavegacion } from './components/BarraNavegacion'
import { BASE_URL, MODO_LOCAL } from './config'
import { useEnLinea } from './hooks/useBienes'
import { leerOutbox, vaciarOutbox } from './lib/repo'
import { ActivoPage } from './pages/ActivoPage'
import { AdminPage } from './pages/AdminPage'
import { EscanearPage } from './pages/EscanearPage'
import { EtiquetasPage } from './pages/EtiquetasPage'
import { MapaPage } from './pages/MapaPage'

/** Cinta superior con el estado de conexión y del almacenamiento. */
function Cinta() {
  const enLinea = useEnLinea()
  const pendientes = leerOutbox().length

  if (!enLinea) {
    return (
      <div className="cinta">
        Sin conexión — las auditorías se guardan y se envían al recuperar la señal
        {pendientes > 0 ? ` (${pendientes} en espera)` : ''}
      </div>
    )
  }
  if (pendientes > 0) {
    return <div className="cinta">{pendientes} auditoría(s) pendiente(s) de sincronizar</div>
  }
  if (MODO_LOCAL) {
    return (
      <div className="cinta">
        Modo local — los datos se guardan solo en este navegador
      </div>
    )
  }
  return null
}

export function App() {
  const enLinea = useEnLinea()

  // Al recuperar la conexión se reintenta lo que quedó encolado. WebKit no
  // implementa Background Sync, así que este es el único momento fiable.
  useEffect(() => {
    if (enLinea) void vaciarOutbox()
  }, [enLinea])

  return (
    // `basename` viene de Vite: '/ruteo/' en Pages, '/' en un dominio propio.
    <BrowserRouter basename={BASE_URL}>
      <div className="app">
        <Cinta />
        <main className="contenido">
          <Routes>
            <Route path="/" element={<MapaPage />} />
            {/* La ruta que abre el escaneo NFC del iPhone. */}
            <Route path="/activo/:ncf" element={<ActivoPage />} />
            <Route path="/escanear" element={<EscanearPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/etiquetas" element={<EtiquetasPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <BarraNavegacion />
      </div>
    </BrowserRouter>
  )
}
