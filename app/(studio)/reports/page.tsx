import Link from "next/link"
import {
  BarChart3,
  TrendingUp,
  Wallet,
  AlertCircle,
  Crown,
  ArrowRight,
  Telescope,
  Download,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  getARAging,
  getCashFlow,
  getPLReport,
  getTopClients,
  getRevenueByCategory,
} from "@/server/services/reports.service"
import { getForecast } from "@/server/services/reports-forecast.service"
import { formatCurrency, formatDate } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { CategoryIcon } from "@/components/shared/icon-selector"
import { YearSelect } from "./year-select"

export const metadata: Metadata = { title: "Reportes" }

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: { year?: string }
}) {
  const session = await requireStudioAuth()
  const year = Number(searchParams?.year) || new Date().getFullYear()

  const [unread, pl, cashFlow, aging, topClients, forecast, revenueByCategory] =
    await Promise.all([
      countUnreadNotifications(session.studioId),
      getPLReport(session.studioId, { year }),
      getCashFlow(session.studioId, { months: 12 }),
      getARAging(session.studioId),
      getTopClients(session.studioId, { limit: 10, year }),
      getForecast(session.studioId, { months: 6 }).catch(() => []),
      getRevenueByCategory(session.studioId, { year }).catch(() => []),
    ])

  const categoryRevenueTotal = revenueByCategory.reduce(
    (s, c) => s + c.totalRevenue,
    0,
  )

  const totalOutstanding = aging.reduce((s, b) => s + b.total, 0)
  const overdueTotal = aging
    .filter((b) => b.bucket !== "current")
    .reduce((s, b) => s + b.total, 0)

  return (
    <>
      <AppTopbar
        eyebrow="Análisis"
        title="Reportes"
        description="P&L, cash flow, antigüedad de cobros, top clientes. Año actual por default."
        unreadNotifications={unread}
        actions={<YearSelect year={year} />}
      />

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* P&L Summary */}
        <section className="sf-card p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="mr-1 inline size-3.5" />
            Estado de Resultados (P&L) · {year}
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat
              label="Ingresos"
              value={formatCurrency(pl.income)}
              tone="positive"
            />
            <Stat
              label="Gastos"
              value={formatCurrency(pl.expenses)}
              tone="negative"
            />
            <Stat
              label="Utilidad"
              value={formatCurrency(pl.profit)}
              tone={pl.profit > 0 ? "positive" : pl.profit < 0 ? "negative" : "neutral"}
            />
            <Stat
              label="Margen"
              value={`${pl.profitMargin.toFixed(1)}%`}
              tone={pl.profitMargin > 0 ? "positive" : "negative"}
            />
          </div>

          {/* Breakdown gastos por categoría */}
          {pl.breakdown.byCategory.length > 0 && (
            <div className="mt-6 border-t border-border pt-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Gastos por categoría
              </h3>
              <ul className="space-y-2">
                {pl.breakdown.byCategory.slice(0, 10).map((c) => (
                  <li key={c.category}>
                    <div className="mb-1 flex items-baseline justify-between text-xs">
                      <span>{c.category}</span>
                      <span className="tabular-nums font-semibold">
                        {formatCurrency(c.amount)}
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          {c.percentage.toFixed(1)}%
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${c.percentage}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* AR Aging */}
        <section className="sf-card p-6">
          <h2 className="mb-4 flex items-center justify-between text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <span>
              <AlertCircle className="mr-1 inline size-3.5" />
              Cuentas por Cobrar (Aging)
            </span>
            <span className="normal-case text-xs">
              Total pendiente:{" "}
              <strong className="text-foreground tabular-nums">
                {formatCurrency(totalOutstanding)}
              </strong>
              {overdueTotal > 0 && (
                <span className="ml-2 text-red-600">
                  ({formatCurrency(overdueTotal)} atrasado)
                </span>
              )}
            </span>
          </h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            {aging.map((b) => (
              <div
                key={b.bucket}
                className={
                  "rounded-xl border p-3 " +
                  (b.bucket === "current"
                    ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950"
                    : b.bucket === "over_90"
                      ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950"
                      : b.total > 0
                        ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
                        : "border-input bg-card")
                }
              >
                <p className="text-[9px] uppercase tracking-wider opacity-80">
                  {b.bucketLabel}
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums">
                  {formatCurrency(b.total)}
                </p>
                <p className="mt-0.5 text-[10px] opacity-70">
                  {b.count} {b.count === 1 ? "factura" : "facturas"}
                </p>
              </div>
            ))}
          </div>

          {/* Lista detalle solo de buckets con atraso */}
          {aging.some((b) => b.bucket !== "current" && b.count > 0) && (
            <div className="mt-4 border-t border-border pt-4">
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
                Facturas atrasadas
              </h3>
              <ul className="divide-y divide-border text-sm">
                {aging
                  .filter((b) => b.bucket !== "current")
                  .flatMap((b) => b.invoices)
                  .sort((a, b) => b.days_overdue - a.days_overdue)
                  .slice(0, 15)
                  .map((inv) => (
                    <li
                      key={inv.id}
                      className="flex items-center justify-between py-2"
                    >
                      <div>
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="font-mono text-xs font-semibold hover:underline"
                        >
                          {inv.invoice_number}
                        </Link>
                        <p className="text-[10px] text-muted-foreground">
                          {inv.client_name}
                          {" · "}
                          {inv.due_date && formatDate(new Date(inv.due_date))}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">
                          {formatCurrency(inv.total)}
                        </p>
                        <p className="text-[10px] text-red-600">
                          {inv.days_overdue}d atrasada
                        </p>
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </section>

        {/* Cash flow */}
        <section className="sf-card p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Wallet className="mr-1 inline size-3.5" />
            Cash Flow · Últimos 12 meses
          </h2>
          <CashFlowChart entries={cashFlow} />
        </section>

        {/* Top clients */}
        <section className="sf-card p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Crown className="mr-1 inline size-3.5" />
            Top 10 clientes · {year}
          </h2>
          {topClients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay facturas pagadas todavía este año.
            </p>
          ) : (
            <ol className="divide-y divide-border">
              {topClients.map((c, i) => (
                <li
                  key={c.clientId}
                  className="flex items-center justify-between py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        "inline-flex size-7 items-center justify-center rounded-full text-xs font-bold " +
                        (i === 0
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                          : i === 1
                            ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                            : i === 2
                              ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                              : "bg-muted text-muted-foreground")
                      }
                    >
                      {i + 1}
                    </span>
                    <div>
                      <Link
                        href={`/clients/${c.clientId}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {c.clientName}
                      </Link>
                      <p className="text-[10px] text-muted-foreground">
                        {c.invoiceCount}{" "}
                        {c.invoiceCount === 1 ? "factura" : "facturas"}
                        {" · promedio "}
                        {formatCurrency(c.averageInvoice)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">
                      {formatCurrency(c.totalRevenue)}
                    </p>
                    {c.lastInvoiceDate && (
                      <p className="text-[10px] text-muted-foreground">
                        Último: {formatDate(new Date(c.lastInvoiceDate))}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Ingresos por categoría de servicio */}
        <section className="sf-card p-6">
          <h2 className="mb-4 flex items-center justify-between text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <span>
              <BarChart3 className="mr-1 inline size-3.5" />
              Ingresos por Categoría · {year}
            </span>
            <span className="normal-case text-xs">
              Total:{" "}
              <strong className="text-foreground tabular-nums">
                {formatCurrency(categoryRevenueTotal)}
              </strong>
            </span>
          </h2>
          {revenueByCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay facturas pagadas todavía este año.
            </p>
          ) : (
            <ul className="space-y-3">
              {revenueByCategory.map((c) => (
                <li key={c.categoryId ?? "__none__"}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex size-6 shrink-0 items-center justify-center rounded-md text-white"
                        style={{ backgroundColor: c.color }}
                      >
                        <CategoryIcon name={c.icon} className="size-3.5" />
                      </span>
                      <span className="truncate font-medium text-foreground">
                        {c.categoryName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {c.invoiceCount}{" "}
                        {c.invoiceCount === 1 ? "factura" : "facturas"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums font-semibold">
                      {formatCurrency(c.totalRevenue)}
                      <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                        {c.percentage.toFixed(1)}%
                      </span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${c.percentage}%`,
                        backgroundColor: c.color,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Forecast 6 meses */}
        {forecast.length > 0 && (
          <section className="sf-card p-6">
            <h2 className="mb-4 flex items-center justify-between text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <span>
                <Telescope className="mr-1 inline size-3.5" />
                Forecast 6 meses (proyección)
              </span>
              <a
                href="/api/reports/export?type=forecast&months=6"
                className="inline-flex items-center gap-1 rounded-lg border border-input bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground normal-case hover:bg-accent"
              >
                <Download className="size-3" />
                CSV
              </a>
            </h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Basado en receivables pendientes, pending invoices, upcoming
              projects, subscriptions activas y payables.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-2">Mes</th>
                    <th className="py-2 text-right">Ingresos</th>
                    <th className="py-2 text-right">Gastos</th>
                    <th className="py-2 text-right">Neto</th>
                    <th className="py-2 text-right">Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.map((f) => (
                    <tr key={f.month} className="border-b border-border/50">
                      <td className="py-2 font-mono">{f.month}</td>
                      <td className="py-2 text-right tabular-nums text-emerald-600">
                        {formatCurrency(f.expectedIncome)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-red-600">
                        {formatCurrency(f.expectedExpenses)}
                      </td>
                      <td
                        className={
                          "py-2 text-right font-semibold tabular-nums " +
                          (f.netProjected >= 0
                            ? "text-emerald-600"
                            : "text-red-600")
                        }
                      >
                        {formatCurrency(f.netProjected)}
                      </td>
                      <td
                        className={
                          "py-2 text-right tabular-nums " +
                          (f.cumulativeProjected >= 0
                            ? "text-emerald-600"
                            : "text-red-600")
                        }
                      >
                        {formatCurrency(f.cumulativeProjected)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Export buttons */}
        <section className="sf-card p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Download className="mr-1 inline size-3.5" />
            Exportar a CSV (compatible Excel)
          </h3>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/reports/export?type=pl&year=${year}`}
              className="inline-flex items-center gap-1 rounded-xl border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent"
            >
              <Download className="size-3" />
              P&L {year}
            </a>
            <a
              href="/api/reports/export?type=cashflow&months=12"
              className="inline-flex items-center gap-1 rounded-xl border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent"
            >
              <Download className="size-3" />
              Cash Flow 12m
            </a>
            <a
              href="/api/reports/export?type=ar_aging"
              className="inline-flex items-center gap-1 rounded-xl border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent"
            >
              <Download className="size-3" />
              AR Aging
            </a>
            <a
              href={`/api/reports/export?type=top_clients&year=${year}`}
              className="inline-flex items-center gap-1 rounded-xl border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent"
            >
              <Download className="size-3" />
              Top clientes {year}
            </a>
            <a
              href="/api/reports/export?type=forecast&months=6"
              className="inline-flex items-center gap-1 rounded-xl border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent"
            >
              <Download className="size-3" />
              Forecast 6m
            </a>
          </div>
        </section>
      </main>
    </>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "positive" | "negative" | "neutral"
}) {
  const cls =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
        ? "text-red-600 dark:text-red-400"
        : ""
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${cls}`}>{value}</p>
    </div>
  )
}

function CashFlowChart({ entries }: { entries: Awaited<ReturnType<typeof getCashFlow>> }) {
  const maxValue = Math.max(
    1,
    ...entries.map((e) => Math.max(e.income, e.expenses)),
  )

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-12 gap-1">
        {entries.map((e) => {
          const incomePct = (e.income / maxValue) * 100
          const expensePct = (e.expenses / maxValue) * 100
          const isPositive = e.net >= 0
          return (
            <div key={e.date} className="flex flex-col items-center gap-1">
              <div className="flex h-32 w-full items-end justify-center gap-0.5">
                <div
                  className="w-2 rounded-t bg-emerald-500 transition-all"
                  style={{ height: `${incomePct}%` }}
                  title={`Ingresos: ${e.income.toFixed(2)}`}
                />
                <div
                  className="w-2 rounded-t bg-red-500 transition-all"
                  style={{ height: `${expensePct}%` }}
                  title={`Gastos: ${e.expenses.toFixed(2)}`}
                />
              </div>
              <p className="text-[8px] text-muted-foreground">
                {e.date.slice(5, 7)}
              </p>
              <p
                className={
                  "text-[8px] tabular-nums " +
                  (isPositive ? "text-emerald-600" : "text-red-600")
                }
              >
                {(e.net / 1000).toFixed(0)}k
              </p>
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-emerald-500" /> Ingresos
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-red-500" /> Gastos
        </span>
      </div>
    </div>
  )
}
