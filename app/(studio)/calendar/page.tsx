import type { Metadata } from "next"
import Link from "next/link"
import { Calendar as CalendarIcon, RefreshCw } from "lucide-react"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  listCalendarEvents,
  getGoogleCalendarStatus,
  type CalendarOriginFilter,
  type CalendarEventRow,
} from "@/server/services/google-calendar.service"
import { syncGoogleCalendarNowAction } from "@/server/actions/google-calendar.actions"
import { createSupabaseServerClient } from "@/server/supabase/server"
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

  const supabase = createSupabaseServerClient()
  const [monthEvents, upcomingEvents, unread, gcalStatus, totalEventsRes] =
    await Promise.all([
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
      getGoogleCalendarStatus(session.studioId),
      supabase
        .from("google_events")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", session.studioId),
    ])

  // Banner: Google está conectado pero NUNCA se hizo el import inicial.
  const totalEvents = totalEventsRes.count ?? 0
  const showImportBanner =
    gcalStatus.enabled && gcalStatus.calendarId && totalEvents === 0

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
        {showImportBanner && (
          <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800/40 dark:bg-emerald-900/15 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                <CalendarIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-emerald-900 dark:text-emerald-200">
                  Importá tus eventos existentes de Google Calendar
                </p>
                <p className="text-[12px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                  Tu cuenta {gcalStatus.email} está conectada pero todavía no
                  hemos traído tus eventos. Hacé un sync inicial para verlos acá.
                </p>
              </div>
            </div>
            <form
              action={async () => {
                "use server"
                await syncGoogleCalendarNowAction()
              }}
            >
              <button
                type="submit"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Importar mis eventos
              </button>
            </form>
          </div>
        )}

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
