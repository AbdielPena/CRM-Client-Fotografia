import Link from "next/link"
import {
  Ban,
  Camera,
  CheckCircle2,
  CheckSquare,
  FileSignature,
  Images,
  Receipt,
  UserPlus,
  Wallet,
  Activity,
} from "lucide-react"

import type { RecentActivityItem } from "@/server/services/activity.service"

/**
 * "Registros recientes" del dashboard: los últimos movimientos del estudio.
 *
 * Dos reglas de lectura, porque esto lo mira Abdiel de un vistazo:
 *  1. Cada línea dice DE QUIÉN es (el nombre del cliente, en la segunda línea).
 *  2. NUNCA se muestra la clave técnica (`task.created`). Si una acción no está
 *     en el mapa, se arma un texto legible a partir de la propia clave.
 */

const ETIQUETAS: Record<string, string> = {
  "project.created": "Sesión creada",
  "project.updated": "Sesión actualizada",
  "project.cancelled": "Sesión cancelada",
  "project.cancellation_undone": "Cancelación deshecha",
  "project.status_changed": "Sesión cambió de estado",
  "project.finalized": "Sesión finalizada",
  "client.created": "Cliente nuevo",
  "client.updated": "Cliente actualizado",
  "invoice.created": "Factura creada",
  "invoice.sent": "Factura enviada",
  "contract.created": "Contrato creado",
  "contract.sent": "Contrato enviado",
  "contract.signed": "Contrato firmado",
  "contract.voided": "Contrato anulado",
  "gallery.created": "Galería creada",
  "gallery.delivered": "Entrega enviada",
  "gallery.selection_submitted": "Selección enviada",
  "task.created": "Tarea creada",
  "task.completed": "Tarea completada",
  "task.updated": "Tarea actualizada",
  "forms.auto_created": "Formularios generados",
  "booking_request.created": "Solicitud de reserva",
  "booking_request.approved": "Reserva aprobada",
  "booking_request.converted": "Reserva convertida en sesión",
  "booking_request.rejected": "Solicitud rechazada",
  "booking_request.cancelled": "Solicitud cancelada",
  "booking_quote.created": "Cotización enviada",
  "booking_quote.accepted": "Cotización aceptada",
  "print_selection.submitted": "Impresiones elegidas",
}

/** Último recurso: `booking_quote.created` → "Booking quote created". */
function legible(action: string): string {
  const limpio = action.replace(/[._]+/g, " ").trim()
  return limpio.charAt(0).toUpperCase() + limpio.slice(1)
}

function iconoDe(action: string) {
  if (action.startsWith("payment")) return Wallet
  if (action.startsWith("invoice")) return Receipt
  if (action.startsWith("contract")) return FileSignature
  if (action.startsWith("gallery") || action.startsWith("print")) return Images
  if (action.startsWith("client")) return UserPlus
  if (action.startsWith("task")) return CheckSquare
  if (action.includes("cancel")) return Ban
  if (action.startsWith("booking")) return CheckCircle2
  if (action.startsWith("project")) return Camera
  return Activity
}

/** "hace 5 min", "hace 3 h", "ayer"… */
function haceCuanto(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return "ahora"
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  if (d === 1) return "ayer"
  if (d < 30) return `hace ${d} días`
  return new Date(iso).toLocaleDateString("es-DO", {
    day: "numeric",
    month: "short",
  })
}

export function RecentActivityList({ items }: { items: RecentActivityItem[] }) {
  if (items.length === 0) {
    return (
      <p className="px-5 py-6 text-center text-[13px] text-muted-foreground">
        Todavía no hay movimientos registrados.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-border/40">
      {items.map((r) => {
        const Icono = iconoDe(r.action)
        const titulo = ETIQUETAS[r.action] ?? legible(r.action)
        // Debajo va de quién es. Si no hay cliente, el detalle que se registró.
        const subtitulo =
          r.clientName ??
          (r.description && r.description !== titulo ? r.description : null)
        const fila = (
          <div className="flex items-start justify-between gap-3 px-5 py-2.5">
            <div className="flex min-w-0 items-start gap-2.5">
              <Icono className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-foreground">
                  {titulo}
                </p>
                {subtitulo && (
                  <p className="truncate text-[11.5px] text-muted-foreground">
                    {subtitulo}
                  </p>
                )}
              </div>
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {haceCuanto(r.createdAt)}
            </span>
          </div>
        )
        return (
          <li key={r.id}>
            {r.href ? (
              <Link href={r.href} className="block transition-colors hover:bg-muted/40">
                {fila}
              </Link>
            ) : (
              fila
            )}
          </li>
        )
      })}
    </ul>
  )
}
