import Link from "next/link"
import { ExternalLink, TrendingUp, Users, Shirt, Wallet } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getFinanceDashboard } from "@/server/services/finance-dashboard.service"
import {
  getMonthlyRevenue,
  getTopPackages,
  getSessionFinanceStats,
} from "@/server/services/dashboard.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { RevenueLineChart } from "@/components/dashboard/revenue-line-chart"
import { TopPackagesList } from "@/components/dashboard/top-packages-list"
import { DefaultAccountBlock } from "@/components/finance/default-account-block"
import { RecentPaymentsTable } from "@/components/finance/recent-payments-table"
import { formatCurrency } from "@/lib/utils/currency"

export const metadata: Metadata = { title: "Finanzas" }
export const dynamic = "force-dynamic"

/**
 * Finanzas: los pagos del CRM y a qué cuenta entraron.
 *
 * La pantalla era una torre de bloques anchos apilados —cifras, tendencia,
 * deudas, planes, una alerta, el desglose y cien pagos— y para llegar a los
 * pagos, que es de lo que trata, había que bajar media pantalla.
 *
 * Ahora todo lo que se mira de un vistazo cabe arriba: las tres cifras en una
 * tira, y las tres listas cortas (deudas, planes, cuentas) en fila. La
 * tendencia de doce meses se pliega —se consulta, no se vigila— y los pagos
 * salen de a doce con un botón para el resto.
 */
export default async function FinancePage() {
  const session = await requireStudioAuth()
  // Todo lo de dinero vive AQUÍ: el dashboard quedó sin finanzas a propósito.
  const [data, unread, monthlyRevenue, topPackages, sessionFinance] =
    await Promise.all([
      getFinanceDashboard(session.studioId, { limit: 100 }),
      countUnreadNotifications(session.studioId),
      getMonthlyRevenue(session.studioId, 12).catch(() => []),
      getTopPackages(session.studioId, 5, 5).catch(() => []),
      getSessionFinanceStats(session.studioId).catch(() => ({
        collaboratorDebt: 0,
        collaboratorDebtCount: 0,
        dressDebt: 0,
        dressDebtCount: 0,
        currency: "DOP",
      })),
    ])

  const accountOptions = data.accounts.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    banco: a.banco ?? null,
  }))

  const deuda = sessionFinance.collaboratorDebt + sessionFinance.dressDebt

  const trendPct =
    data.totalsByMonth.lastMonth > 0
      ? Math.round(
          ((data.totalsByMonth.thisMonth - data.totalsByMonth.lastMonth) /
            data.totalsByMonth.lastMonth) *
            100,
        )
      : null

  return (
    <>
      <AppTopbar
        eyebrow="Finanzas"
        title="Pagos registrados"
        description="Pagos del CRM y a qué cuenta de tu app de Finanzas entraron."
        unreadNotifications={unread}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/finance/tithe"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Ganancia por mes
            </Link>
            <a
              href="https://fi.abbypixel.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir FinanzApp
            </a>
          </div>
        }
      />

      <div className="space-y-4 px-6 py-6 lg:px-8">
        {/* Las tres cifras en una tira. Antes eran tres tarjetas altas para
            tres números que se leen en dos segundos. */}
        <div className="sf-card grid grid-cols-2 divide-y divide-border/60 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          <Cifra
            label="Cobrado este mes"
            value={formatCurrency(data.totalsByMonth.thisMonth, "DOP")}
            nota={
              trendPct !== null
                ? `${trendPct >= 0 ? "▲" : "▼"} ${Math.abs(trendPct)}% vs. mes anterior`
                : undefined
            }
            notaTone={trendPct !== null && trendPct < 0 ? "bad" : "good"}
          />
          <Cifra
            label="Mes anterior"
            value={formatCurrency(data.totalsByMonth.lastMonth, "DOP")}
          />
          <Cifra
            label="Año en curso"
            value={formatCurrency(data.totalsByMonth.ytd, "DOP")}
          />
          <Cifra
            label="Por pagar"
            value={formatCurrency(deuda, sessionFinance.currency)}
            nota={
              deuda > 0
                ? `${sessionFinance.collaboratorDebtCount + sessionFinance.dressDebtCount} pendientes`
                : "Nada pendiente"
            }
            notaTone={deuda > 0 ? "warn" : "good"}
          />
        </div>

        {/* Tres listas cortas en fila: nada de esto merece una caja propia a
            todo lo ancho. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Caja titulo="Por pagar">
            {deuda === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">
                No le debes nada a nadie.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {sessionFinance.collaboratorDebt > 0 && (
                  <li>
                    <Link
                      href="/colaboradores"
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
                    >
                      <span className="flex items-center gap-2 text-[12.5px] text-foreground">
                        <Users className="h-3.5 w-3.5 text-violet-500" />
                        Colaboradores
                        <span className="text-[11px] text-muted-foreground">
                          ({sessionFinance.collaboratorDebtCount})
                        </span>
                      </span>
                      <span className="text-[12.5px] font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                        {formatCurrency(
                          sessionFinance.collaboratorDebt,
                          sessionFinance.currency,
                        )}
                      </span>
                    </Link>
                  </li>
                )}
                {sessionFinance.dressDebt > 0 && (
                  <li className="flex items-center justify-between gap-3 px-2 py-1.5">
                    <span className="flex items-center gap-2 text-[12.5px] text-foreground">
                      <Shirt className="h-3.5 w-3.5 text-pink-500" />
                      Vestidos
                      <span className="text-[11px] text-muted-foreground">
                        ({sessionFinance.dressDebtCount})
                      </span>
                    </span>
                    <span className="text-[12.5px] font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                      {formatCurrency(sessionFinance.dressDebt, sessionFinance.currency)}
                    </span>
                  </li>
                )}
              </ul>
            )}
          </Caja>

          <Caja titulo="Planes más vendidos" href="/settings/packages">
            <TopPackagesList items={topPackages} currency="DOP" />
          </Caja>

          <Caja titulo="Por cuenta">
            {data.byAccount.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">
                Aún no hay pagos asignados a una cuenta.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {data.byAccount.map((a) => (
                  <li
                    key={a.accountId}
                    className="flex items-baseline justify-between gap-3 px-2 py-1"
                  >
                    <span className="min-w-0 truncate text-[12.5px] text-foreground">
                      {a.accountName}
                      <span className="ml-1 text-[11px] text-muted-foreground">
                        ({a.count})
                      </span>
                    </span>
                    <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-foreground">
                      {formatCurrency(a.total, "DOP")}
                    </span>
                  </li>
                ))}
                {data.pendingCount > 0 && (
                  <li className="flex items-baseline justify-between gap-3 border-t border-border/60 px-2 pt-2">
                    <span className="flex items-center gap-1.5 text-[12.5px] text-amber-700 dark:text-amber-400">
                      <Wallet className="h-3.5 w-3.5" />
                      Sin asignar
                      <span className="text-[11px] opacity-80">
                        ({data.pendingCount})
                      </span>
                    </span>
                    <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                      {formatCurrency(data.pendingTotal, "DOP")}
                    </span>
                  </li>
                )}
              </ul>
            )}
          </Caja>
        </div>

        <RecentPaymentsTable payments={data.payments} accounts={accountOptions} />

        {/* Lo que se consulta de vez en cuando, plegado: la tendencia del año y
            la cuenta a la que caen los pagos nuevos. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <details className="sf-card overflow-hidden">
            <summary className="cursor-pointer px-4 py-3 text-[13px] font-medium text-foreground">
              Tendencia de los últimos 12 meses
            </summary>
            <div className="border-t border-border/70 p-4">
              <RevenueLineChart buckets={monthlyRevenue} currency="DOP" />
            </div>
          </details>

          <DefaultAccountBlock
            accounts={accountOptions}
            currentAccountId={data.defaultAccountId}
          />
        </div>
      </div>
    </>
  )
}

/** Un número de la tira de arriba. */
function Cifra({
  label,
  value,
  nota,
  notaTone = "good",
}: {
  label: string
  value: string
  nota?: string
  notaTone?: "good" | "bad" | "warn"
}) {
  const tono =
    notaTone === "bad"
      ? "text-red-600 dark:text-red-400"
      : notaTone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400"
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
        {value}
      </p>
      {nota ? <p className={`text-[11px] font-medium ${tono}`}>{nota}</p> : null}
    </div>
  )
}

/** Caja baja con título; opcionalmente un enlace a la derecha. */
function Caja({
  titulo,
  href,
  children,
}: {
  titulo: string
  href?: string
  children: React.ReactNode
}) {
  return (
    <section className="sf-card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-foreground">{titulo}</h3>
        {href ? (
          <Link
            href={href}
            className="text-[11.5px] text-muted-foreground hover:text-foreground"
          >
            Ver todos
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  )
}
