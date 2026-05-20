import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, HandCoins, TrendingUp } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getFinAccountsWithBalances } from "@/server/services/fin-account.service"
import { untypedServer } from "@/server/supabase/untyped"
import { formatCurrency, formatDate } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

import { LoanPaymentForm } from "./payment-form"

export const metadata: Metadata = { title: "Detalle Préstamo · Finanzas" }

export default async function LoanDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()
  const sb = untypedServer()

  const [loanRes, paymentsRes, accounts, unread] = await Promise.all([
    sb
      .from("fin_loans")
      .select("*")
      .eq("id", params.id)
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .maybeSingle(),
    sb
      .from("fin_loan_payments")
      .select("*")
      .eq("loan_id", params.id)
      .eq("studio_id", session.studioId)
      .order("fecha", { ascending: false }),
    getFinAccountsWithBalances(session.studioId, { activaOnly: true }),
    countUnreadNotifications(session.studioId),
  ])

  if (!loanRes.data) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loan = loanRes.data as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payments = (paymentsRes.data ?? []) as any[]

  const original = Number(loan.monto_original)
  const saldo = Number(loan.saldo_pendiente)
  const cobrado = original - saldo
  const pct =
    original > 0 ? Math.min(100, Math.round((cobrado / original) * 100)) : 0

  return (
    <>
      <AppTopbar
        eyebrow="Finanzas / Préstamos otorgados"
        title={loan.deudor}
        description={`Original ${formatCurrency(original, loan.currency)} · ${loan.estado}`}
        unreadNotifications={unread}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/finance/loans">
              <ArrowLeft className="mr-1 size-3.5" />
              Volver
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="sf-card p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat
              label="Monto original"
              value={formatCurrency(original, loan.currency)}
            />
            <Stat
              label="Ya cobrado"
              value={formatCurrency(cobrado, loan.currency)}
              tone="positive"
            />
            <Stat
              label="Saldo pendiente"
              value={formatCurrency(saldo, loan.currency)}
              tone={saldo === 0 ? "positive" : "warning"}
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
              {pct}% cobrado
              {loan.fecha_inicio && (
                <> · iniciado {formatDate(new Date(loan.fecha_inicio))}</>
              )}
            </p>
          </div>
        </section>

        <section className="sf-card p-5">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <HandCoins className="size-3.5" />
            Deudor
          </h3>
          <p className="text-lg font-medium">{loan.deudor}</p>
        </section>

        {saldo > 0 && loan.estado !== "cancelado" && (
          <section className="sf-card p-6">
            <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <TrendingUp className="size-5 text-emerald-500" />
              Registrar cobro
            </h3>
            <LoanPaymentForm
              loanId={loan.id}
              pendingAmount={saldo}
              currency={loan.currency}
              accounts={accounts.map((a) => ({
                id: a.id,
                nombre: a.nombre,
                currency: a.currency,
                balance: a.balance,
              }))}
            />
          </section>
        )}

        {payments.length > 0 && (
          <section className="sf-card overflow-hidden">
            <div className="border-b border-border p-4">
              <h3 className="text-base font-semibold">Historial de cobros</h3>
            </div>
            <ul className="divide-y divide-border">
              {payments.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between p-3"
                >
                  <p className="text-sm font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                    + {formatCurrency(Number(p.monto), loan.currency)}
                  </p>
                  <time className="text-[11px] text-muted-foreground">
                    {formatDate(new Date(p.fecha))}
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
