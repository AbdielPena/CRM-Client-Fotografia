import { cn } from "@/lib/utils/cn"

/**
 * Status badge — estilos basados en tokens semánticos (soft variants) para que
 * se adapten bien a dark-mode. Cada status mapea a un par de token utilities
 * (bg-*-soft + text-*) en vez de colores hex hardcoded.
 */
const VARIANTS = {
  // ========== Lead statuses ==========
  NEW: "bg-info-soft text-info",
  CONTACTED: "bg-warning-soft text-warning",
  MEETING_SCHEDULED: "bg-brand-soft text-brand-soft-foreground",
  PROPOSAL_SENT: "bg-warning-soft text-warning",
  NEGOTIATING: "bg-brand-soft text-brand-soft-foreground",
  WON: "bg-success-soft text-success",
  LOST: "bg-danger-soft text-danger",
  ARCHIVED: "bg-muted text-muted-foreground",

  // ========== Project statuses ==========
  INQUIRY: "bg-muted text-muted-foreground",
  BOOKED: "bg-info-soft text-info",
  IN_PROGRESS: "bg-brand-soft text-brand-soft-foreground",
  EDITING: "bg-brand-soft text-brand-soft-foreground",
  DELIVERED: "bg-warning-soft text-warning",
  COMPLETED: "bg-success-soft text-success",
  CANCELLED: "bg-danger-soft text-danger",

  // ========== Booking statuses (legacy) ==========
  PENDING: "bg-warning-soft text-warning",
  CONFIRMED: "bg-success-soft text-success",

  // ========== Booking requests (Fase 1.2+) ==========
  PENDING_REVIEW: "bg-warning-soft text-warning",
  APPROVED: "bg-info-soft text-info",
  REJECTED: "bg-danger-soft text-danger",
  AWAITING_PAYMENT: "bg-warning-soft text-warning",
  SCHEDULED: "bg-brand-soft text-brand-soft-foreground",

  // ========== Invoice / Payment ==========
  DRAFT: "bg-muted text-muted-foreground",
  SENT: "bg-info-soft text-info",
  VIEWED: "bg-brand-soft text-brand-soft-foreground",
  PARTIALLY_PAID: "bg-warning-soft text-warning",
  PAID: "bg-success-soft text-success",
  OVERDUE: "bg-danger-soft text-danger",
  REFUNDED: "bg-muted text-muted-foreground",

  // ========== Contract ==========
  SIGNED: "bg-success-soft text-success",
  EXPIRED: "bg-danger-soft text-danger",

  // ========== Generic ==========
  ACTIVE: "bg-success-soft text-success",
  INACTIVE: "bg-muted text-muted-foreground",
} as const

const LABELS: Record<string, string> = {
  NEW: "Nuevo",
  CONTACTED: "Contactado",
  MEETING_SCHEDULED: "Reunión",
  PROPOSAL_SENT: "Propuesta enviada",
  NEGOTIATING: "Negociando",
  WON: "Ganado",
  LOST: "Perdido",
  ARCHIVED: "Archivado",
  INQUIRY: "Consulta",
  BOOKED: "Reservado",
  IN_PROGRESS: "En progreso",
  EDITING: "Editando",
  DELIVERED: "Entregado",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  PENDING_REVIEW: "Por revisar",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  AWAITING_PAYMENT: "Esperando pago",
  SCHEDULED: "Agendada",
  DRAFT: "Borrador",
  SENT: "Enviada",
  VIEWED: "Vista",
  PARTIALLY_PAID: "Parcial",
  PAID: "Pagada",
  OVERDUE: "Vencida",
  REFUNDED: "Reembolsada",
  SIGNED: "Firmado",
  EXPIRED: "Expirado",
}

interface StatusBadgeProps {
  status: string
  size?: "sm" | "md"
  /** Muestra un pequeño dot del color correspondiente antes del label. */
  withDot?: boolean
  className?: string
}

export function StatusBadge({
  status,
  size = "sm",
  withDot = false,
  className,
}: StatusBadgeProps) {
  const key = status.toUpperCase()
  const colorClass =
    VARIANTS[key as keyof typeof VARIANTS] ?? "bg-muted text-muted-foreground"
  const label = LABELS[key] ?? status

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-caption",
        colorClass,
        className,
      )}
    >
      {withDot && (
        <span
          className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current"
          aria-hidden="true"
        />
      )}
      {label}
    </span>
  )
}
