import type { Metadata } from "next"
import {
  Receipt,
  ArrowRight,
  Plus,
  Download,
} from "lucide-react"
import Link from "next/link"

import { requireStudioAuth } from "@/server/middleware/auth"
import { createSupabaseServerClient } from "@/server/supabase/server"
import {
  getMonthlyRevenue,
  getTopPackages,
  getRecentActivity,
} from "@/server/services/dashboard.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { formatCurrency } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { StatCard } from "@/components/shared/stat-card"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { RevenueLineChart } from "@/components/dashboard/revenue-line-chart"
import { GoalsProgress } from "@/components/dashboard/goals-progress"
import { RecentActivityRich } from "@/components/dashboard/recent-activity-rich"
import { TopPackagesList } from "@/components/dashboard/top-packages-list"
import { UpcomingSessions } from "@/components/dashboard/upcoming-sessions"

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

  const [data, monthlyRevenue, topPackages, unreadNotifications, recentActivity] =
    await Promise.all([
      getDashboardData(session.studioId),
      getMonthlyRevenue(session.studioId, 12),
      getTopPackages(session.studioId, 5, 5),
      countUnreadNotifications(session.studioId),
      getRecentActivity(session.studioId, 12).catch(() => []),
    ])

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

  // Goals derivados de datos reales
  const cobranzaPct =
    data.stats.revenue + data.stats.pending > 0
      ? (data.stats.revenue / (data.stats.revenue + data.stats.pending)) * 100
      : 0

  const ocupacionPct = Math.min(
    100,
    (data.upcomingProjects.length / 8) * 100,
  )

  // Capacidad activa: % de proyectos activos sobre clientes (rough proxy)
  const capacidadPct =
    data.stats.clients > 0
      ? Math.min(100, (data.stats.activeProjects / data.stats.clients) * 100)
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
            <Link href="/projects/new">Nuevo proyecto</Link>
          </Button>
        </div>
      </div>

      <div className="px-6 pb-12 pt-4 lg:px-8">
        <div className="space-y-5">
          {/* ─── KPIs (todos clickables) ──────────────────────────── */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              title="Ingresos del mes"
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
              value={data.stats.clients}
              subtitle="Base activa"
              href="/clients"
              tooltip="Ver lista de clientes"
              delay={0.1}
            />
            <StatCard
              title="Proyectos activos"
              value={data.stats.activeProjects}
              subtitle="Reservados + en proceso"
              href="/projects?status=in_progress"
              tooltip="Ver proyectos activos"
              delay={0.15}
            />
          </div>

          {/* ─── Main row: Revenue chart + Goals ────────────────────── */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <DashboardCard title="Tendencia de ingresos" delay={0.2}>
                <RevenueLineChart buckets={monthlyRevenue} currency="DOP" />
              </DashboardCard>
            </div>

            <DashboardCard title="Metas del mes" delay={0.25}>
              <GoalsProgress
                goals={[
                  {
                    label: "Cobranza",
                    value: cobranzaPct,
                    tone: "blue",
                    hint:
                      data.stats.pending > 0
                        ? `${formatCurrency(data.stats.pending, "DOP")} pendiente`
                        : "Al día",
                  },
                  {
                    label: "Ocupación calendario",
                    value: ocupacionPct,
                    tone: "violet",
                    hint: `${data.upcomingProjects.length} sesiones próximas`,
                  },
                  {
                    label: "Capacidad activa",
                    value: capacidadPct,
                    tone: "emerald",
                    hint: `${data.stats.activeProjects} de ${data.stats.clients} clientes`,
                  },
                ]}
              />
            </DashboardCard>
          </div>

          {/* ─── Recent Activity + Upcoming sessions ────────────────── */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <DashboardCard
                title="Actividad reciente"
                href="/notifications"
                hrefLabel="Ver todo"
                delay={0.3}
              >
                <RecentActivityRich items={recentActivity} />
              </DashboardCard>
            </div>

            <DashboardCard
              title="Próximas sesiones"
              href="/calendar"
              hrefLabel="Ver calendario"
              bodyClassName="px-0 pb-0"
              delay={0.35}
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
