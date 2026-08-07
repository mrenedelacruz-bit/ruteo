/**
 * Selector de repositorio.
 *
 * Único punto del código que decide contra qué fuente de datos se trabaja.
 * Los componentes importan `repo` y no saben —ni deben saber— si detrás hay una
 * API REST o `localStorage`.
 */

import { MODO_LOCAL } from '../../config'
import { LocalRepo } from './localRepo'
import { RestRepo } from './restRepo'
import type { Repositorio } from './tipos'

export const repo: Repositorio = MODO_LOCAL ? new LocalRepo() : new RestRepo()

/** Reintenta las auditorías encoladas sin conexión (solo aplica en modo REST). */
export async function vaciarOutbox(): Promise<number> {
  return repo instanceof RestRepo ? repo.vaciarOutbox() : 0
}

export { leerOutbox } from './restRepo'
export * from './tipos'
