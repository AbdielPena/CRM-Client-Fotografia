import Link from "next/link"
import {
  Truck,
  Image as ImageIcon,
  AlertTriangle,
  CalendarClock,
} from "lucide-react"

import { formatDateShort } from "@/lib/utils/currency"
import type { UpcomingDeliveryEntry } from "@/server/services/delivery.service"

// Punto de color por prioridad (alta=roja, media=ámbar, baja=verde).
const PRIORITY_DOT: Record<string, string> = {
  alta: "bg-red-500",
  media: "bg-amber-500",
  baja: "bg-emerald-500",
}

/**
 * Lista de "Próximas entregas" ordenada por fecha (más cercana primero).
 * Reutilizable: se usa como aside lateral en el pipeline (/projects) y como
 * tarjeta en el dashboard. Solo presentacional — el padre pasa `entries`.
 */
export function UpcomingDeliveriesAside({
  entries,
  title = "Próximas entregas",
  showHeader = true,
}: {
  entries: UpcomingDeliveryEntry[]
  title?: string
  /** false cuando el contenedor (p.ej. DashboardCard) ya pone su encabezado. */
  showHeader?: boolean
}) {
  return (
    <div>
      {showHeader && (
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            {title}
          </h2>
          <Link
            href="/deliveries"
            className="text-[11px] font-medium text-primary hover:text-primary/80"
          >
            Ver todas
          </Link>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          No hay entregas próximas.
        </p>
      ) : (
        <ul className="divide-y divide-border/40">
          {entries.map((e) => {
            const dateLabel = e.date
              ? formatDateShort(new Date(e.date + "T00:00:00"))
              : "Sin fecha"
            return (
              <li key={e.id}>
                <Link
                  href={e.href}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted/40"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[e.priority] ?? "bg-muted-foreground"}`}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-foreground">
                        {e.title}
                      </p>
                      <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                        {e.kind === "gallery" ? (
                          <ImageIcon className="h-3 w-3 shrink-0" />
                        ) : (
                          <Truck className="h-3 w-3 shrink-0" />
                        )}
                        {e.subtitle}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`flex shrink-0 items-center gap-1 text-[11px] font-medium ${
                      e.overdue ? "text-red-600" : "text-muted-foreground"
                    }`}
                  >
                    {e.overdue && <AlertTriangle className="h-3 w-3" />}
                    {e.overdue ? "Vencida · " : ""}
                    {dateLabel}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
