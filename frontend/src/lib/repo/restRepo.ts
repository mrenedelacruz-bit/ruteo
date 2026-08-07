/**
 * Repositorio contra la API FastAPI (`backend/`).
 *
 * Detalle propio del trabajo en campo: las auditorías de presencia se hacen en
 * sótanos, almacenes y patios, justo donde no hay señal. Si una auditoría
 * fallara por red se perdería el recorrido completo del inspector. Por eso este
 * repositorio guarda las auditorías fallidas en un "outbox" en `localStorage` y
 * las reintenta cuando vuelve la conexión.
 *
 * (Background Sync resolvería esto en el service worker, pero WebKit no lo
 * implementa: en iPhone hay que reintentar desde la propia página.)
 */

import { API_BASE } from '../../config'
import type {
  Auditoria,
  AuditoriaNueva,
  BienCambios,
  BienMueble,
  BienNuevo,
  CategoriaBien,
  RespuestaAuditoria,
} from '../../types'
import { validarNCF } from '../ncf'
import {
  BienNoEncontradoError,
  ErrorApi,
  type FiltrosBienes,
  type Repositorio,
} from './tipos'

const CLAVE_OUTBOX = 'bienes-nfc:outbox'

interface PendienteOutbox {
  ncf: string
  datos: AuditoriaNueva
  encoladoEn: string
}

/** Envoltura de `fetch` que convierte errores HTTP en excepciones del dominio. */
async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  let respuesta: Response
  try {
    respuesta = await fetch(`${API_BASE}${ruta}`, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', ...(opciones.headers ?? {}) },
    })
  } catch {
    throw new ErrorApi('Sin conexión con el servidor. Verifique la red e intente de nuevo.')
  }

  if (respuesta.status === 404) {
    throw new BienNoEncontradoError(ruta.split('/').pop() ?? '')
  }
  if (!respuesta.ok) {
    // FastAPI devuelve {"detail": ...}; puede ser texto o lista de errores.
    const cuerpo = await respuesta.json().catch(() => null)
    const detalle = cuerpo?.detail
    const mensaje =
      typeof detalle === 'string'
        ? detalle
        : Array.isArray(detalle)
          ? detalle.map((d: { msg?: string }) => d.msg).filter(Boolean).join('; ')
          : `Error ${respuesta.status} al llamar a la API.`
    throw new ErrorApi(mensaje, respuesta.status)
  }

  if (respuesta.status === 204) return undefined as T
  return (await respuesta.json()) as T
}

export class RestRepo implements Repositorio {
  async listar(filtros: FiltrosBienes = {}): Promise<BienMueble[]> {
    const qs = new URLSearchParams()
    if (filtros.estado) qs.set('estado', filtros.estado)
    if (filtros.categoria) qs.set('categoria', filtros.categoria)
    if (filtros.usuario) qs.set('usuario', filtros.usuario)
    if (filtros.soloGeolocalizados) qs.set('solo_geolocalizados', 'true')
    const cola = qs.toString()
    return pedir<BienMueble[]>(`/bienes${cola ? `?${cola}` : ''}`)
  }

  async obtener(ncf: string): Promise<BienMueble> {
    return pedir<BienMueble>(`/bienes/${validarNCF(ncf)}`)
  }

  async crear(datos: BienNuevo): Promise<BienMueble> {
    return pedir<BienMueble>('/bienes', { method: 'POST', body: JSON.stringify(datos) })
  }

  async actualizar(ncf: string, cambios: BienCambios): Promise<BienMueble> {
    return pedir<BienMueble>(`/bienes/${validarNCF(ncf)}`, {
      method: 'PATCH',
      body: JSON.stringify(cambios),
    })
  }

  async eliminar(ncf: string): Promise<void> {
    await pedir<void>(`/bienes/${validarNCF(ncf)}`, { method: 'DELETE' })
  }

  async actualizarUbicacion(
    ncf: string,
    posicion: { latitud: number; longitud: number; precisionM?: number | null; usuario?: string },
  ): Promise<BienMueble> {
    return pedir<BienMueble>(`/bienes/${validarNCF(ncf)}/ubicacion`, {
      method: 'PUT',
      body: JSON.stringify({
        latitud: posicion.latitud,
        longitud: posicion.longitud,
        precision_gps_m: posicion.precisionM ?? null,
        usuario: posicion.usuario ?? null,
      }),
    })
  }

  async registrarAuditoria(ncf: string, datos: AuditoriaNueva): Promise<RespuestaAuditoria> {
    const canonico = validarNCF(ncf)
    try {
      const resultado = await pedir<RespuestaAuditoria>(`/bienes/${canonico}/auditorias`, {
        method: 'POST',
        body: JSON.stringify(datos),
      })
      // Aprovecha que hay red para vaciar lo que quedó pendiente antes.
      void this.vaciarOutbox()
      return resultado
    } catch (error) {
      // Solo se encola por caída de red. Un 404 o un 422 no mejoran reintentando.
      if (error instanceof ErrorApi && error.estadoHttp === undefined) {
        encolar({ ncf: canonico, datos, encoladoEn: new Date().toISOString() })
      }
      throw error
    }
  }

  async historial(ncf: string, limite = 50): Promise<Auditoria[]> {
    return pedir<Auditoria[]>(`/bienes/${validarNCF(ncf)}/auditorias?limite=${limite}`)
  }

  async siguienteNCF(categoria: CategoriaBien): Promise<string> {
    const r = await pedir<{ ncf: string }>(
      `/ncf/preview?categoria=${encodeURIComponent(categoria)}`,
    )
    return r.ncf
  }

  /**
   * Reintenta las auditorías encoladas. Se llama al recuperar la conexión y
   * tras cada envío exitoso.
   *
   * @returns cuántas logró enviar.
   */
  async vaciarOutbox(): Promise<number> {
    const pendientes = leerOutbox()
    if (pendientes.length === 0) return 0

    const quedan: PendienteOutbox[] = []
    let enviadas = 0
    for (const p of pendientes) {
      try {
        await pedir<RespuestaAuditoria>(`/bienes/${p.ncf}/auditorias`, {
          method: 'POST',
          body: JSON.stringify({
            ...p.datos,
            nota: [p.datos.nota, `(registrada sin conexión el ${p.encoladoEn})`]
              .filter(Boolean)
              .join(' '),
          }),
        })
        enviadas++
      } catch (error) {
        // Sigue sin red: se conserva. Error definitivo del servidor: se descarta
        // para no reintentar por siempre algo que nunca va a entrar.
        if (error instanceof ErrorApi && error.estadoHttp === undefined) quedan.push(p)
      }
    }
    escribirOutbox(quedan)
    return enviadas
  }
}

// --------------------------------------------------------------------------- //
// Outbox                                                                      //
// --------------------------------------------------------------------------- //
export function leerOutbox(): PendienteOutbox[] {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_OUTBOX) ?? '[]') as PendienteOutbox[]
  } catch {
    return []
  }
}

function escribirOutbox(pendientes: PendienteOutbox[]): void {
  localStorage.setItem(CLAVE_OUTBOX, JSON.stringify(pendientes))
}

function encolar(pendiente: PendienteOutbox): void {
  escribirOutbox([...leerOutbox(), pendiente])
}
