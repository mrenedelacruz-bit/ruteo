/**
 * Tipos del dominio. Son el espejo de los esquemas Pydantic del backend
 * (`backend/app/schemas/bien.py`); si cambia uno, cambia el otro.
 *
 * Los valores de los enums son las cadenas exactas que viajan en el JSON, no
 * códigos internos: así el payload de la API es legible en el inspector de red.
 */

export const ESTADOS = ['Bueno', 'Regular', 'En Reparación', 'Baja'] as const
export type EstadoBien = (typeof ESTADOS)[number]

export const CATEGORIAS = [
  'Mobiliario',
  'Equipo de Cómputo',
  'Equipo de Oficina',
  'Vehículo',
  'Maquinaria',
  'Otro',
] as const
export type CategoriaBien = (typeof CATEGORIAS)[number]

/** Código de 3 letras que cada categoría aporta al NCF. Debe coincidir con `enums.py`. */
export const CODIGO_CATEGORIA: Record<CategoriaBien, string> = {
  Mobiliario: 'MOB',
  'Equipo de Cómputo': 'EQC',
  'Equipo de Oficina': 'EQO',
  Vehículo: 'VEH',
  Maquinaria: 'MAQ',
  Otro: 'OTR',
}

export type TipoEvento =
  | 'Alta'
  | 'Lectura NFC'
  | 'Auditoría de presencia'
  | 'Actualización de ubicación'
  | 'Cambio de estado'

export interface BienMueble {
  id: number
  ncf: string
  nombre: string
  descripcion: string | null
  categoria: CategoriaBien
  estado: EstadoBien
  latitud: number | null
  longitud: number | null
  precision_gps_m: number | null
  usuario_asignado: string | null
  ubicacion_descriptiva: string | null
  foto_url: string | null
  fecha_ultima_lectura: string | null
  creado_en: string
  actualizado_en: string
  /** URL que debe grabarse en la etiqueta NFC física de este bien. */
  url_etiqueta: string | null
}

export interface Auditoria {
  id: number
  bien_id: number
  ncf: string
  tipo: TipoEvento
  latitud: number | null
  longitud: number | null
  precision_gps_m: number | null
  usuario: string | null
  nota: string | null
  registrado_en: string
}

/** Alta de un bien. Sin `ncf`: lo genera el servidor. */
export interface BienNuevo {
  nombre: string
  descripcion?: string | null
  categoria: CategoriaBien
  estado: EstadoBien
  latitud?: number | null
  longitud?: number | null
  precision_gps_m?: number | null
  usuario_asignado?: string | null
  ubicacion_descriptiva?: string | null
  foto_url?: string | null
}

export type BienCambios = Partial<Omit<BienNuevo, 'categoria' | 'estado'>> & {
  categoria?: CategoriaBien
  estado?: EstadoBien
}

/** Cuerpo de una auditoría de presencia hecha en campo. */
export interface AuditoriaNueva {
  tipo?: TipoEvento
  latitud?: number | null
  longitud?: number | null
  precision_gps_m?: number | null
  usuario?: string | null
  nota?: string | null
  /** Si es true y hay coordenadas, además mueve el pin del bien. */
  sincronizar_ubicacion?: boolean
}

export interface RespuestaAuditoria {
  evento: Auditoria
  bien: BienMueble
}
