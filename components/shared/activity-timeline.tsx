import {
  CheckCircle2,
  Circle,
  Inbox,
  Mail,
  UserPlus,
  XCircle,
  Ban,
  Sparkles,
} from "lucide-react"
import { formatDateShort } from "@/lib/utils/currency"

type ActivityRow = {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  actor_type: string | null
  actor_user_id: string | null
  actor_email: string | null
  actor_name: string | null
  description: string | null
  metadata: unknown
  created_at: string
}

const ICON_MAP: Record<string, { Icon: React.ElementType; color: string }> = {
  "booking_request.created": { Icon: Inbox, color: "text-brand bg-brand-soft" },
  "booking_request.approved": {
    Icon: CheckCircle2,
    color: "text-emerald-500 bg-emerald-50",
  },
  "booking_request.rejected": {
    Icon: XCircle,
    color: "text-danger bg-danger/10",
  },
  "booking_request.cancelled": {
    Icon: Ban,
    color: "text-muted-foreground bg-muted",
  },
  "email.sent": { Icon: Mail, color: "text-indigo-500 bg-indigo-50" },
  "client.created": { Icon: UserPlus, color: "text-violet-500 bg-violet-50" },
}

function iconFor(action: string) {
  return ICON_MAP[action] ?? { Icon: Sparkles, color: "text-muted-foreground bg-muted" }
}

function actorLabel(row: ActivityRow): string {
  if (row.actor_type === "system") return "Sistema"
  if (row.actor_type === "client") {
    return row.actor_name ?? row.actor_email ?? "Cliente"
  }
  return row.actor_name ?? row.actor_email ?? "Staff"
}

function fallbackDescription(action: string): string {
  const map: Record<string, string> = {
    "booking_request.created": "Solicitud recibida",
    "booking_request.approved": "Solicitud aprobada",
    "booking_request.rejected": "Solicitud rechazada",
    "booking_request.cancelled": "Solicitud cancelada",
  }
  return map[action] ?? action
}

export function ActivityTimeline({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="p-5 text-center text-sm text-muted-foreground">
        <Circle className="h-5 w-5 mx-auto mb-2 opacity-50" />
        Sin actividad registrada aún.
      </div>
    )
  }

  return (
    <ol className="relative pl-6 pr-3 py-5 space-y-4">
      <span
        className="absolute left-[17px] top-6 bottom-6 w-px bg-muted"
        aria-hidden
      />

      {rows.map((row) => {
        const { Icon, color } = iconFor(row.action)
        return (
          <li key={row.id} className="relative">
            <span
              className={`absolute -left-3 top-0 h-6 w-6 rounded-full flex items-center justify-center ring-4 ring-white ${color}`}
              aria-hidden
            >
              <Icon className="h-3.5 w-3.5" />
            </span>

            <div className="pl-5">
              <p className="text-sm text-foreground">
                {row.description ?? fallbackDescription(row.action)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {actorLabel(row)}
                <span className="mx-1.5">·</span>
                {formatDateShort(new Date(row.created_at))}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
