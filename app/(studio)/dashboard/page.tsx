import type { Metadata } from "next"
import {
  Receipt,
  ArrowRight,
  Plus,
  Download,
  CheckSquare,
  Clock,
  Users,
  Shirt,
} from "lucide-react"
import Link from "next/link"

import { requireStudioAuth } from "@/server/middleware/auth"
import { createSupabaseServerClient } from "@/server/supabase/server"
import {
  getMonthlyRevenue,
  getTopPackages,
  getTasksThisWeek,
  getSessionFinanceStats,
} from "@/server/services/dashboard.service"
import { getModulesOverview } from "@/server/services/modules-overview.service"
import {
  autoDetectCompletedSteps,
  calculateProgress,
  getOnboardingSteps,
} from "@/server/services/onboarding.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { listUpcomingDeliveryEntries } from "@/server/services/delivery.service"
import { UpcomingDeliveriesAside } from "@/components/deliveries/upcoming-deliveries-aside"
import { formatCurrency, formatDateShort } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { StatCard } from "@/components/shared/stat-card"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { RevenueLineChart } from "@/components/dashboard/revenue-line-chart"
import { TopPackagesList } from "@/components/dashboard/top-packages-list"
import { UpcomingSessions } from "@/components/dashboard/upcoming-sessions"
import { ModulesOverview } from "@/components/dashboard/modules-overview"
import { OnboardingBanner } from "@/components/dashboard/onboarding-banner"

export const metadata: Metadata = { title: "Dashboard" }

async function getDashboardData(studioId: string) {
  const supabase = createSupabaseServerClient()
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfMonthIso = startOfMonth.toISOString()

  const [
    totalClientsRes,
    activeProjectsRes,
    pendingInvoicesRes,
    paymentsMonthRes,
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
      .in("status", ["booked", "in_progress", "editing"]),
    supabase
      .from("invoices")
      .select("total, amount_paid, status")
      .eq("studio_id", studioId)
      .is("deleted_at", null)
      .in("status", ["sent", "pending", "partially_paid", "overdue", "viewed"]),
    supabase
      .from("payments")
      .select("amount")
      .eq("studio_id", studioId)
      .eq("status", "completed")
      .is("deleted_at", null)
      .gte("received_at", startOfMonthIso),
    supabase
      .from("projects")
      .select(`id, name, event_date, event_time, status, client:clients(name)`)
      .eq("studio_id", studioId)
      .is("deleted_at", null)
      .not("event_date", "is", null)
      .gte("event_date", now.toISOString().slice(0, 10))
      .in("status", ["booked", "in_progress"])
      .order("event_date", { ascending: true })
      .limit(5),
    supabase
      .from("booking_requests")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .eq("status", "pending_review"),
    supabase
      .from("clients")
      .select("id, name, email, created_at")
      .eq("studio_id", studioId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
  ])

  type InvoiceRow = { total: number | string; amount_paid: number | string | null }
  type PaymentRow = { amount: number | string }
  const pendingInvoices = (pendingInvoicesRes.data ?? []) as InvoiceRow[]
  const pendingAmount = pendingInvoices.reduce(
    (s, i) => s + (Number(i.total) - Number(i.amount_paid ?? 0)),
    0,
  )
  const paymentsMonth = (paymentsMonthRes.data ?? []) as PaymentRow[]
  const revenueMonth = paymentsMonth.reduce((s, p) => s + Number(p.amount), 0)

  return {
    stats: {
      clients: totalClientsRes.count ?? 0,
      activeProjects: activeProjectsRes.count ?? 0,
      revenue: revenueMonth,
      pending: pendingAmount,
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
    monthlyRevenue,
    topPackages,
    unreadNotifications,
    modulesOverview,
    onboardingSteps,
    upcomingEntries,
    weekTasks,
    financeStats,
  ] = await Promise.all([
    getDashboardData(session.studioId),
    getMonthlyRevenue(session.studioId, 12),
    getTopPackages(session.studioId, 5, 5),
    countUnreadNotifications(session.studioId),
    getModulesOverview(session.studioId).catch(
      () => ({}) as Awaited<ReturnType<typeof getModulesOverview>>,
    ),
    getOnboardingSteps(session.studioId).catch(() => []),
    listUpcomingDeliveryEntries(session.studioId, { limit: 8 }).catch(() => []),
    getTasksThisWeek(session.studioId, 7).catch(() => []),
    getSessionFinanceStats(session.studioId).catch(() => ({
      collaboratorDebt: 0,
      collaboratorDebtCount: 0,
      dressDebt: 0,
      dressDebtCount: 0,
      currency: "DOP",
    })),
  ])

  const onboardingProgress = calculateProgress(onboardingSteps)

  const firstName = (session.name || session.email).split(" ")[0]

  // Trends — calculados a partir de monthlyRevenue (últimos 2 meses)
  const lastMonth = monthlyRevenue.at(-2)?.revenue ?? 0
  const thisMonth = monthlyRevenue.at(-1)?.revenue ?? 0
  const revenueTrend =
    lastMonth > 0
      ? Number((((thisMonth - lastMonth) / lastMonth) * 100).toFixed(1))
      : thisMonth > 0
        ? 100
        : 0

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
          <Button variant="secondary" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />}>
            Exportar
          </Button>
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
                  title="Tareas pendientes"
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

          {/* ─── Onboarding banner (solo si <100%) ─────────────── */}
          {onboardingProgress.percentage < 100 && onboardingSteps.length > 0 && (
            <OnboardingBanner
              percentage={onboardingProgress.percentage}
              completed={onboardingProgress.completed}
              total={onboardingProgress.total}
            />
          )}

          {/* ─── Modules overview (cross-módulo) ────────────────── */}
          {(modulesOverview.finance ||
            modulesOverview.inventory ||
            modulesOverview.mail) && (
            <section>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Tus módulos
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Resumen de actividad por área
                </p>
              </div>
              <ModulesOverview data={modulesOverview} />
            </section>
          )}

          {/* ─── KPIs (todos clickables) ──────────────────────────── */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              title="Ingresos del mes"
              tone="blue"
              value={formatCurrency(data.stats.revenue, "DOP")}
              trend={
                revenueTrend !== 0
                  ? { value: revenueTrend, label: "vs mes anterior" }
                  : undefined
              }
              subtitle={
                data.stats.pending > 0
                  ? `${formatCurrency(data.stats.pending, "DOP")} por cobrar`
                  : "Al día con los cobros"
              }
              href={`/invoices?month=${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`}
              tooltip="Ver facturas y pagos del mes"
              delay={0}
            />
            <StatCard
              title="Solicitudes nuevas"
              tone="amber"
              value={data.stats.pendingBookings}
              subtitle={
                data.stats.pendingBookings > 0
                  ? "Pendientes de revisar"
                  : "Sin solicitudes nuevas"
              }
              href="/bookings?status=pending_review"
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

          {/* ─── Tendencia de ingresos (ancho completo) ────────────── */}
          <DashboardCard title="Tendencia de ingresos" delay={0.2}>
            <RevenueLineChart buckets={monthlyRevenue} currency="DOP" />
          </DashboardCard>

          {/* ─── Por pagar (deudas: colaboradores + vestidos) ─────── */}
          {(financeStats.collaboratorDebt > 0 || financeStats.dressDebt > 0) && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <DashboardCard title="Por pagar" delay={0.37}>
                <div className="space-y-3">
                  {financeStats.collaboratorDebt > 0 && (
                    <Link
                      href="/colaboradores"
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 transition-colors hover:bg-muted/40"
                    >
                      <span className="flex items-center gap-2 text-[13px] text-foreground">
                        <Users className="h-4 w-4 text-violet-500" />
                        Colaboradores
                        <span className="text-[11px] text-muted-foreground">
                          ({financeStats.collaboratorDebtCount})
                        </span>
                      </span>
                      <span className="text-[13px] font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                        {formatCurrency(financeStats.collaboratorDebt, financeStats.currency)}
                      </span>
                    </Link>
                  )}
                  {financeStats.dressDebt > 0 && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                      <span className="flex items-center gap-2 text-[13px] text-foreground">
                        <Shirt className="h-4 w-4 text-pink-500" />
                        Vestidos
                        <span className="text-[11px] text-muted-foreground">
                          ({financeStats.dressDebtCount})
                        </span>
                      </span>
                      <span className="text-[13px] font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                        {formatCurrency(financeStats.dressDebt, financeStats.currency)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                    <span className="text-[13px] font-semibold text-foreground">
                      Total por pagar
                    </span>
                    <span className="text-[14px] font-bold tabular-nums text-foreground">
                      {formatCurrency(
                        financeStats.collaboratorDebt + financeStats.dressDebt,
                        financeStats.currency,
                      )}
                    </span>
                  </div>
                </div>
              </DashboardCard>
            </div>
          )}

          {/* ─── Próximas entregas (ordenadas por fecha, incl. galerías) ── */}
          {upcomingEntries.length > 0 && (
            <DashboardCard
              title="Próximas entregas"
              href="/deliveries"
              hrefLabel="Ver todas"
              delay={0.38}
            >
              <UpcomingDeliveriesAside entries={upcomingEntries} showHeader={false} />
            </DashboardCard>
          )}

          {/* ─── Top packages ─────────────────────────────────────── */}
          <DashboardCard
            title="Paquetes más vendidos"
            href="/settings/packages"
            hrefLabel="Ver paquetes"
            delay={0.4}
          >
            <TopPackagesList items={topPackages} currency="DOP" />
          </DashboardCard>

          {/* ─── Pending banner ───────────────────────────────────── */}
          {data.stats.pending > 0 && (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-800/40 dark:bg-amber-900/15">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                  <Receipt className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[13.5px] font-semibold text-amber-900 dark:text-amber-200">
                    {formatCurrency(data.stats.pending, "DOP")} por cobrar
                  </p>
                  <p className="text-[12px] text-amber-700 dark:text-amber-400">
                    Revisa tus facturas pendientes y acelera el flujo de caja.
                  </p>
                </div>
              </div>
              <Link
                href="/invoices?status=pending"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-card px-3 py-1.5 text-[12.5px] font-semibold text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
              >
                Ver facturas
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
