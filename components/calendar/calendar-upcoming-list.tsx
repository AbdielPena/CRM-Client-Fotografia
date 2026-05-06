import Link from "next/link"
import { Clock, MapPin, ExternalLink } from "lucide-react"

import { cn } from "@/lib/utils/cn"
import type { CalendarEventRow } from "@/server/services/google-calendar.service"

interface Props {
  events: CalendarEventRow[]
}

const ORIGIN_BADGE: Record<
  CalendarEventRow["origin"],
  { label: string; className: string }
> = {
  studioflow: {
    label: "StudioFlow",
    className: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  },
  synced: {
    label: "Sincronizado",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  google_calendar: {
    label: "Google",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  external: {
    label: "Personal",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300",
  },
}

export function CalendarUpcomingList({ events }: Props) {
  return (
    <div className="divide-y divide-border/40">
      {events.map((e) => {
        const eventDate = e.startsAt ? new Date(e.startsAt) : null
        const time = eventDate
          ? eventDate.toLocaleTimeString("es-DO", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : null
        const href = computeHref(e)
        const badge = ORIGIN_BADGE[e.origin]

        const innerContent = (
          <div className="flex items-start gap-3 px-5 py-4 hover:bg-muted/40 transition-colors">
            <div className="w-10 h-10 bg-muted/60 rounded-lg flex flex-col items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-foreground leading-none">
                {eventDate ? eventDate.getDate() : "—"}
              </span>
              <span className="text-[10px] text-muted-foreground uppercase">
                {eventDate
                  ? eventDate.toLocaleString("es", { month: "short" })
                  : ""}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-foreground truncate">
                  {e.summary ?? "(sin título)"}
                </p>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                    badge.className,
                  )}
                >
                  {badge.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {e.clientName ?? e.projectName ?? "Sin cliente"}
              </p>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                {time && !e.isAllDay && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {time}
                  </span>
                )}
                {e.isAllDay && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Todo el día
                  </span>
                )}
                {e.location && (
                  <span className="flex items-center gap-1 truncate">
                    <MapPin className="h-3 w-3 flex-shrink-0" />
                    {e.location}
                  </span>
                )}
                {!href && e.htmlLink && (
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                )}
              </div>
            </div>
          </div>
        )

        if (!href) {
          return <div key={e.id}>{innerContent}</div>
        }
        const isExternal = href.startsWith("http")
        if (isExternal) {
          return (
            <a
              key={e.id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              {innerContent}
            </a>
          )
        }
        return (
          <Link key={e.id} href={href} className="block">
            {innerContent}
          </Link>
        )
      })}
    </div>
  )
}

function computeHref(e: CalendarEventRow): string | null {
  if (e.projectId) return `/projects/${e.projectId}`
  if (e.bookingRequestId) return `/bookings/${e.bookingRequestId}`
  if (e.clientId) return `/clients/${e.clientId}`
  if (e.contractId) return `/contracts/${e.contractId}`
  if (e.invoiceId) return `/invoices/${e.invoiceId}`
  if (e.galleryId) return `/galleries/${e.galleryId}`
  if (e.htmlLink) return e.htmlLink
  return null
}
