export type Role =
  | 'VENDEDOR'
  | 'SUPERVISOR'
  | 'GERENTE_COMERCIAL'
  | 'CREDITO'
  | 'GERENCIA_GENERAL'

export type Etapa =
  | 'SOLICITUD' // creada; el vendedor debe registrar la visita al lugar
  | 'VISITA_EN_REVISION' // el supervisor valida la visita y asigna la ruta
  | 'CONDICIONES' // el vendedor propone precio/descuento y forma de pago
  | 'PRECIO_EN_REVISION' // aprobación del descuento según la matriz por niveles
  | 'CREDITO_EN_COMITE' // comité de crédito en paralelo (todos deben aprobar)
  | 'APROBADO'
  | 'RECHAZADO'

export type TipoPago = 'CONTADO' | 'CREDITO'

export type Decision = 'APROBAR' | 'DEVOLVER' | 'RECHAZAR'

export interface Cliente {
  nombre: string
  rnc: string
  contacto: string
  telefono: string
  tipoNegocio: string
  direccion: string
}

export interface Visita {
  fecha: string
  lat: number | null
  lng: number | null
  notas: string
}

export interface Condiciones {
  descuentoPct: number
  tipoPago: TipoPago
  limiteCredito: number // RD$; solo aplica con tipoPago CREDITO
  plazoDias: number // solo aplica con tipoPago CREDITO
}

export interface EventoHistorial {
  ts: string
  role: Role
  accion: string
  comentario?: string
}

export interface Solicitud {
  id: string
  creadaTs: string
  etapa: Etapa
  cliente: Cliente
  visita: Visita | null
  ruta: string | null
  condiciones: Condiciones | null
  votosComite: Partial<Record<Role, 'APROBADO' | 'RECHAZADO'>>
  motivoCierre?: string
  historial: EventoHistorial[]
}
