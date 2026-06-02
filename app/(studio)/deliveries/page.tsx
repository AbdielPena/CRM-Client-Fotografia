import type { Metadata } from "next"
import Link from "next/link"
import { Truck, Cake, AlertTriangle, Clock, CalendarClock } from "lucide-react"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  listDeliveries,
  getDeliveryStats,
  DELIVERY_STATUS_LABELS,
  type DeliveryPriority,
  type UpcomingDelivery,
} from "@/server/services/delivery.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { DeliveryStatusSelect } from "@/components/deliveries/delivery-status-select"
import { formatDateShort } from "@/lib/utils/currency"

export const metadata: Metadata = { title: "Próximas entregas" }
export const dynamic = "force-dynamic"

const PRIORITY_BADGE: Record<DeliveryPriority, { label: string; cls: string }> = {
  alta: { label: "Alta", cls: "bg-red-100 text-red-700" },
  media: { label: "Media", cls: "bg-amber-100 text-amber-700" },
  baja: { label: "Baja", cls: "bg-muted text-muted-foreground" },
}

function fmt(d: string | null): string {
  return d ? formatDateShort(new Date(d + "T00:00:00")) : "—"
}

function daysLabel(n: number | null): { text: string; cls: string } {
  if (n === null) return { text: "—", cls: "text-muted-foreground" }
  if (n < 0) return { text: `Vencida hace ${Math.abs(n)} d`, cls: "text-red-600 font-medium" }
  if (n === 0) return { text: "Hoy", cls: "text-red-600 font-medium" }
  if (n <= 3) return { text: `En ${n} d`, cls: "text-amber-600 font-medium" }
  return { text: `En ${n} d`, cls: "text-foreground" }
}

export default async function DeliveriesPage() {
  const session = await requireStudioAuth()
  const [deliveries, stats, unread] = await Promise.all([
    listDeliveries(session.studioId, { includeDelivered: false }),
    getDeliveryStats(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  const statCards = [
    { label: "Próximas", value: stats.upcoming, icon: Truck, cls: "text-foreground" },
    { label: "Atrasadas", value: stats.overdue, icon: AlertTriangle, cls: "text-red-600" },
    { label: "Cumpleaños ≤ 7 días", value: stats.birthdaysSoon, icon: Cake, cls: "text-pink-600" },
    { label: "Riesgo de retraso", value: stats.lateRisks, icon: AlertTriangle, cls: "text-amber-600" },
    { label: "Esta semana", value: stats.dueThisWeek, icon: CalendarClock, cls: "text-foreground" },
  ]

  return (
    <>
      <AppTopbar
        eyebrow="Estudio"
        title="Próximas entregas"
        description="Planificación inteligente de entregas: prioriza por cumpleaños y tiempo comprometido"
        unreadNotifications={unread}
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
        {/* Widgets resumen */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {statCards.map((c) => {
            const Icon = c.icon
            return (
              <div key={c.label} className="sf-card p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                  <span className="text-[11px] uppercase tracking-wide">{c.label}</span>
                </div>
                <p className={`mt-1 text-2xl font-bold ${c.cls}`}>{c.value}</p>
              </div>
            )
          })}
        </div>

        {/* Tabla de entregas */}
        <div className="sf-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border/60 px-5 py-4">
            <Truck className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">
              Entregas activas ({deliveries.length})
            </h2>
          </div>

          {deliveries.length === 0 ? (
            <div className="py-12 text-center">
              <Truck className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No hay entregas activas. Se crean automáticamente al confirmar el
                pago de una sesión.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-medium">Cliente</th>
                    <th className="px-3 py-2.5 text-left font-medium">Sesión</th>
                    <th className="px-3 py-2.5 text-left font-medium">Cumpleaños</th>
                    <th className="px-3 py-2.5 text-right font-medium">Entrega</th>
                    <th className="px-3 py-2.5 text-left font-medium">Fecha estimada</th>
                    <th className="px-3 py-2.5 text-left font-medium">Días restantes</th>
                    <th className="px-3 py-2.5 text-left font-medium">Prioridad</th>
                    <th className="px-3 py-2.5 text-left font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {deliveries.map((d: UpcomingDelivery) => {
                    const prio = PRIORITY_BADGE[d.priority]
                    const dl = daysLabel(d.daysUntilDelivery)
                    return (
                      <tr key={d.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          {d.projectId ? (
                            <Link
                              href={`/projects/${d.projectId}`}
                              className="font-medium text-foreground hover:text-primary"
                            >
                              {d.clientName}
                            </Link>
                          ) : (
                            <span className="font-medium text-foreground">{d.clientName}</span>
                          )}
                          <p className="text-[11px] text-muted-foreground">{d.projectName}</p>
                        </td>
                        <td className="px-3 py-3 text-foreground/80">{fmt(d.sessionDate)}</td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-1 text-foreground/80">
                            {d.birthday ? <Cake className="h-3 w-3 text-pink-500" /> : null}
                            {fmt(d.birthday)}
                          </span>
                          {d.daysUntilBirthday !== null &&
                            d.daysUntilBirthday >= 0 &&
                            d.daysUntilBirthday <= 7 && (
                              <p className="text-[11px] font-medium text-pink-600">
                                {d.daysUntilBirthday === 0
                                  ? "¡Es hoy!"
                                  : `En ${d.daysUntilBirthday} d`}
                              </p>
                            )}
                        </td>
                        <td className="px-3 py-3 text-right text-foreground/80">
                          {d.deliveryDays != null ? `${d.deliveryDays} d` : "—"}
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-foreground/80">{fmt(d.estimatedDeliveryDate)}</span>
                          {d.lateRisk && (
                            <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
                              <AlertTriangle className="h-3 w-3" /> Después del cumpleaños
                            </p>
                          )}
                          {!d.commitmentStarted && (
                            <p className="text-[11px] text-muted-foreground">
                              <Clock className="mr-1 inline h-3 w-3" />
                              compromiso aún no inicia
                            </p>
                          )}
                        </td>
                        <td className={`px-3 py-3 ${dl.cls}`}>{dl.text}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${prio.cls}`}
                          >
                            {prio.label}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <DeliveryStatusSelect deliveryId={d.id} status={d.status} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-border/60 px-5 py-3 text-[11px] text-muted-foreground">
            Las entregas se ordenan por urgencia (prioridad → deadline más
            próximo). El compromiso de entrega inicia cuando la sesión se realizó
            y el pago está confirmado; <strong>{DELIVERY_STATUS_LABELS.retrasada}</strong>{" "}
            se marca solo si la fecha estimada vence.
          </div>
        </div>
      </div>
    </>
  )
}
