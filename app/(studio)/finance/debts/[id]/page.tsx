import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CreditCard, Calendar, TrendingDown } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getFinDebtById } from "@/server/services/fin-debt.service"
import { getFinAccountsWithBalances } from "@/server/services/fin-account.service"
import { formatCurrency, formatDate, formatDateShort } from "@/lib/utils/currency"
import { d } from "@/lib/decimal"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

import { DebtPaymentForm } from "./payment-form"

export const metadata: Metadata = { title: "Detalle Deuda · Finanzas" }

export default async function DebtDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()
  const [debtData, accounts, unread] = await Promise.all([
    getFinDebtById(session.studioId, params.id),
    getFinAccountsWithBalances(session.studioId, { activaOnly: true }),
    countUnreadNotifications(session.studioId),
  ])

  if (!debtData) notFound()

  const debt = debtData
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payments = (debt as any).payments ?? []

  const original = Number(debt.monto_original)
  const saldo = Number(debt.saldo_pendiente)
  const pagado = original - saldo
  const pct = original > 0 ? Math.min(100, Math.round((pagado / original) * 100)) : 0

  return (
    <>
      <AppTopbar
        eyebrow="Finanzas / Deudas"
        title={debt.acreedor}
        description={`Original ${formatCurrency(original, debt.currency)} · Estado ${debt.estado}`}
        unreadNotifications={unread}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/finance/debts">
              <ArrowLeft className="mr-1 size-3.5" />
              Volver
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Resumen */}
        <section className="sf-card p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Stat label="Monto original" value={formatCurrency(original, debt.currency)} />
            <Stat
              label="Ya pagado"
              value={formatCurrency(pagado, debt.currency)}
              tone="positive"
            />
            <Stat
              label="Saldo pendiente"
              value={formatCurrency(saldo, debt.currency)}
              tone={saldo === 0 ? "positive" : "warning"}
            />
            <Stat
              label="Cuotas"
              value={
                debt.cuotas_total
                  ? `${debt.cuotas_pagadas} / ${debt.cuotas_total}`
                  : `${debt.cuotas_pagadas} pagos`
              }
            />
          </div>

          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {pct}% pagado
              {debt.monto_cuota && (
                <> · cuota {formatCurrency(Number(debt.monto_cuota), debt.currency)}</>
              )}
              {debt.tasa_interes && <> · tasa {Number(debt.tasa_interes)}%</>}
            </p>
          </div>
        </section>

        {/* Metadata */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sf-card p-5">
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <CreditCard className="size-3.5" />
              Acreedor
            </h3>
            <p className="text-lg font-medium">{debt.acreedor}</p>
          </div>

          <div className="sf-card p-5">
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Calendar className="size-3.5" />
              Fechas
            </h3>
            <div className="space-y-1 text-xs">
              {debt.fecha_inicio && (
                <p>
                  <span className="text-muted-foreground">Inicio: </span>
                  <strong>{formatDate(new Date(debt.fecha_inicio))}</strong>
                </p>
              )}
              {debt.fecha_proximo_pago && (
                <p>
                  <span className="text-muted-foreground">Próximo pago: </span>
                  <strong>{formatDate(new Date(debt.fecha_proximo_pago))}</strong>
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Form payment */}
        {saldo > 0 && debt.estado !== "cancelada" && (
          <section className="sf-card p-6">
            <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <TrendingDown className="size-5 text-red-500" />
              Registrar pago
            </h3>
            <DebtPaymentForm
              debtId={debt.id}
              pendingAmount={saldo}
              currency={debt.currency}
              accounts={accounts.map((a) => ({
                id: a.id,
                nombre: a.nombre,
                currency: a.currency,
                balance: a.balance,
              }))}
            />
          </section>
        )}

        {/* Historial pagos */}
        {payments.length > 0 && (
          <section className="sf-card overflow-hidden">
            <div className="border-b border-border p-4">
              <h3 className="text-base font-semibold">Historial de pagos</h3>
            </div>
            <ul className="divide-y divide-border">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(payments as any[]).map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium tabular-nums">
                      {formatCurrency(Number(p.monto), debt.currency)}
                    </p>
                    {p.notas && (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {p.notas}
                      </p>
                    )}
                  </div>
                  <time className="shrink-0 text-[11px] text-muted-foreground">
                    {formatDateShort(new Date(p.fecha))}
                  </time>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  )
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: string
  tone?: "positive" | "warning" | "neutral"
}) {
  const cls =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warning"
      ? "text-amber-600 dark:text-amber-400"
      : "text-foreground"
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${cls}`}>{value}</p>
    </div>
  )
}
