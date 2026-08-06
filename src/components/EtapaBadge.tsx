import type { Etapa } from '../types'

const LABELS: Record<Etapa, string> = {
  SOLICITUD: 'Visita pendiente',
  VISITA_EN_REVISION: 'Visita en revisión',
  CONDICIONES: 'Definir condiciones',
  PRECIO_EN_REVISION: 'Precio en revisión',
  CREDITO_EN_COMITE: 'Comité de crédito',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
}

export function EtapaBadge({ etapa }: { etapa: Etapa }) {
  return <span className={`badge badge-${etapa.toLowerCase()}`}>{LABELS[etapa]}</span>
}
