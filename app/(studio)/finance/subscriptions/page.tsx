import Link from "next/link"
import {
  Repeat,
  Plus,
  CheckCircle2,
  PauseCircle,
  Calendar,
  TrendingUp,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getFinSubscriptions } from "@/server/services/fin-subscription.service"
import { formatCurrency, formatDateShort } from "@/lib/utils/currency"
import { d } from "@/lib/decimal"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableColumn,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table"

export const metadata: Metadata = { title: "Finanzas · Suscripciones" }

const MONTHLY_EQUIV: Record<string, number> = {
  semanal: 4.33,
  quincenal: 2,
  mensual: 1,
  bimestral: 0.5,
  trimestral: 1 / 3,
  semestral: 1 / 6,
  anual: 1 / 12,
}

const FRECUENCIA_LABELS: Record<string, string> = {
  semanal: "Semanal",
  quincenal: "Quincenal",
  mensual: "Mensual",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
}

export default async function FinanceSubscriptionsPage({
  searchParams,
}: {
  searchParams?: { active?: string }
}) {
  const session = await requireStudioAuth()
  const activeOnly = searchParams?.active !== "all"

  const [subs, unread] = await Promise.all([
    getFinSubscriptions(session.studioId, { activeOnly, pageSize: 100 }),
    countUnreadNotifications(session.studioId),
  ])

  // KPIs
  const activeSubs = subs.items.filter((s) => s.activa)
  const monthlyEquivalent = activeSubs.reduce(
    (acc, s) =>
      acc.plus(d(s.monto).times(MONTHLY_EQUIV[s.frecuencia] ?? 1)),
    d(0),
  )
  const annualEquivalent = monthlyEquivalent.times(12)

  // Próximas en 7 días
  const sevenDaysFromNow = new Date()
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)
  const upcoming = activeSubs.filter((s) => {
    if (!s.proxima_fecha) return false
    return new Date(s.proxima_fecha) <= sevenDaysFromNow
  })

  return (
    <>
      <AppTopbar
        eyebrow="Finanzas"
        title="Suscripciones"
        description="Gastos recurrentes automatizados: Adobe CC, hosting, seguros, etc. El cron diario crea el gasto en fin_transactions."
        unreadNotifications={unread}
        actions={
          <Button asChild>
            <Link href="/finance/subscriptions/new">
              <Plus className="mr-1 size-4" />
              Nueva suscripción
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {subs.items.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <KpiCard
              label="Activas"
              value={String(activeSubs.length)}
              icon={<CheckCircle2 className="size-4" />}
              tone="positive"
            />
            <KpiCard
              label="Próximas (7d)"
              value={String(upcoming.length)}
              icon={<Calendar className="size-4" />}
              tone={upcoming.length > 0 ? "warning" : "neutral"}
            />
            <KpiCard
              label="Costo mensual equivalente"
              value={formatCurrency(monthlyEquivalent.toNumber())}
              icon={<TrendingUp className="size-4" />}
              tone="neutral"
            />
            <KpiCard
              label="Costo anual equivalente"
              value={formatCurrency(annualEquivalent.toNumber())}
              icon={<TrendingUp className="size-4" />}
              tone="neutral"
            />
          </div>
        )}

        {/* Filtros */}
        <div className="flex items-center gap-2">
          <Link
            href="/finance/subscriptions"
            className={
              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
              (activeOnly
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background text-muted-foreground hover:bg-accent")
            }
          >
            Activas
          </Link>
          <Link
            href="/finance/subscriptions?active=all"
            className={
              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
              (!activeOnly
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background text-muted-foreground hover:bg-accent")
            }
          >
            Todas (incluye pausadas)
          </Link>
        </div>

        {subs.total === 0 ? (
          <EmptyState
            icon={<Repeat className="size-12 text-muted-foreground/60" />}
            title="Sin suscripciones registradas"
            description="Agrega tus gastos fijos recurrentes (software, servicios) y el sistema generará el cargo automáticamente cada periodo."
          >
            <Button asChild>
              <Link href="/finance/subscriptions/new">
                <Plus className="mr-1 size-4" />
                Primera suscripción
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <DataTable>
            <DataTableHeader>
              <DataTableRow>
                <DataTableColumn>Nombre</DataTableColumn>
                <DataTableColumn>Frecuencia</DataTableColumn>
                <DataTableColumn className="text-right">Monto</DataTableColumn>
                <DataTableColumn>Próxima fecha</DataTableColumn>
                <DataTableColumn>Cuenta / Tarjeta</DataTableColumn>
                <DataTableColumn>Estado</DataTableColumn>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {subs.items.map((s) => {
                const isOverdue =
                  s.activa &&
                  s.proxima_fecha &&
                  new Date(s.proxima_fecha) < new Date()
                return (
                  <DataTableRow key={s.id} className="hover:bg-accent/30">
                    <DataTableCell>
                      <Link
                        href={`/finance/subscriptions/${s.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {s.nombre}
                      </Link>
                      {s.categoria && (
                        <p className="text-[10px] text-muted-foreground">
                          {s.categoria.nombre}
                        </p>
                      )}
                    </DataTableCell>
                    <DataTableCell>
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                        {FRECUENCIA_LABELS[s.frecuencia] ?? s.frecuencia}
                      </span>
                    </DataTableCell>
                    <DataTableCell className="text-right tabular-nums">
                      {formatCurrency(Number(s.monto))}
                      {s.currency !== "DOP" && (
                        <span className="ml-1 text-[9px] text-muted-foreground">
                          {s.currency}
                        </span>
                      )}
                    </DataTableCell>
                    <DataTableCell
                      className={
                        "text-xs " +
                        (isOverdue
                          ? "font-semibold text-red-600"
                          : "text-muted-foreground")
                      }
                    >
                      {s.proxima_fecha
                        ? formatDateShort(new Date(s.proxima_fecha))
                        : "—"}
                      {isOverdue && (
                        <span className="ml-1 text-[9px]">(atrasada)</span>
                      )}
                    </DataTableCell>
                    <DataTableCell className="text-xs text-muted-foreground">
                      {s.cuenta?.nombre ??
                        s.tarjeta?.descripcion ??
                        "—"}
                    </DataTableCell>
                    <DataTableCell>
                      {s.activa ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          <CheckCircle2 className="size-3" />
                          Activa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                          <PauseCircle className="size-3" />
                          Pausada
                        </span>
                      )}
                    </DataTableCell>
                  </DataTableRow>
                )
              })}
            </DataTableBody>
          </DataTable>
        )}
      </main>
    </>
  )
}

function KpiCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: string
  icon: React.ReactNode
  tone: "positive" | "warning" | "neutral"
}) {
  const iconClass =
    tone === "positive"
      ? "text-emerald-500"
      : tone === "warning"
        ? "text-amber-500"
        : "text-muted-foreground"
  return (
    <div className="sf-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className={iconClass}>{icon}</span>
      </div>
      <p className="mt-2 text-lg font-bold tabular-nums">{value}</p>
    </div>
  )
}
