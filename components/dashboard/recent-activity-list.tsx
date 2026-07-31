import Link from "next/link"
import {
  Ban,
  Camera,
  CheckCircle2,
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
 * El historial guarda acciones en clave técnica (`project.cancelled`), así que
 * aquí se traducen a algo que se lee de un vistazo. Lo que no esté mapeado cae
 * al texto que dejó quien registró la acción — nunca se muestra la clave cruda.
 */

const ETIQUETAS: Record<string, string> = {
  "project.cancelled": "Sesión cancelada",
  "project.cancellation_undone": "Cancelación deshecha",
  "project.created": "Sesión creada",
  "project.status_changed": "Sesión cambió de estado",
  "client.created": "Cliente nuevo",
  "invoice.created": "Factura creada",
  "invoice.sent": "Factura enviada",
  "payment.recorded": "Pago registrado",
  "contract.sent": "Contrato enviado",
  "contract.signed": "Contrato firmado",
  "gallery.created": "Galería creada",
  "gallery.delivered": "Entrega enviada",
  "booking_request.created": "Solicitud de reserva",
  "booking_request.approved": "Reserva aprobada",
  "booking_request.cancelled": "Solicitud cancelada",
  "booking_quote.accepted": "Cotización aceptada",
}

function iconoDe(action: string) {
  if (action.startsWith("payment")) return Wallet
  if (action.startsWith("invoice")) return Receipt
  if (action.startsWith("contract")) return FileSignature
  if (action.startsWith("gallery")) return Images
  if (action.startsWith("client")) return UserPlus
  if (action.includes("cancel")) return Ban
  if (action.startsWith("booking")) return CheckCircle2
  if (action.startsWith("project")) return Camera
  return Activity
}

/** "hace 5 min", "hace 3 h", "ayer"… en hora local del navegador del servidor. */
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
        const titulo = ETIQUETAS[r.action] ?? r.description ?? r.action
        // El detalle solo se muestra si aporta algo distinto al título.
        const detalle =
          r.description && r.description !== titulo ? r.description : null
        const fila = (
          <div className="flex items-start justify-between gap-3 px-5 py-2.5">
            <div className="flex min-w-0 items-start gap-2.5">
              <Icono className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-foreground">
                  {titulo}
                </p>
                {detalle && (
                  <p className="truncate text-[11px] text-muted-foreground">
                    {detalle}
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
