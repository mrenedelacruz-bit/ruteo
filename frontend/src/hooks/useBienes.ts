/**
 * Hooks de acceso a datos.
 *
 * Deliberadamente sin React Query ni SWR: el volumen de datos es pequeño y las
 * pantallas son cuatro. Un `useState` + `useEffect` bien acotados evitan una
 * dependencia que habría que mantener, y dejan explícito cuándo se recarga.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import type { BienMueble } from '../types'
import { repo, type FiltrosBienes } from '../lib/repo'

interface EstadoCarga<T> {
  datos: T
  cargando: boolean
  error: string | null
}

/** Mensaje presentable a partir de cualquier excepción. */
export function mensajeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.'
}

/** Listado de bienes con filtros. `recargar()` fuerza una relectura. */
export function useBienes(filtros: FiltrosBienes = {}) {
  const [estado, setEstado] = useState<EstadoCarga<BienMueble[]>>({
    datos: [],
    cargando: true,
    error: null,
  })

  // Los filtros llegan como objeto nuevo en cada render; se comparan por su
  // forma serializada para no disparar un bucle infinito de efectos.
  const claveFiltros = JSON.stringify(filtros)
  const filtrosRef = useRef(filtros)
  filtrosRef.current = filtros

  const recargar = useCallback(async () => {
    setEstado((s) => ({ ...s, cargando: true, error: null }))
    try {
      const datos = await repo.listar(filtrosRef.current)
      setEstado({ datos, cargando: false, error: null })
    } catch (error) {
      setEstado({ datos: [], cargando: false, error: mensajeError(error) })
    }
  }, [])

  useEffect(() => {
    void recargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveFiltros, recargar])

  return { ...estado, recargar, setBienes: (datos: BienMueble[]) => setEstado((s) => ({ ...s, datos })) }
}

/** Ficha individual por NCF. Es lo que consume la vista del escaneo NFC. */
export function useBien(ncf: string | undefined) {
  const [estado, setEstado] = useState<EstadoCarga<BienMueble | null>>({
    datos: null,
    cargando: true,
    error: null,
  })

  const recargar = useCallback(async () => {
    if (!ncf) {
      setEstado({ datos: null, cargando: false, error: 'No se indicó ningún código NCF.' })
      return
    }
    setEstado((s) => ({ ...s, cargando: true, error: null }))
    try {
      const datos = await repo.obtener(ncf)
      setEstado({ datos, cargando: false, error: null })
    } catch (error) {
      setEstado({ datos: null, cargando: false, error: mensajeError(error) })
    }
  }, [ncf])

  useEffect(() => {
    void recargar()
  }, [recargar])

  /** Sustituye la ficha en memoria tras una escritura, sin volver a pedirla. */
  const fijar = useCallback((bien: BienMueble) => {
    setEstado({ datos: bien, cargando: false, error: null })
  }, [])

  return { ...estado, recargar, fijar }
}

/** `true` mientras el navegador se reporta en línea. */
export function useEnLinea(): boolean {
  const [enLinea, setEnLinea] = useState(navigator.onLine)
  useEffect(() => {
    const alCambiar = () => setEnLinea(navigator.onLine)
    window.addEventListener('online', alCambiar)
    window.addEventListener('offline', alCambiar)
    return () => {
      window.removeEventListener('online', alCambiar)
      window.removeEventListener('offline', alCambiar)
    }
  }, [])
  return enLinea
}
