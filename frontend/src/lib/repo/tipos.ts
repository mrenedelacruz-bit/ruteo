/**
 * Contrato del repositorio de datos.
 *
 * Toda la UI habla contra esta interfaz y nunca contra `fetch` ni contra
 * `localStorage`. Gracias a eso conviven dos implementaciones intercambiables
 * (REST y navegador) y mañana cabría una tercera —Supabase, Firebase— sin tocar
 * un solo componente.
 */

import type {
  Auditoria,
  AuditoriaNueva,
  BienCambios,
  BienMueble,
  BienNuevo,
  CategoriaBien,
  EstadoBien,
  RespuestaAuditoria,
} from '../../types'

export interface FiltrosBienes {
  estado?: EstadoBien
  categoria?: CategoriaBien
  usuario?: string
  soloGeolocalizados?: boolean
}

export interface Repositorio {
  listar(filtros?: FiltrosBienes): Promise<BienMueble[]>
  obtener(ncf: string): Promise<BienMueble>
  crear(datos: BienNuevo): Promise<BienMueble>
  actualizar(ncf: string, cambios: BienCambios): Promise<BienMueble>
  eliminar(ncf: string): Promise<void>

  /** Fija la posición del bien con la lectura GPS del teléfono. */
  actualizarUbicacion(
    ncf: string,
    posicion: { latitud: number; longitud: number; precisionM?: number | null; usuario?: string },
  ): Promise<BienMueble>

  /** Auditoría de presencia: el flujo que dispara el escaneo NFC. */
  registrarAuditoria(ncf: string, datos: AuditoriaNueva): Promise<RespuestaAuditoria>

  historial(ncf: string, limite?: number): Promise<Auditoria[]>

  /** Próximo NCF libre de la categoría, para grabar la etiqueta antes del alta. */
  siguienteNCF(categoria: CategoriaBien): Promise<string>
}

/** El NCF es válido pero no hay ningún bien registrado con él. */
export class BienNoEncontradoError extends Error {
  constructor(readonly ncf: string) {
    super(`No hay ningún bien registrado con el código ${ncf}.`)
  }
}

/** Fallo de transporte o error devuelto por la API. */
export class ErrorApi extends Error {
  constructor(
    mensaje: string,
    readonly estadoHttp?: number,
  ) {
    super(mensaje)
  }
}
