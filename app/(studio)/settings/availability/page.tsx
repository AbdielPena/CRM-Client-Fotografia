import { requireStudioAuth } from "@/server/middleware/auth"
import { availabilityRepo } from "@/server/repositories"
import { AppTopbar } from "@/components/layout/app-topbar"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { WeeklyScheduleEditor } from "@/components/availability/weekly-schedule-editor"
import { DateRuleForm } from "@/components/availability/date-rule-form"
import { ManualBlockForm } from "@/components/availability/manual-block-form"
import {
  deleteRuleAction,
  deleteBlockAction,
} from "@/server/actions/availability.actions"
import { CalendarX, CalendarCheck, Clock, Trash2 } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Disponibilidad" }

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "—"
  if (!end || end === start) return start
  return `${start} → ${end}`
}

function formatTimeRange(start: string | null, end: string | null): string {
  if (!start || !end) return ""
  return `${start.slice(0, 5)} – ${end.slice(0, 5)}`
}

export default async function AvailabilityPage() {
  const session = await requireStudioAuth()

  const [rules, blocks, unread] = await Promise.all([
    availabilityRepo.listRules(session.studioId),
    availabilityRepo.listBlocksInRange(
      session.studioId,
      new Date().toISOString(),
      new Date(Date.now() + 180 * 86400 * 1000).toISOString(),
    ),
    countUnreadNotifications(session.studioId),
  ])

  const dateRules = rules.filter(
    (r) =>
      r.rule_type === "date_closed" || r.rule_type === "date_open_override",
  )
  const manualBlocks = blocks.filter(
    (b) => b.block_type === "manual" || b.block_type === "personal",
  )
  const bookingBlocks = blocks.filter((b) => b.block_type === "booking")

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Disponibilidad"
        description="Configura tu horario y bloquea tiempo personal. Las solicitudes públicas respetarán estas reglas."
        unreadNotifications={unread}
      />

      <div className="p-6 max-w-5xl space-y-6">
        <WeeklyScheduleEditor initialRules={rules} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <DateRuleForm />

            <div className="sf-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border/60">
                <h3 className="text-sm font-semibold text-foreground">
                  Excepciones de fecha
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {dateRules.length} regla{dateRules.length !== 1 ? "s" : ""} activa{dateRules.length !== 1 ? "s" : ""}
                </p>
              </div>
              {dateRules.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  Sin excepciones configuradas
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {dateRules.map((r) => {
                    const isClosed = r.rule_type === "date_closed"
                    return (
                      <div
                        key={r.id}
                        className="px-5 py-3 flex items-center gap-3"
                      >
                        {isClosed ? (
                          <CalendarX className="h-4 w-4 text-danger flex-shrink-0" />
                        ) : (
                          <CalendarCheck className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {formatDateRange(r.start_date, r.end_date)}
                            {r.start_time && (
                              <span className="text-muted-foreground ml-2 font-normal">
                                {formatTimeRange(r.start_time, r.end_time)}
                              </span>
                            )}
                          </p>
                          {r.name && (
                            <p className="text-xs text-muted-foreground truncate">
                              {r.name}
                            </p>
                          )}
                        </div>
                        <form action={deleteRuleAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <button
                            type="submit"
                            className="p-1.5 text-muted-foreground hover:text-danger transition-colors"
                            aria-label="Eliminar"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </form>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <ManualBlockForm />

            <div className="sf-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border/60">
                <h3 className="text-sm font-semibold text-foreground">
                  Bloques en los próximos 180 días
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {manualBlocks.length} manuales · {bookingBlocks.length} por reserva
                </p>
              </div>
              {blocks.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  Sin bloques activos
                </div>
              ) : (
                <div className="divide-y divide-border/40 max-h-96 overflow-y-auto">
                  {blocks.map((b) => {
                    const start = new Date(b.starts_at)
                    const end = new Date(b.ends_at)
                    const isBooking = b.block_type === "booking"
                    return (
                      <div
                        key={b.id}
                        className="px-5 py-3 flex items-center gap-3"
                      >
                        <Clock
                          className={`h-4 w-4 flex-shrink-0 ${
                            isBooking ? "text-brand" : "text-amber-500"
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {b.title ?? (isBooking ? "Reserva" : "Bloqueo")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {start.toLocaleDateString("es", {
                              day: "2-digit",
                              month: "short",
                            })}{" "}
                            {start.toLocaleTimeString("es", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}{" "}
                            –{" "}
                            {end.toLocaleTimeString("es", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {isBooking && !b.is_confirmed && (
                              <span className="ml-2 text-amber-600">(provisional)</span>
                            )}
                          </p>
                        </div>
                        {!isBooking && (
                          <form action={deleteBlockAction}>
                            <input type="hidden" name="id" value={b.id} />
                            <button
                              type="submit"
                              className="p-1.5 text-muted-foreground hover:text-danger transition-colors"
                              aria-label="Eliminar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </form>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
