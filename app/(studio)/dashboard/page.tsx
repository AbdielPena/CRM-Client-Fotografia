import type { Metadata } from "next"
import {
  Users,
  UserCheck,
  FolderOpen,
  CalendarDays,
  TrendingUp,
  BarChart3,
  Filter,
  Package,
  PieChart,
  Receipt,
  ArrowRight,
} from "lucide-react"
import Link from "next/link"

import { requireStudioAuth } from "@/server/middleware/auth"
import { createSupabaseServerClient } from "@/server/supabase/server"
import {
  getMonthlyRevenue,
  getBookingsFunnel,
  getTopPackages,
  getLeadConversion,
  getProjectsByStatus,
} from "@/server/services/dashboard.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { formatCurrency } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { StatCard } from "@/components/shared/stat-card"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { RevenueBarChart } from "@/components/dashboard/revenue-bar-chart"
import { FunnelWidget } from "@/components/dashboard/funnel-widget"
import { TopPackagesList } from "@/components/dashboard/top-packages-list"
import { ProjectsByStatus } from "@/components/dashboard/projects-by-status"
import { LeadConversionDonut } from "@/components/dashboard/lead-conversion-donut"
import { UpcomingSessions } from "@/components/dashboard/upcoming-sessions"
import { RecentLeads } from "@/components/dashboard/recent-leads"

export const metadata: Metadata = { title: "Dashboard" }

async function getDashboardData(studioId: string) {
  const supabase = createSupabaseServerClient()
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfMonthIso = startOfMonth.toISOString()

  const [
    totalLeadsRes,
    newLeadsMonthRes,
    totalClientsRes,
    activeProjectsRes,
    pendingInvoicesRes,
    paymentsMonthRes,
    upcomingProjectsRes,
    recentLeadsRes,
  ] = await Promise.all([
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .is("deleted_at", null),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .gte("created_at", startOfMonthIso)
      .is("deleted_at", null),
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
      .from("leads")
      .select("*")
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
      leads: { total: totalLeadsRes.count ?? 0, thisMonth: newLeadsMonthRes.count ?? 0 },
      clients: totalClientsRes.count ?? 0,
      activeProjects: activeProjectsRes.count ?? 0,
      revenue: revenueMonth,
      pending: pendingAmount,
    },
    upcomingProjects: upcomingProjectsRes.data ?? [],
    recentLeads: recentLeadsRes.data ?? [],
  }
}

export default async function DashboardPage() {
  const session = await requireStudioAuth()

  const [
    data,
    monthlyRevenue,
    funnel,
    topPackages,
    leadConversion,
    projectsByStatus,
    unreadNotifications,
  ] = await Promise.all([
    getDashboardData(session.studioId),
    getMonthlyRevenue(session.studioId, 12),
    getBookingsFunnel(session.studioId),
    getTopPackages(session.studioId, 6, 5),
    getLeadConversion(session.studioId, 3),
    getProjectsByStatus(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? "Buenos días" : hour < 18 ? "Buenas tardes" : "Buenas noches"
  const firstName = (session.name || session.email).split(" ")[0]
  const today = new Date().toLocaleDateString("es-DO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })

  return (
    <>
      {/* Topbar mínimo — solo notificaciones */}
      <AppTopbar unreadNotifications={unreadNotifications} />

      <div className="px-6 pb-12 pt-2 lg:px-8">

        {/* ─── Hero greeting ──────────────────────────────────────────── */}
        <div className="mb-8 mt-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-brand">
            {today}
          </p>
          <h1 className="font-display text-[2.75rem] font-normal leading-tight text-foreground lg:text-[3.25rem]">
            {greeting},{" "}
            <span className="bg-gradient-to-br from-brand to-violet-400 bg-clip-text text-transparent">
              {firstName}
            </span>
          </h1>
          <p className="mt-1.5 text-base text-muted-foreground">
            Este es el pulso de tu estudio hoy.
          </p>
        </div>

        <div className="space-y-6">
          {/* ─── KPIs ───────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              title="Ingresos del mes"
              value={formatCurrency(data.stats.revenue, "DOP")}
              subtitle={
                data.stats.pending > 0
                  ? `${formatCurrency(data.stats.pending, "DOP")} por cobrar`
                  : "Al día con los cobros"
              }
              icon={<TrendingUp className="h-4 w-4" />}
              accent
              delay={0}
            />
            <StatCard
              title="Leads totales"
              value={data.stats.leads.total}
              subtitle={
                data.stats.leads.thisMonth > 0
                  ? `+${data.stats.leads.thisMonth} este mes`
                  : "Sin leads nuevos aún"
              }
              icon={<UserCheck className="h-4 w-4" />}
              delay={0.05}
            />
            <StatCard
              title="Clientes"
              value={data.stats.clients}
              subtitle="Base activa"
              icon={<Users className="h-4 w-4" />}
              delay={0.1}
            />
            <StatCard
              title="Proyectos activos"
              value={data.stats.activeProjects}
              subtitle="Reservados + en proceso"
              icon={<FolderOpen className="h-4 w-4" />}
              delay={0.15}
            />
          </div>

          {/* ─── Revenue chart ──────────────────────────────────────── */}
          <DashboardCard
            title="Ingresos mensuales"
            icon={<BarChart3 className="h-3.5 w-3.5" />}
            delay={0.2}
          >
            <RevenueBarChart buckets={monthlyRevenue} currency="DOP" />
          </DashboardCard>

          {/* ─── Funnel + Donut ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <DashboardCard
              title="Embudo de reservas (mes actual)"
              icon={<Filter className="h-3.5 w-3.5" />}
              delay={0.25}
            >
              <FunnelWidget data={funnel} />
            </DashboardCard>

            <DashboardCard
              title="Conversión de leads (3 meses)"
              icon={<PieChart className="h-3.5 w-3.5" />}
              delay={0.3}
            >
              <LeadConversionDonut data={leadConversion} />
            </DashboardCard>
          </div>

          {/* ─── Packages + Projects by status ──────────────────────── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <DashboardCard
              title="Paquetes más vendidos (6 meses)"
              icon={<Package className="h-3.5 w-3.5" />}
              href="/settings/packages"
              hrefLabel="Ver paquetes"
              delay={0.35}
            >
              <TopPackagesList items={topPackages} currency="DOP" />
            </DashboardCard>

            <DashboardCard
              title="Proyectos por estado"
              icon={<FolderOpen className="h-3.5 w-3.5" />}
              href="/projects"
              hrefLabel="Ver proyectos"
              delay={0.4}
            >
              <ProjectsByStatus rows={projectsByStatus} />
            </DashboardCard>
          </div>

          {/* ─── Upcoming + Recent leads ─────────────────────────────── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <DashboardCard
              title="Próximas sesiones"
              icon={<CalendarDays className="h-3.5 w-3.5" />}
              href="/calendar"
              hrefLabel="Ver calendario"
              bodyClassName="px-0 pb-0"
              delay={0.45}
            >
              <UpcomingSessions
                projects={
                  data.upcomingProjects as React.ComponentProps<
                    typeof UpcomingSessions
                  >["projects"]
                }
              />
            </DashboardCard>

            <DashboardCard
              title="Leads recientes"
              icon={<UserCheck className="h-3.5 w-3.5" />}
              href="/leads"
              hrefLabel="Ver todos"
              bodyClassName="px-0 pb-0"
              delay={0.5}
            >
              <RecentLeads
                leads={
                  data.recentLeads as React.ComponentProps<
                    typeof RecentLeads
                  >["leads"]
                }
              />
            </DashboardCard>
          </div>

          {/* ─── Pending invoices banner ─────────────────────────────── */}
          {data.stats.pending > 0 && (
            <div className="flex items-center justify-between gap-4 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 dark:border-amber-800/40 dark:bg-amber-900/20">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
                  <Receipt className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    {formatCurrency(data.stats.pending, "DOP")} por cobrar
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Revisa tus facturas pendientes y acelera el flujo de caja.
                  </p>
                </div>
              </div>
              <Link
                href="/invoices?status=pending"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3.5 py-2 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
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
