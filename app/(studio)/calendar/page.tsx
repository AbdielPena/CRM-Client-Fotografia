import { requireStudioAuth } from "@/server/middleware/auth"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { AppTopbar } from "@/components/layout/app-topbar"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { Calendar, Clock, MapPin } from "lucide-react"
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Calendario" }

type ProjectEvent = {
  id: string
  name: string
  event_date: string | null
  event_time: string | null
  location: string | null
  status: string
  client: { id: string; name: string } | null
}

function normalizeProjects(data: unknown): ProjectEvent[] {
  const rows = (data as Array<Record<string, unknown>>) ?? []
  return rows.map((p) => ({
    id: String(p.id),
    name: String(p.name),
    event_date: (p.event_date as string | null) ?? null,
    event_time: (p.event_time as string | null) ?? null,
    location: (p.location as string | null) ?? null,
    status: String(p.status),
    client: Array.isArray(p.client)
      ? ((p.client[0] as { id: string; name: string } | undefined) ?? null)
      : ((p.client as { id: string; name: string } | null) ?? null),
  }))
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { month?: string; year?: string }
}) {
  const session = await requireStudioAuth()
  const supabase = createSupabaseServerClient()

  const now = new Date()
  const year = Number(searchParams.year ?? now.getFullYear())
  const month = Number(searchParams.month ?? now.getMonth() + 1)

  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59)
  const startIso = startDate.toISOString().slice(0, 10)
  const endIso = endDate.toISOString().slice(0, 10)

  const [monthRes, upcomingRes, unread] = await Promise.all([
    supabase
      .from("projects")
      .select(
        `id, name, event_date, event_time, location, status, client:clients(id, name)`,
      )
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .not("event_date", "is", null)
      .gte("event_date", startIso)
      .lte("event_date", endIso)
      .order("event_date", { ascending: true }),
    supabase
      .from("projects")
      .select(
        `id, name, event_date, event_time, location, status, client:clients(id, name)`,
      )
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .not("event_date", "is", null)
      .gte("event_date", now.toISOString().slice(0, 10))
      .lte(
        "event_date",
        new Date(Date.now() + 30 * 86400 * 1000).toISOString().slice(0, 10),
      )
      .order("event_date", { ascending: true })
      .limit(10),
    countUnreadNotifications(session.studioId),
  ])

  const bookings = normalizeProjects(monthRes.data)
  const upcoming = normalizeProjects(upcomingRes.data)

  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year

  const MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ]

  const firstDow = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const bookingsByDay = new Map<number, ProjectEvent[]>()
  for (const b of bookings) {
    if (!b.event_date) continue
    const day = Number(b.event_date.slice(8, 10))
    if (!bookingsByDay.has(day)) bookingsByDay.set(day, [])
    bookingsByDay.get(day)!.push(b)
  }

  return (
    <>
      <AppTopbar
        eyebrow="Estudio"
        title="Calendario"
        description="Visualiza y gestiona tus sesiones"
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

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="sf-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
              <Link
                href={`/calendar?month=${prevMonth}&year=${prevYear}`}
                className="p-2 hover:bg-muted/60 rounded-lg transition-colors text-muted-foreground"
              >
                ←
              </Link>
              <h2 className="text-sm font-semibold text-foreground">
                {MONTH_NAMES[month - 1]} {year}
              </h2>
              <Link
                href={`/calendar?month=${nextMonth}&year=${nextYear}`}
                className="p-2 hover:bg-muted/60 rounded-lg transition-colors text-muted-foreground"
              >
                →
              </Link>
            </div>

            <div className="grid grid-cols-7 border-b border-border/60">
              {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => (
                <div key={d} className="text-center py-2 text-xs font-medium text-muted-foreground">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {Array.from({ length: firstDow }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-gray-50" />
              ))}

              {days.map((day) => {
                const dayBookings = bookingsByDay.get(day) ?? []
                const isToday =
                  day === now.getDate() &&
                  month === now.getMonth() + 1 &&
                  year === now.getFullYear()

                return (
                  <div
                    key={day}
                    className={`min-h-[80px] p-1.5 border-b border-r border-gray-50 ${
                      isToday ? "bg-brand-soft" : ""
                    } ${(day + firstDow - 1) % 7 === 0 || (day + firstDow - 1) % 7 === 6 ? "bg-muted/30/50" : ""}`}
                  >
                    <span
                      className={`text-xs font-medium block mb-1 ${
                        isToday
                          ? "text-white bg-brand rounded-full w-5 h-5 flex items-center justify-center"
                          : "text-foreground"
                      }`}
                    >
                      {day}
                    </span>
                    {dayBookings.slice(0, 2).map((b) => (
                      <Link
                        key={b.id}
                        href={`/projects/${b.id}`}
                        className="block text-[10px] bg-blue-100 text-brand rounded px-1 py-0.5 mb-0.5 truncate hover:bg-blue-200 transition-colors"
                        title={`${b.name} · ${b.client?.name ?? ""}`}
                      >
                        {b.name}
                      </Link>
                    ))}
                    {dayBookings.length > 2 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{dayBookings.length - 2} más
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="sf-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border/60">
              <h2 className="text-sm font-semibold text-foreground">
                Próximas sesiones (30 días)
              </h2>
            </div>

            {upcoming.length === 0 ? (
              <div className="py-8 text-center">
                <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Sin sesiones próximas</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {upcoming.map((b) => {
                  const eventDate = b.event_date ? new Date(b.event_date) : null
                  return (
                    <Link
                      key={b.id}
                      href={`/projects/${b.id}`}
                      className="flex items-start gap-3 px-5 py-4 hover:bg-muted/40 transition-colors"
                    >
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
                        <p className="text-sm font-medium text-foreground truncate">
                          {b.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {b.client?.name ?? "Sin cliente"}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {b.event_time && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {String(b.event_time).slice(0, 5)}
                            </span>
                          )}
                          {b.location && (
                            <span className="flex items-center gap-1 truncate">
                              <MapPin className="h-3 w-3 flex-shrink-0" />
                              {b.location}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
