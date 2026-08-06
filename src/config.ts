import type { Role } from './types'

export const ROLE_LABELS: Record<Role, string> = {
  VENDEDOR: 'Vendedor / Asesor de ruta',
  SUPERVISOR: 'Supervisor de ventas',
  GERENTE_COMERCIAL: 'Gerente comercial',
  CREDITO: 'Crédito y cobranza',
  GERENCIA_GENERAL: 'Gerencia general',
}

export const ROLES: Role[] = [
  'VENDEDOR',
  'SUPERVISOR',
  'GERENTE_COMERCIAL',
  'CREDITO',
  'GERENCIA_GENERAL',
]

/**
 * Matriz de aprobación de descuentos, por niveles (patrón SAP Ariba / SAP SD):
 * el primer tramo cuyo `max` cubre el % pedido define quién aprueba.
 * `aprobador: null` = auto-aprobado, no requiere intervención.
 */
export const MATRIZ_DESCUENTO: { max: number; aprobador: Role | null }[] = [
  { max: 5, aprobador: null },
  { max: 10, aprobador: 'SUPERVISOR' },
  { max: 100, aprobador: 'GERENTE_COMERCIAL' },
]

/**
 * Comité de crédito: aprobación en paralelo — todos sus miembros deben
 * aprobar el límite y plazo; un solo rechazo cierra la solicitud.
 */
export const COMITE_CREDITO: Role[] = [
  'CREDITO',
  'GERENTE_COMERCIAL',
  'GERENCIA_GENERAL',
]

export const RUTAS = [
  'Ruta 1 — Distrito Nacional',
  'Ruta 2 — Santo Domingo Norte',
  'Ruta 3 — Santo Domingo Este',
  'Ruta 4 — Santo Domingo Oeste',
  'Ruta 5 — Cibao',
  'Ruta 6 — Región Este',
  'Ruta 7 — Región Sur',
]

export const TIPOS_NEGOCIO = [
  'Taller mecánico',
  'Venta de repuestos',
  'Estación de combustible',
  'Flota / transporte',
  'Colmado / detallista',
  'Industrial',
  'Otro',
]

export const PLAZOS_DIAS = [15, 30, 45, 60]
