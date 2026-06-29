// Tipos de colaborador — constante compartida (no es enum de BD para permitir
// "otro" y futuros tipos sin migración). Usada por el schema zod y la UI.

export const COLLABORATOR_TYPES = [
  { value: "maquillista", label: "Maquillista" },
  { value: "asistente", label: "Asistente" },
  { value: "peinadora", label: "Peinadora" },
  { value: "coordinador", label: "Coordinador" },
  { value: "segundo_fotografo", label: "Segundo fotógrafo" },
  { value: "videografo", label: "Videógrafo" },
  { value: "retocador", label: "Retocador" },
  { value: "otro", label: "Otro colaborador" },
] as const

export type CollaboratorType = (typeof COLLABORATOR_TYPES)[number]["value"]

export const COLLABORATOR_TYPE_VALUES: string[] = COLLABORATOR_TYPES.map(
  (t) => t.value,
)

export function collaboratorTypeLabel(value: string | null | undefined): string {
  if (!value) return "—"
  return COLLABORATOR_TYPES.find((t) => t.value === value)?.label ?? value
}

// Estados de confirmación de asistencia (Fase 4) + pago.
export const CONFIRM_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente de confirmar",
  invited: "Invitado",
  confirmed: "Confirmado",
  rejected: "Rechazado",
  completed: "Completado",
}

export const PAY_STATUS_LABELS: Record<string, string> = {
  pending: "Pago pendiente",
  paid: "Pagado",
  cancelled: "Cancelado",
}
