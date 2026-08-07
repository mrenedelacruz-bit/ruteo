/**
 * Repositorio sobre `localStorage`.
 *
 * Para qué sirve: publicar la PWA en un hosting estático (GitHub Pages) y que
 * sea plenamente usable —alta de bienes, mapa, escaneo, auditoría— sin
 * levantar ningún servidor. Es también el modo con el que se prueba el flujo
 * NFC completo en un iPhone real antes de desplegar infraestructura.
 *
 * Qué NO es: multiusuario. Los datos viven en un solo navegador y no se
 * sincronizan. Para inventario compartido hay que apuntar `VITE_API_BASE` al
 * backend FastAPI.
 */

import { URL_PUBLICA } from '../../config'
import type {
  Auditoria,
  AuditoriaNueva,
  BienCambios,
  BienMueble,
  BienNuevo,
  CategoriaBien,
  RespuestaAuditoria,
} from '../../types'
import { generarNCF, urlEtiqueta, validarNCF } from '../ncf'
import { BienNoEncontradoError, type FiltrosBienes, type Repositorio } from './tipos'

const CLAVE_BIENES = 'bienes-nfc:bienes'
const CLAVE_AUDITORIAS = 'bienes-nfc:auditorias'
const CLAVE_SEMBRADO = 'bienes-nfc:sembrado'

// --------------------------------------------------------------------------- //
// Persistencia primitiva                                                      //
// --------------------------------------------------------------------------- //
function leer<T>(clave: string): T[] {
  try {
    const crudo = localStorage.getItem(clave)
    return crudo ? (JSON.parse(crudo) as T[]) : []
  } catch {
    // Modo privado de Safari o JSON corrupto: se empieza de cero en vez de
    // romper la app entera.
    return []
  }
}

function escribir<T>(clave: string, valores: T[]): void {
  localStorage.setItem(clave, JSON.stringify(valores))
}

const ahora = () => new Date().toISOString()

/** Añade la URL de etiqueta, que en el backend es un campo calculado. */
function conUrl(bien: BienMueble): BienMueble {
  return { ...bien, url_etiqueta: urlEtiqueta(bien.ncf, URL_PUBLICA) }
}

// --------------------------------------------------------------------------- //
// Datos de ejemplo                                                            //
// --------------------------------------------------------------------------- //
const SEMILLA: BienNuevo[] = [
  {
    nombre: 'Escritorio ejecutivo en L',
    descripcion: 'Madera de caoba, 1.80 m. Oficina de Dirección.',
    categoria: 'Mobiliario',
    estado: 'Bueno',
    latitud: 18.4721,
    longitud: -69.9312,
    usuario_asignado: 'Dirección General',
    ubicacion_descriptiva: 'Torre A — Piso 5',
  },
  {
    nombre: 'Laptop Dell Latitude 5440',
    descripcion: 'Serie DL5440-2291. Asignada a Contabilidad.',
    categoria: 'Equipo de Cómputo',
    estado: 'Bueno',
    latitud: 18.4695,
    longitud: -69.9385,
    usuario_asignado: 'Contabilidad',
    ubicacion_descriptiva: 'Torre A — Piso 3',
  },
  {
    nombre: 'Aire acondicionado 24.000 BTU',
    descripcion: 'Compresor con ruido intermitente; reportado a mantenimiento.',
    categoria: 'Equipo de Oficina',
    estado: 'En Reparación',
    latitud: 18.4762,
    longitud: -69.9271,
    usuario_asignado: 'Mantenimiento',
    ubicacion_descriptiva: 'Almacén — Nave 2',
  },
  {
    nombre: 'Camioneta Toyota Hilux 2019',
    descripcion: 'Placa L-000000. Uso de supervisión de campo.',
    categoria: 'Vehículo',
    estado: 'Regular',
    latitud: 18.4832,
    longitud: -69.9425,
    usuario_asignado: 'Operaciones',
    ubicacion_descriptiva: 'Parqueo exterior',
  },
  {
    nombre: 'Planta eléctrica 60 kVA',
    descripcion: 'Fuera de servicio, pendiente de desincorporación.',
    categoria: 'Maquinaria',
    estado: 'Baja',
    latitud: 18.4658,
    longitud: -69.9498,
    usuario_asignado: 'Mantenimiento',
    ubicacion_descriptiva: 'Patio trasero',
  },
  {
    nombre: 'Archivador metálico 4 gavetas',
    descripcion: 'Sin novedad en la última auditoría.',
    categoria: 'Mobiliario',
    estado: 'Bueno',
    latitud: 18.4707,
    longitud: -69.934,
    usuario_asignado: 'Recursos Humanos',
    ubicacion_descriptiva: 'Torre A — Piso 2',
  },
]

// --------------------------------------------------------------------------- //
// Implementación                                                              //
// --------------------------------------------------------------------------- //
export class LocalRepo implements Repositorio {
  constructor() {
    this.sembrarUnaVez()
  }

  /** Siembra ejemplos la primera vez. La bandera aparte respeta un borrado total. */
  private sembrarUnaVez(): void {
    if (localStorage.getItem(CLAVE_SEMBRADO)) return
    localStorage.setItem(CLAVE_SEMBRADO, ahora())
    if (leer<BienMueble>(CLAVE_BIENES).length > 0) return

    // Se acumula en memoria y se escribe una sola vez. Llamar a `crear()` en un
    // bucle no serviría: cada llamada relee localStorage al empezar, así que
    // varias altas seguidas parten todas del mismo estado inicial y solo
    // sobrevive la última.
    const bienes: BienMueble[] = []
    const eventos: Auditoria[] = []
    for (const ejemplo of SEMILLA) {
      bienes.push(this.construir(ejemplo, bienes, eventos))
    }
    escribir(CLAVE_BIENES, bienes)
    escribir(CLAVE_AUDITORIAS, eventos)
  }

  private bienes(): BienMueble[] {
    return leer<BienMueble>(CLAVE_BIENES)
  }

  private auditorias(): Auditoria[] {
    return leer<Auditoria>(CLAVE_AUDITORIAS)
  }

  private registrarEvento(evento: Omit<Auditoria, 'id' | 'registrado_en'>): Auditoria {
    const lista = this.auditorias()
    const nuevo: Auditoria = {
      ...evento,
      id: lista.reduce((max, e) => Math.max(max, e.id), 0) + 1,
      registrado_en: ahora(),
    }
    escribir(CLAVE_AUDITORIAS, [...lista, nuevo])
    return nuevo
  }

  /** Guarda el bien modificado y lo devuelve ya normalizado. */
  private guardar(bien: BienMueble): BienMueble {
    escribir(
      CLAVE_BIENES,
      this.bienes().map((b) => (b.ncf === bien.ncf ? bien : b)),
    )
    return conUrl(bien)
  }

  async listar(filtros: FiltrosBienes = {}): Promise<BienMueble[]> {
    return this.bienes()
      .filter((b) => !filtros.estado || b.estado === filtros.estado)
      .filter((b) => !filtros.categoria || b.categoria === filtros.categoria)
      .filter((b) => !filtros.usuario || b.usuario_asignado === filtros.usuario)
      .filter((b) => !filtros.soloGeolocalizados || b.latitud !== null)
      .sort((a, b) => b.creado_en.localeCompare(a.creado_en))
      .map(conUrl)
  }

  async obtener(ncf: string): Promise<BienMueble> {
    const canonico = validarNCF(ncf)
    const bien = this.bienes().find((b) => b.ncf === canonico)
    if (!bien) throw new BienNoEncontradoError(canonico)
    return conUrl(bien)
  }

  /** Primer correlativo de la categoría que no choque con `existentes`. */
  private proximoNCF(categoria: CategoriaBien, existentes: Set<string>): string {
    for (let secuencia = 1; secuencia <= 9999; secuencia++) {
      const candidato = generarNCF(categoria, secuencia)
      if (!existentes.has(candidato)) return candidato
    }
    throw new Error('Se agotaron los correlativos del mes para esta categoría.')
  }

  async siguienteNCF(categoria: CategoriaBien): Promise<string> {
    return this.proximoNCF(categoria, new Set(this.bienes().map((b) => b.ncf)))
  }

  /**
   * Construye el bien y su evento de alta **contra las listas que se le pasan**,
   * no contra localStorage. Así el llamador controla cuándo se persiste y puede
   * encadenar varias altas sin que se pisen entre sí.
   */
  private construir(
    datos: BienNuevo,
    bienes: BienMueble[],
    eventos: Auditoria[],
  ): BienMueble {
    const bien: BienMueble = {
      id: bienes.reduce((max, b) => Math.max(max, b.id), 0) + 1,
      ncf: this.proximoNCF(datos.categoria, new Set(bienes.map((b) => b.ncf))),
      nombre: datos.nombre,
      descripcion: datos.descripcion ?? null,
      categoria: datos.categoria,
      estado: datos.estado,
      latitud: datos.latitud ?? null,
      longitud: datos.longitud ?? null,
      precision_gps_m: datos.precision_gps_m ?? null,
      usuario_asignado: datos.usuario_asignado ?? null,
      ubicacion_descriptiva: datos.ubicacion_descriptiva ?? null,
      foto_url: datos.foto_url ?? null,
      fecha_ultima_lectura: null,
      creado_en: ahora(),
      actualizado_en: ahora(),
      url_etiqueta: null,
    }

    eventos.push({
      id: eventos.reduce((max, e) => Math.max(max, e.id), 0) + 1,
      bien_id: bien.id,
      ncf: bien.ncf,
      tipo: 'Alta',
      latitud: bien.latitud,
      longitud: bien.longitud,
      precision_gps_m: bien.precision_gps_m,
      usuario: bien.usuario_asignado,
      nota: 'Alta en inventario',
      registrado_en: ahora(),
    })

    return bien
  }

  async crear(datos: BienNuevo): Promise<BienMueble> {
    const bienes = this.bienes()
    const eventos = this.auditorias()
    const bien = this.construir(datos, bienes, eventos)

    escribir(CLAVE_BIENES, [...bienes, bien])
    escribir(CLAVE_AUDITORIAS, eventos)
    return conUrl(bien)
  }

  async actualizar(ncf: string, cambios: BienCambios): Promise<BienMueble> {
    const actual = await this.obtener(ncf)
    const estadoPrevio = actual.estado
    const actualizado: BienMueble = { ...actual, ...cambios, actualizado_en: ahora() }
    const guardado = this.guardar(actualizado)

    if (cambios.estado && cambios.estado !== estadoPrevio) {
      this.registrarEvento({
        bien_id: guardado.id,
        ncf: guardado.ncf,
        tipo: 'Cambio de estado',
        latitud: null,
        longitud: null,
        precision_gps_m: null,
        usuario: guardado.usuario_asignado,
        nota: `${estadoPrevio} → ${cambios.estado}`,
      })
    }
    return guardado
  }

  async eliminar(ncf: string): Promise<void> {
    const canonico = validarNCF(ncf)
    escribir(
      CLAVE_BIENES,
      this.bienes().filter((b) => b.ncf !== canonico),
    )
    // La bitácora se conserva a propósito: es el rastro de auditoría.
  }

  async actualizarUbicacion(
    ncf: string,
    posicion: { latitud: number; longitud: number; precisionM?: number | null; usuario?: string },
  ): Promise<BienMueble> {
    const actual = await this.obtener(ncf)
    const guardado = this.guardar({
      ...actual,
      latitud: posicion.latitud,
      longitud: posicion.longitud,
      precision_gps_m: posicion.precisionM ?? null,
      actualizado_en: ahora(),
    })

    this.registrarEvento({
      bien_id: guardado.id,
      ncf: guardado.ncf,
      tipo: 'Actualización de ubicación',
      latitud: posicion.latitud,
      longitud: posicion.longitud,
      precision_gps_m: posicion.precisionM ?? null,
      usuario: posicion.usuario ?? null,
      nota: 'Ubicación sincronizada desde GPS del dispositivo',
    })
    return guardado
  }

  async registrarAuditoria(ncf: string, datos: AuditoriaNueva): Promise<RespuestaAuditoria> {
    const actual = await this.obtener(ncf)
    const tieneCoords = datos.latitud != null && datos.longitud != null
    const sincroniza = Boolean(datos.sincronizar_ubicacion) && tieneCoords

    const bien = this.guardar({
      ...actual,
      latitud: sincroniza ? datos.latitud! : actual.latitud,
      longitud: sincroniza ? datos.longitud! : actual.longitud,
      precision_gps_m: sincroniza ? (datos.precision_gps_m ?? null) : actual.precision_gps_m,
      fecha_ultima_lectura: ahora(),
      actualizado_en: ahora(),
    })

    const evento = this.registrarEvento({
      bien_id: bien.id,
      ncf: bien.ncf,
      tipo: datos.tipo ?? 'Auditoría de presencia',
      latitud: datos.latitud ?? null,
      longitud: datos.longitud ?? null,
      precision_gps_m: datos.precision_gps_m ?? null,
      usuario: datos.usuario ?? null,
      nota: datos.nota ?? null,
    })
    return { evento, bien }
  }

  async historial(ncf: string, limite = 50): Promise<Auditoria[]> {
    const canonico = validarNCF(ncf)
    return this.auditorias()
      .filter((e) => e.ncf === canonico)
      .sort((a, b) => b.registrado_en.localeCompare(a.registrado_en))
      .slice(0, limite)
  }
}
