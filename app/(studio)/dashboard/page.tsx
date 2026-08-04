import type { Metadata } from "next"
import { Plus, CheckSquare, Clock } from "lucide-react"
import Link from "next/link"

import { requireStudioAuth } from "@/server/middleware/auth"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { getTasksThisWeek } from "@/server/services/dashboard.service"
import { getRecentActivity } from "@/server/services/activity.service"
import { listStudioPrintOverview } from "@/server/services/print-selection.service"
import {
  autoDetectCompletedSteps,
  calculateProgress,
  getOnboardingSteps,
} from "@/server/services/onboarding.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { listUpcomingDeliveriesByTrack } from "@/server/services/delivery.service"
import { UpcomingDeliveriesAside } from "@/components/deliveries/upcoming-deliveries-aside"
import { formatDateShort } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { StatCard } from "@/components/shared/stat-card"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { UpcomingSessions } from "@/components/dashboard/upcoming-sessions"
import { RecentActivityList } from "@/components/dashboard/recent-activity-list"
import { PendingPrintsList } from "@/components/dashboard/pending-prints-list"
import { OnboardingBanner } from "@/components/dashboard/onboarding-banner"

export const metadata: Metadata = { title: "Dashboard" }

/**
 * Etiquetas de estado que significan "ya terminó" y por eso NO cuentan como
 * sesión activa ni salen en "Próximas sesiones". Va en el formato de lista que
 * entiende PostgREST. Ojo: `projects.status` guarda ETIQUETAS del tablero, no
 * el enum — filtrar por 'booked'/'in_progress' daba cero.
 */
const TERMINADAS_PG =
  '("Entregado","Completado","Cancelado","Finalizado total","delivered","completed","cancelled","archived")'

async function getDashboardData(studioId: string) {
  const supabase = createSupabaseServerClient()
  const now = new Date()

  const [
    totalClientsRes,
    activeProjectsRes,
    upcomingProjectsRes,
    pendingBookingsRes,
    recentClientsRes,
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .is("deleted_at", null),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .is("deleted_at", null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .is("finalized_at" as any, null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .is("cancelled_at" as any, null)
      .not("status", "in", TERMINADAS_PG),
    supabase
      .from("projects")
      .select(`id, name, event_date, event_time, status, client:clients(name)`)
      .eq("studio_id", studioId)
      .is("deleted_at", null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .is("finalized_at" as any, null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .is("cancelled_at" as any, null)
      .not("event_date", "is", null)
      .gte("event_date", now.toISOString().slice(0, 10))
      .not("status", "in", TERMINADAS_PG)
      .order("event_date", { ascending: true })
      .limit(6),
    supabase
      .from("booking_requests")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      // Las que esperan algo tuyo: por revisar, aprobadas sin confirmar y
      // esperando el pago del cliente. Contar solo `pending_review` daba 0
      // casi siempre y la tarjeta no servía para nada.
      .in("status", ["pending_review", "approved", "awaiting_payment"]),
    supabase
      .from("clients")
      .select("id, name, email, created_at")
      .eq("studio_id", studioId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
  ])

  return {
    stats: {
      clients: totalClientsRes.count ?? 0,
      activeProjects: activeProjectsRes.count ?? 0,
      pendingBookings: pendingBookingsRes.count ?? 0,
    },
    upcomingProjects: upcomingProjectsRes.data ?? [],
    recentClients: recentClientsRes.data ?? [],
  }
}

export default async function DashboardPage() {
  const session = await requireStudioAuth()

  // Auto-detect onboarding steps completados desde data real (no bloquea render)
  void autoDetectCompletedSteps(session.studioId).catch(() => null)

  const [
    data,
    unreadNotifications,
    onboardingSteps,
    upcomingEntries,
    weekTasks,
    recentActivity,
    printItems,
  ] = await Promise.all([
    getDashboardData(session.studioId),
    countUnreadNotifications(session.studioId),
    getOnboardingSteps(session.studioId).catch(() => []),
    listUpcomingDeliveriesByTrack(session.studioId, { limit: 5 }).catch(() => ({
      digital: [],
      prints: [],
    })),
    getTasksThisWeek(session.studioId, 7).catch(() => []),
    getRecentActivity(session.studioId, 10).catch(() => []),
    listStudioPrintOverview(session.studioId).catch(() => []),
  ])

  // Impresiones que esperan algo del cliente (ni empezó, o empezó sin enviar).
  const pendingPrints = printItems.filter(
    (p) => p.status === "pending" || p.status === "in_progress",
  )

  const onboardingProgress = calculateProgress(onboardingSteps)

  const firstName = (session.name || session.email).split(" ")[0]

  // Activity feed: lectura real del activity_log con metadata + href + flag huérfano

  return (
    <>
      <AppTopbar unreadNotifications={unreadNotifications} />

      {/* ─── Header de la página ───────────────────────────────────── */}
      <div className="flex flex-col gap-3 px-6 pt-6 pb-2 lg:flex-row lg:items-end lg:justify-between lg:px-8">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            Bienvenido de vuelta, {firstName}. Este es el pulso de tu estudio hoy.
          </p>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <Button asChild size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />}>
            <Link href="/projects/new">Nueva sesión</Link>
          </Button>
        </div>
      </div>

      <div className="px-6 pb-12 pt-4 lg:px-8">
        <div className="space-y-5">
          {/* ─── Tareas pendientes + Próximas sesiones (arriba de todo) ── */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <DashboardCard
                  title="Tareas más próximas"
                  href="/tasks"
                  hrefLabel="Ver tareas"
                  bodyClassName="px-0 pb-0"
                  delay={0.05}
                >
                  {weekTasks.length === 0 ? (
                    <p className="px-5 py-6 text-center text-[13px] text-muted-foreground">
                      No tienes tareas pendientes.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border/40">
                      {weekTasks.slice(0, 7).map((t) => (
                        <li key={t.id}>
                          <Link
                            href={t.href ?? "/tasks"}
                            className="flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-muted/40"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <CheckSquare
                                className={`h-3.5 w-3.5 shrink-0 ${
                                  t.overdue ? "text-red-500" : "text-muted-foreground"
                                }`}
                              />
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-medium text-foreground">
                                  {t.title}
                                </p>
                                {t.clientName && (
                                  <p className="truncate text-[11px] text-muted-foreground">
                                    {t.clientName}
                                  </p>
                                )}
                              </div>
                            </div>
                            <span
                              className={`flex shrink-0 items-center gap-1 text-[11px] font-medium ${
                                t.overdue ? "text-red-600" : "text-muted-foreground"
                              }`}
                            >
                              <Clock className="h-3 w-3" />
                              {t.overdue ? "Vencida · " : ""}
                              {t.dueDate
                                ? formatDateShort(new Date(t.dueDate + "T00:00:00"))
                                : "—"}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </DashboardCard>
              </div>

              <DashboardCard
                title="Próximas sesiones"
                href="/calendar"
                hrefLabel="Ver calendario"
                bodyClassName="px-0 pb-0"
                delay={0.1}
              >
                <UpcomingSessions
                  projects={
                    data.upcomingProjects as React.ComponentProps<
                      typeof UpcomingSessions
                    >["projects"]
                  }
                />
              </DashboardCard>
            </div>

          {/* ─── Registros recientes + Impresiones pendientes ───────────── */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <DashboardCard
                title="Registros recientes"
                href="/notificaciones"
                hrefLabel="Ver todo"
                bodyClassName="px-0 pb-0"
                delay={0.15}
              >
                <RecentActivityList items={recentActivity} />
              </DashboardCard>
            </div>

            <DashboardCard
              title={
                pendingPrints.length > 0
                  ? `Impresiones pendientes (${pendingPrints.length})`
                  : "Impresiones pendientes"
              }
              href="/impresiones"
              hrefLabel="Ver impresiones"
              bodyClassName="px-0 pb-0"
              delay={0.2}
            >
              <PendingPrintsList items={pendingPrints.slice(0, 6)} />
            </DashboardCard>
          </div>

          {/* ─── Onboarding banner (solo si <100%) ─────────────── */}
          {onboardingProgress.percentage < 100 && onboardingSteps.length > 0 && (
            <OnboardingBanner
              percentage={onboardingProgress.percentage}
              completed={onboardingProgress.completed}
              total={onboardingProgress.total}
            />
          )}

          {/* ─── KPIs (todos clickables) ──────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              title="Solicitudes por atender"
              tone="amber"
              value={data.stats.pendingBookings}
              subtitle={
                data.stats.pendingBookings > 0
                  ? "Por revisar o esperando pago"
                  : "Todo al día"
              }
              href="/bookings"
              tooltip="Ver solicitudes pendientes"
              delay={0.05}
            />
            <StatCard
              title="Clientes"
              tone="violet"
              value={data.stats.clients}
              subtitle="Base activa"
              href="/clients"
              tooltip="Ver lista de clientes"
              delay={0.1}
            />
            <StatCard
              title="Sesiones activas"
              tone="emerald"
              value={data.stats.activeProjects}
              subtitle="Reservadas + en proceso"
              href="/projects?status=in_progress"
              tooltip="Ver sesiones activas"
              delay={0.15}
            />
          </div>

          {/* ─── Próximas entregas (ordenadas por fecha, incl. galerías) ── */}
          {upcomingEntries.digital.length + upcomingEntries.prints.length > 0 && (
            <DashboardCard
              title="Próximas entregas"
              href="/deliveries"
              hrefLabel="Ver todas"
              delay={0.38}
            >
              <UpcomingDeliveriesAside
                digital={upcomingEntries.digital}
                prints={upcomingEntries.prints}
                showHeader={false}
              />
            </DashboardCard>
          )}

        </div>
      </div>
    </>
  )
}
