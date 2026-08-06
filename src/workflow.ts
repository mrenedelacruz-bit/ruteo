import { COMITE_CREDITO, MATRIZ_DESCUENTO } from './config'
import type {
  Cliente,
  Condiciones,
  Decision,
  Role,
  Solicitud,
  Visita,
} from './types'

/** Rol que debe aprobar un descuento dado, o null si queda auto-aprobado. */
export function aprobadorDescuento(pct: number): Role | null {
  for (const tramo of MATRIZ_DESCUENTO) {
    if (pct <= tramo.max) return tramo.aprobador
  }
  return MATRIZ_DESCUENTO[MATRIZ_DESCUENTO.length - 1].aprobador
}

/** Roles que tienen una acción pendiente sobre la solicitud en su etapa actual. */
export function pendienteDe(s: Solicitud): Role[] {
  switch (s.etapa) {
    case 'SOLICITUD':
    case 'CONDICIONES':
      return ['VENDEDOR']
    case 'VISITA_EN_REVISION':
      return ['SUPERVISOR']
    case 'PRECIO_EN_REVISION': {
      const rol = s.condiciones ? aprobadorDescuento(s.condiciones.descuentoPct) : null
      return rol ? [rol] : []
    }
    case 'CREDITO_EN_COMITE':
      return COMITE_CREDITO.filter((r) => !s.votosComite[r])
    case 'APROBADO':
    case 'RECHAZADO':
      return []
  }
}

function conEvento(s: Solicitud, role: Role, accion: string, comentario?: string): Solicitud {
  return {
    ...s,
    historial: [
      ...s.historial,
      { ts: new Date().toISOString(), role, accion, ...(comentario ? { comentario } : {}) },
    ],
  }
}

export function crearSolicitud(cliente: Cliente): Solicitud {
  const s: Solicitud = {
    id: `SOL-${Date.now().toString(36).toUpperCase()}`,
    creadaTs: new Date().toISOString(),
    etapa: 'SOLICITUD',
    cliente,
    visita: null,
    ruta: null,
    condiciones: null,
    votosComite: {},
    historial: [],
  }
  return conEvento(s, 'VENDEDOR', 'Creó la solicitud de cliente nuevo')
}

export function registrarVisita(s: Solicitud, visita: Visita): Solicitud {
  const gps = visita.lat != null && visita.lng != null ? ' con geolocalización' : ''
  return conEvento(
    { ...s, visita, etapa: 'VISITA_EN_REVISION' },
    'VENDEDOR',
    `Registró la visita al lugar${gps}`,
    visita.notas || undefined,
  )
}

export function revisarVisita(
  s: Solicitud,
  decision: Decision,
  ruta: string | null,
  comentario: string,
): Solicitud {
  if (decision === 'APROBAR') {
    return conEvento(
      { ...s, ruta, etapa: 'CONDICIONES' },
      'SUPERVISOR',
      `Aprobó la visita y asignó ${ruta ?? 'ruta'}`,
      comentario || undefined,
    )
  }
  if (decision === 'DEVOLVER') {
    return conEvento(
      { ...s, etapa: 'SOLICITUD' },
      'SUPERVISOR',
      'Devolvió la visita al vendedor para corrección',
      comentario || undefined,
    )
  }
  return conEvento(
    { ...s, etapa: 'RECHAZADO', motivoCierre: comentario || 'Visita rechazada' },
    'SUPERVISOR',
    'Rechazó la solicitud en la etapa de visita',
    comentario || undefined,
  )
}

/** Tras aprobar el precio: contado queda aprobado; crédito pasa al comité. */
function despuesDelPrecio(s: Solicitud, role: Role, comentario?: string): Solicitud {
  if (s.condiciones?.tipoPago === 'CREDITO') {
    return conEvento(
      { ...s, etapa: 'CREDITO_EN_COMITE', votosComite: {} },
      role,
      'Condiciones de precio aprobadas; pasa al comité de crédito',
      comentario,
    )
  }
  return conEvento(
    { ...s, etapa: 'APROBADO' },
    role,
    'Cliente aprobado (venta de contado)',
    comentario,
  )
}

export function proponerCondiciones(s: Solicitud, condiciones: Condiciones): Solicitud {
  const detalle =
    condiciones.tipoPago === 'CREDITO'
      ? `${condiciones.descuentoPct}% desc., crédito RD$${condiciones.limiteCredito.toLocaleString()} a ${condiciones.plazoDias} días`
      : `${condiciones.descuentoPct}% desc., contado`
  const conCondiciones = conEvento(
    { ...s, condiciones },
    'VENDEDOR',
    `Propuso condiciones comerciales: ${detalle}`,
  )
  const aprobador = aprobadorDescuento(condiciones.descuentoPct)
  if (aprobador) {
    return { ...conCondiciones, etapa: 'PRECIO_EN_REVISION' }
  }
  const auto = conEvento(
    conCondiciones,
    'VENDEDOR',
    `Descuento de ${condiciones.descuentoPct}% auto-aprobado según la matriz`,
  )
  return despuesDelPrecio(auto, 'VENDEDOR')
}

export function revisarPrecio(s: Solicitud, role: Role, decision: Decision, comentario: string): Solicitud {
  if (decision === 'APROBAR') {
    const aprobado = conEvento(s, role, 'Aprobó el precio/descuento propuesto', comentario || undefined)
    return despuesDelPrecio(aprobado, role)
  }
  if (decision === 'DEVOLVER') {
    return conEvento(
      { ...s, etapa: 'CONDICIONES' },
      role,
      'Devolvió las condiciones al vendedor para ajuste',
      comentario || undefined,
    )
  }
  return conEvento(
    { ...s, etapa: 'RECHAZADO', motivoCierre: comentario || 'Precio rechazado' },
    role,
    'Rechazó la solicitud en la etapa de precio',
    comentario || undefined,
  )
}

export function votarComite(s: Solicitud, role: Role, decision: Decision, comentario: string): Solicitud {
  if (decision === 'DEVOLVER') {
    return conEvento(
      { ...s, etapa: 'CONDICIONES', votosComite: {} },
      role,
      'El comité devolvió las condiciones al vendedor para ajuste',
      comentario || undefined,
    )
  }
  if (decision === 'RECHAZAR') {
    return conEvento(
      {
        ...s,
        etapa: 'RECHAZADO',
        votosComite: { ...s.votosComite, [role]: 'RECHAZADO' },
        motivoCierre: comentario || 'Crédito rechazado por el comité',
      },
      role,
      'Rechazó el crédito en el comité',
      comentario || undefined,
    )
  }
  const votos = { ...s.votosComite, [role]: 'APROBADO' as const }
  const conVoto = conEvento(
    { ...s, votosComite: votos },
    role,
    'Aprobó el crédito en el comité',
    comentario || undefined,
  )
  const faltan = COMITE_CREDITO.filter((r) => votos[r] !== 'APROBADO')
  if (faltan.length === 0) {
    return conEvento(
      { ...conVoto, etapa: 'APROBADO' },
      role,
      'Comité completo: cliente aprobado con crédito',
    )
  }
  return conVoto
}
