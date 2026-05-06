import Link from "next/link"

import { cn } from "@/lib/utils/cn"
import type { CalendarEventRow } from "@/server/services/google-calendar.service"

interface Props {
  year: number
  month: number // 1-12
  events: CalendarEventRow[]
  today: Date
}

/**
 * Grid mensual del calendario. Cada celda muestra hasta 2 eventos con
 * color según origen (StudioFlow morado, Google verde, sincronizado azul,
 * personal/externo gris). Click en evento navega al cliente/proyecto
 * vinculado, o al link de Google Calendar si no hay relación interna.
 */
export function CalendarMonthGrid({ year, month, events, today }: Props) {
  const firstDow = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  // Agrupar eventos por día
  const byDay = new Map<number, CalendarEventRow[]>()
  for (const e of events) {
    if (!e.startsAt) continue
    const d = new Date(e.startsAt)
    if (
      d.getFullYear() !== year ||
      d.getMonth() + 1 !== month
    )
      continue
    const day = d.getDate()
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(e)
  }

  return (
    <>
      <div className="grid grid-cols-7 border-b border-border/60">
        {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => (
          <div
            key={d}
            className="text-center py-2 text-xs font-medium text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {Array.from({ length: firstDow }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="min-h-[88px] border-b border-r border-border/20"
          />
        ))}

        {days.map((day) => {
          const dayEvents = byDay.get(day) ?? []
          const isToday =
            day === today.getDate() &&
            month === today.getMonth() + 1 &&
            year === today.getFullYear()
          const isWeekend =
            (day + firstDow - 1) % 7 === 0 || (day + firstDow - 1) % 7 === 6

          return (
            <div
              key={day}
              className={cn(
                "min-h-[88px] p-1.5 border-b border-r border-border/20",
                isToday && "bg-brand-soft/40",
                !isToday && isWeekend && "bg-muted/20",
              )}
            >
              <span
                className={cn(
                  "text-xs font-medium block mb-1",
                  isToday
                    ? "text-brand-foreground bg-brand rounded-full w-5 h-5 flex items-center justify-center"
                    : "text-foreground",
                )}
              >
                {day}
              </span>
              {dayEvents.slice(0, 3).map((e) => (
                <CalendarEventChip key={e.id} event={e} />
              ))}
              {dayEvents.length > 3 && (
                <span className="text-[10px] text-muted-foreground">
                  +{dayEvents.length - 3} más
                </span>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

function CalendarEventChip({ event }: { event: CalendarEventRow }) {
  const tone = TONES[event.origin]
  const href = computeHref(event)

  const startTime = event.startsAt
    ? new Date(event.startsAt).toLocaleTimeString("es-DO", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null

  const tooltip = [
    event.summary ?? "(sin título)",
    event.clientName ? `Cliente: ${event.clientName}` : null,
    event.projectName ? `Proyecto: ${event.projectName}` : null,
    event.location ? `Lugar: ${event.location}` : null,
    startTime ? `Hora: ${startTime}` : null,
    event.origin === "external" ? "Evento personal de Google" : null,
  ]
    .filter(Boolean)
    .join("\n")

  if (!href) {
    return (
      <div
        className={cn(
          "block text-[10px] rounded px-1 py-0.5 mb-0.5 truncate cursor-default",
          tone.bg,
          tone.text,
        )}
        title={tooltip}
      >
        {event.summary ?? "(sin título)"}
      </div>
    )
  }

  const isExternal = href.startsWith("http")
  const Wrapper = isExternal ? "a" : Link
  const wrapperProps = isExternal
    ? { href, target: "_blank", rel: "noopener noreferrer" }
    : { href }

  return (
    <Wrapper
      {...(wrapperProps as { href: string })}
      className={cn(
        "block text-[10px] rounded px-1 py-0.5 mb-0.5 truncate transition-colors",
        tone.bg,
        tone.text,
        tone.bgHover,
      )}
      title={tooltip}
    >
      {event.summary ?? "(sin título)"}
    </Wrapper>
  )
}

const TONES: Record<
  CalendarEventRow["origin"],
  { bg: string; text: string; bgHover: string }
> = {
  studioflow: {
    bg: "bg-violet-100",
    text: "text-violet-800 dark:text-violet-200",
    bgHover: "hover:bg-violet-200",
  },
  synced: {
    bg: "bg-blue-100",
    text: "text-blue-800 dark:text-blue-200",
    bgHover: "hover:bg-blue-200",
  },
  google_calendar: {
    bg: "bg-emerald-100",
    text: "text-emerald-800 dark:text-emerald-200",
    bgHover: "hover:bg-emerald-200",
  },
  external: {
    bg: "bg-slate-100",
    text: "text-slate-700 dark:text-slate-300",
    bgHover: "hover:bg-slate-200",
  },
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
