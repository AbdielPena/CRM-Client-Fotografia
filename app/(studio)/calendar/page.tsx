import type { Metadata } from "next"
import Link from "next/link"
import { Calendar as CalendarIcon } from "lucide-react"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  listCalendarEvents,
  type CalendarOriginFilter,
  type CalendarEventRow,
} from "@/server/services/google-calendar.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { CalendarOriginFilters } from "@/components/calendar/calendar-origin-filters"
import { CalendarMonthGrid } from "@/components/calendar/calendar-month-grid"
import { CalendarUpcomingList } from "@/components/calendar/calendar-upcoming-list"

export const metadata: Metadata = { title: "Calendario" }
export const dynamic = "force-dynamic"

const ALLOWED_ORIGINS: CalendarOriginFilter[] = [
  "all",
  "studioflow",
  "google_calendar",
  "with_client",
  "external",
]

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { month?: string; year?: string; origin?: string }
}) {
  const session = await requireStudioAuth()

  const now = new Date()
  const year = Number(searchParams.year ?? now.getFullYear())
  const month = Number(searchParams.month ?? now.getMonth() + 1)
  const origin = (
    ALLOWED_ORIGINS.includes(searchParams.origin as CalendarOriginFilter)
      ? searchParams.origin
      : "all"
  ) as CalendarOriginFilter

  const startDate = new Date(year, month - 1, 1).toISOString()
  const endDate = new Date(year, month, 0, 23, 59, 59).toISOString()

  const [monthEvents, upcomingEvents, unread] = await Promise.all([
    listCalendarEvents(session.studioId, {
      from: startDate,
      to: endDate,
      origin,
    }),
    listCalendarEvents(session.studioId, {
      from: now.toISOString(),
      to: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
      origin,
    }),
    countUnreadNotifications(session.studioId),
  ])

  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year

  const MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ]

  return (
    <>
      <AppTopbar
        eyebrow="Estudio"
        title="Calendario"
        description="Eventos de StudioFlow y de tu Google Calendar en un solo lugar"
        unreadNotifications={unread}
        actions={
          <Link
            href="/projects/new"
            className="px-4 py-2 bg-brand text-brand-foreground text-sm font-medium rounded-lg hover:bg-brand/90 transition-colors"
          >
            + Nuevo proyecto
          </Link>
        }
      />

      <div className="p-6 space-y-4">
        <CalendarOriginFilters
          active={origin}
          counts={countByOrigin(monthEvents)}
          year={year}
          month={month}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="sf-card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
                <Link
                  href={`/calendar?month=${prevMonth}&year=${prevYear}&origin=${origin}`}
                  className="p-2 hover:bg-muted/60 rounded-lg transition-colors text-muted-foreground"
                  aria-label="Mes anterior"
                >
                  ←
                </Link>
                <h2 className="text-sm font-semibold text-foreground">
                  {MONTH_NAMES[month - 1]} {year}
                </h2>
                <Link
                  href={`/calendar?month=${nextMonth}&year=${nextYear}&origin=${origin}`}
                  className="p-2 hover:bg-muted/60 rounded-lg transition-colors text-muted-foreground"
                  aria-label="Mes siguiente"
                >
                  →
                </Link>
              </div>

              <CalendarMonthGrid
                year={year}
                month={month}
                events={monthEvents}
                today={now}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="sf-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border/60">
                <h2 className="text-sm font-semibold text-foreground">
                  Próximos 30 días
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {upcomingEvents.length} evento{upcomingEvents.length === 1 ? "" : "s"}
                </p>
              </div>

              {upcomingEvents.length === 0 ? (
                <div className="py-8 text-center">
                  <CalendarIcon className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Sin eventos próximos
                  </p>
                </div>
              ) : (
                <CalendarUpcomingList events={upcomingEvents} />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function countByOrigin(
  events: CalendarEventRow[],
): Record<CalendarOriginFilter, number> {
  const out: Record<CalendarOriginFilter, number> = {
    all: events.length,
    studioflow: 0,
    google_calendar: 0,
    with_client: 0,
    external: 0,
  }
  for (const e of events) {
    if (e.origin === "studioflow" || e.origin === "synced") out.studioflow++
    if (e.origin === "google_calendar") out.google_calendar++
    if (e.origin === "external") out.external++
    if (e.clientId) out.with_client++
  }
  return out
}
