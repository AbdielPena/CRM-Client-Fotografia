import Link from "next/link"
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  ArrowRight,
  Plus,
  Landmark,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  getFinAccountsWithBalances,
} from "@/server/services/fin-account.service"
import {
  getFinTransactions,
  type FinTransactionRow,
} from "@/server/services/fin-transaction.service"
import { d } from "@/lib/decimal"
import { formatCurrency, formatDate } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Finanzas · Dashboard" }

export default async function FinanceDashboardPage() {
  const session = await requireStudioAuth()

  // Helper para fecha del primer día del mes en curso (YYYY-MM-01)
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10)

  const [accounts, recentTx, monthIncome, monthExpense, unread] =
    await Promise.all([
      getFinAccountsWithBalances(session.studioId, { activaOnly: true }),
      getFinTransactions(session.studioId, { pageSize: 5 }),
      getFinTransactions(session.studioId, {
        tipo: "ingreso",
        fromDate: firstOfMonth,
        isBusiness: true,
        pageSize: 1000,
      }),
      getFinTransactions(session.studioId, {
        tipo: "gasto",
        fromDate: firstOfMonth,
        isBusiness: true,
        pageSize: 1000,
      }),
      countUnreadNotifications(session.studioId),
    ])

  // KPIs del mes (sum de monto por tipo)
  const totalIncomeMonth = monthIncome.items.reduce(
    (acc, t) => acc.plus(d(t.monto)),
    d(0),
  )
  const totalExpenseMonth = monthExpense.items.reduce(
    (acc, t) => acc.plus(d(t.monto)),
    d(0),
  )
  const netBalanceMonth = totalIncomeMonth.minus(totalExpenseMonth)

  // Balance global por currency
  const balancesByCurrency = accounts.reduce<Record<string, number>>(
    (acc, a) => {
      acc[a.currency] = (acc[a.currency] ?? 0) + a.balance
      return acc
    },
    {},
  )
  const primaryCurrency = Object.keys(balancesByCurrency)[0] ?? "DOP"

  return (
    <>
      <AppTopbar
        eyebrow="Finanzas"
        title="Dashboard financiero"
        description="Resumen de cuentas, ingresos, gastos y actividad reciente del estudio."
        unreadNotifications={unread}
        actions={
          <Button asChild>
            <Link href="/finance/transactions/new">
              <Plus className="mr-1 size-4" />
              Nueva transacción
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* KPIs del mes */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label="Ingresos del mes"
            value={formatCurrency(Number(totalIncomeMonth.toFixed(2)), primaryCurrency)}
            count={monthIncome.total}
            countLabel="transacciones"
            icon={<TrendingUp className="size-4" />}
            tone="positive"
          />
          <KpiCard
            label="Gastos del mes"
            value={formatCurrency(Number(totalExpenseMonth.toFixed(2)), primaryCurrency)}
            count={monthExpense.total}
            countLabel="transacciones"
            icon={<TrendingDown className="size-4" />}
            tone="negative"
          />
          <KpiCard
            label="Balance del mes"
            value={formatCurrency(Number(netBalanceMonth.toFixed(2)), primaryCurrency)}
            count={null}
            countLabel="neto"
            icon={<Wallet className="size-4" />}
            tone={netBalanceMonth.gte(0) ? "positive" : "negative"}
          />
          <KpiCard
            label={`Total ${primaryCurrency}`}
            value={formatCurrency(
              balancesByCurrency[primaryCurrency] ?? 0,
              primaryCurrency,
            )}
            count={accounts.length}
            countLabel={accounts.length === 1 ? "cuenta" : "cuentas"}
            icon={<Landmark className="size-4" />}
            tone="neutral"
          />
        </div>

        {/* Multi-currency: si hay más de 1 currency, mostrar adicionales */}
        {Object.keys(balancesByCurrency).length > 1 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.entries(balancesByCurrency)
              .filter(([cur]) => cur !== primaryCurrency)
              .map(([currency, total]) => (
                <div key={currency} className="sf-card p-3">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Balance {currency}
                  </span>
                  <p
                    className={
                      "mt-1 text-lg font-bold tabular-nums " +
                      (total < 0 ? "text-red-600" : "text-foreground")
                    }
                  >
                    {formatCurrency(total, currency)}
                  </p>
                </div>
              ))}
          </div>
        )}

        {/* 2 columnas: cuentas (izq) + actividad (der) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Cuentas resumidas */}
          <section className="sf-card lg:col-span-1">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="font-display text-base font-semibold">Cuentas</h2>
              <Link
                href="/finance/accounts"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Ver todas
                <ArrowRight className="size-3" />
              </Link>
            </div>
            {accounts.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Sin cuentas registradas.{" "}
                <Link
                  href="/finance/accounts/new"
                  className="text-primary hover:underline"
                >
                  Crear primera
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {accounts.slice(0, 6).map((account) => (
                  <li key={account.id}>
                    <Link
                      href={`/finance/accounts/${account.id}`}
                      className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-accent/30"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="flex size-8 shrink-0 items-center justify-center rounded-md text-white shadow-sm"
                          style={{ backgroundColor: account.banco?.color ?? "#6366F1" }}
                          aria-hidden
                        >
                          {account.banco?.icono ? (
                            <span className="text-xs">{account.banco.icono}</span>
                          ) : (
                            <Landmark className="size-3.5" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {account.nombre}
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {account.banco?.nombre ?? "—"}
                          </p>
                        </div>
                      </div>
                      <p
                        className={
                          "shrink-0 text-sm font-semibold tabular-nums " +
                          (account.balance < 0
                            ? "text-red-600 dark:text-red-400"
                            : "text-foreground")
                        }
                      >
                        {formatCurrency(account.balance, account.currency)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Actividad reciente */}
          <section className="sf-card lg:col-span-2">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="font-display text-base font-semibold">
                Actividad reciente
              </h2>
              <Link
                href="/finance/transactions"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Ver todas
                <ArrowRight className="size-3" />
              </Link>
            </div>
            {recentTx.total === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Sin transacciones todavía. Las facturas pagadas aparecen aquí
                automáticamente.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {(recentTx.items as Array<
                  FinTransactionRow & {
                    categoria?: { nombre: string; emoji: string | null } | null
                    invoice?: { id: string; ncf: string | null; invoice_number: string } | null
                    client?: { name: string } | null
                  }
                >).map((tx) => {
                  const monto = Number(tx.monto)
                  const color =
                    tx.tipo === "ingreso"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : tx.tipo === "gasto"
                      ? "text-red-600 dark:text-red-400"
                      : "text-muted-foreground"
                  const sign =
                    tx.tipo === "ingreso" ? "+" : tx.tipo === "gasto" ? "−" : ""
                  return (
                    <li key={tx.id}>
                      <Link
                        href={`/finance/transactions/${tx.id}`}
                        className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-accent/30"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={
                              "flex size-8 shrink-0 items-center justify-center rounded-md " +
                              (tx.tipo === "ingreso"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                                : tx.tipo === "gasto"
                                ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                                : "bg-muted text-muted-foreground")
                            }
                          >
                            {tx.tipo === "ingreso" ? (
                              <TrendingUp className="size-4" />
                            ) : tx.tipo === "gasto" ? (
                              <TrendingDown className="size-4" />
                            ) : (
                              <Receipt className="size-4" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {tx.descripcion ?? "—"}
                              {tx.invoice && (
                                <span className="ml-1.5 rounded bg-primary/10 px-1 py-0.5 align-middle text-[9px] font-mono text-primary">
                                  {tx.invoice.ncf ?? tx.invoice.invoice_number}
                                </span>
                              )}
                            </p>
                            <p className="truncate text-[10px] text-muted-foreground">
                              {formatDate(new Date(tx.fecha))}
                              {tx.client?.name && ` · ${tx.client.name}`}
                              {tx.categoria?.nombre && ` · ${tx.categoria.emoji ?? ""}${tx.categoria.nombre}`}
                            </p>
                          </div>
                        </div>
                        <p
                          className={`shrink-0 text-sm font-semibold tabular-nums ${color}`}
                        >
                          {sign}
                          {formatCurrency(monto, tx.currency)}
                        </p>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </main>
    </>
  )
}

function KpiCard({
  label,
  value,
  count,
  countLabel,
  icon,
  tone,
}: {
  label: string
  value: string
  count: number | null
  countLabel: string
  icon: React.ReactNode
  tone: "positive" | "negative" | "neutral"
}) {
  const iconClass =
    tone === "positive"
      ? "text-emerald-500"
      : tone === "negative"
      ? "text-red-500"
      : "text-muted-foreground"

  return (
    <div className="sf-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className={iconClass}>{icon}</span>
      </div>
      <p
        className={
          "mt-2 text-xl font-bold tracking-tight tabular-nums " +
          (tone === "negative" ? "text-red-600 dark:text-red-400" : "text-foreground")
        }
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {count !== null ? `${count} ${countLabel}` : countLabel}
      </p>
    </div>
  )
}
