import Link from "next/link"
import {
  Truck,
  Image as ImageIcon,
  AlertTriangle,
  CalendarClock,
  Printer,
  Download,
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
 * "Próximas entregas", separadas en las dos que se trabajan aparte:
 *
 *   · **Digitales** — las fotos por la galería. Plazo desde la selección.
 *   · **Impresiones** — lo físico. Plazo aparte, desde que sale la galería final.
 *
 * Van en listas distintas y cada una ordenada por SU fecha. Juntas, las
 * impresiones atrasadas se perdían entre digitales que todavía no tocaban.
 *
 * Reutilizable: aside lateral del pipeline (/projects) y tarjeta del dashboard.
 * Solo presentacional — el padre pasa las listas ya ordenadas.
 */
export function UpcomingDeliveriesAside({
  digital,
  prints,
  title = "Próximas entregas",
  showHeader = true,
}: {
  digital: UpcomingDeliveryEntry[]
  prints: UpcomingDeliveryEntry[]
  title?: string
  /** false cuando el contenedor (p.ej. DashboardCard) ya pone su encabezado. */
  showHeader?: boolean
}) {
  const vacio = digital.length === 0 && prints.length === 0

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

      {vacio ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          No hay entregas próximas.
        </p>
      ) : (
        <div className="space-y-4">
          <Bloque
            titulo="Digitales"
            icono={<Download className="h-3.5 w-3.5" />}
            entries={digital}
            vacioTexto="Sin entregas digitales pendientes."
          />
          <Bloque
            titulo="Impresiones"
            icono={<Printer className="h-3.5 w-3.5" />}
            entries={prints}
            vacioTexto="Sin impresiones pendientes."
            verTodas="/tasks?view=all&stage=send_prints"
          />
        </div>
      )}
    </div>
  )
}

function Bloque({
  titulo,
  icono,
  entries,
  vacioTexto,
  verTodas,
}: {
  titulo: string
  icono: React.ReactNode
  entries: UpcomingDeliveryEntry[]
  vacioTexto: string
  verTodas?: string
}) {
  const atrasadas = entries.filter((e) => e.overdue).length

  return (
    <section>
      <div className="mb-1 flex items-center justify-between gap-2 border-b border-border/60 pb-1.5">
        <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {icono}
          {titulo}
          <span className="font-normal normal-case tracking-normal">
            ({entries.length})
          </span>
        </h3>
        {atrasadas > 0 && (
          <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            {atrasadas} vencida{atrasadas === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="py-3 text-center text-[12px] text-muted-foreground">
          {vacioTexto}
          {verTodas && (
            <>
              {" "}
              <Link href={verTodas} className="text-primary hover:underline">
                Ver todas
              </Link>
            </>
          )}
        </p>
      ) : (
        <ul className="divide-y divide-border/40">
          {entries.map((e) => (
            <Fila key={e.id} e={e} />
          ))}
        </ul>
      )}
    </section>
  )
}

function Fila({ e }: { e: UpcomingDeliveryEntry }) {
  const dateLabel = e.date
    ? formatDateShort(new Date(e.date + "T00:00:00"))
    : "Sin fecha"

  return (
    <li>
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
              {e.track === "prints" ? (
                <Printer className="h-3 w-3 shrink-0" />
              ) : e.kind === "gallery" ? (
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
            e.overdue
              ? "text-red-600"
              : e.awaitingSelection
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground"
          }`}
          title={
            e.awaitingSelection
              ? "El cliente aún no envía su selección: el plazo de entrega empieza cuando la envíe. La fecha es un estimado."
              : undefined
          }
        >
          {e.overdue && <AlertTriangle className="h-3 w-3" />}
          {e.overdue ? "Vencida · " : ""}
          {!e.overdue && e.awaitingSelection ? "Esperando selección · " : ""}
          {dateLabel}
        </span>
      </Link>
    </li>
  )
}
