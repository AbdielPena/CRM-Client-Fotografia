import {
  Building2,
  Users,
  BadgeDollarSign,
  CalendarCheck,
  Ban,
  Sparkles,
} from "lucide-react"

import { AppTopbar } from "@/components/layout/app-topbar"
import { StatCard } from "@/components/shared/stat-card"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { getPlatformGlobalStats } from "@/server/services/platform-admin.service"
import { formatCurrency } from "@/lib/utils/currency"

export default async function PlatformOverviewPage() {
  const stats = await getPlatformGlobalStats()

  return (
    <>
      <AppTopbar
        eyebrow="Super admin"
        title="Platform"
        description="Visión global de todos los studios en PixelOS — la salud del ecosistema en un vistazo."
        display
      />

      <div className="space-y-6 px-6 py-8 lg:px-8 lg:py-10">
        {/* ========== KPIs ========== */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            title="Studios totales"
            value={stats.totalStudios}
            icon={<Building2 className="h-5 w-5" />}
            subtitle={`+${stats.studiosCreatedLast30d} nuevos en 30d`}
            accent
            delay={0}
          />
          <StatCard
            title="Activos"
            value={stats.activeStudios}
            icon={<Sparkles className="h-5 w-5" />}
            subtitle={`${stats.suspendedStudios} suspendidos`}
            delay={0.05}
          />
          <StatCard
            title="Usuarios"
            value={stats.totalUsers}
            icon={<Users className="h-5 w-5" />}
            subtitle="En todos los studios"
            delay={0.1}
          />
          <StatCard
            title="Revenue global"
            value={formatCurrency(stats.totalRevenueDop, "DOP")}
            icon={<BadgeDollarSign className="h-5 w-5" />}
            subtitle={`${stats.totalBookings} solicitudes de booking`}
            delay={0.15}
          />
        </div>

        {/* ========== Distribución por plan ========== */}
        <DashboardCard
          title="Studios por plan"
          icon={<CalendarCheck className="h-5 w-5" />}
          delay={0.2}
        >
          {stats.studiosByPlan.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Ban className="h-4 w-4" />
              </span>
              <p className="text-body-sm text-muted-foreground">
                Sin studios aún.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {stats.studiosByPlan
                .slice()
                .sort((a, b) => b.count - a.count)
                .map((row, i) => {
                  const pct = stats.totalStudios
                    ? Math.round((row.count / stats.totalStudios) * 100)
                    : 0
                  return (
                    <div key={row.planSlug ?? "__none__"}>
                      <div className="mb-1.5 flex items-center justify-between text-caption">
                        <span className="font-semibold text-foreground">
                          {row.planName ?? "Sin plan"}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {row.count}{" "}
                          <span className="text-foreground/60">· {pct}%</span>
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-aurora shadow-glow transition-all duration-700"
                          style={{
                            width: `${Math.max(pct, row.count > 0 ? 4 : 0)}%`,
                            animationDelay: `${i * 60}ms`,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </DashboardCard>
      </div>
    </>
  )
}
