import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  Receipt,
  Calendar,
  AlertTriangle,
  Building,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getFinAccountsWithBalances } from "@/server/services/fin-account.service"
import { untypedServer } from "@/server/supabase/untyped"
import { formatCurrency, formatDate } from "@/lib/utils/currency"
import { d } from "@/lib/decimal"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

import { RecordPayablePaymentForm } from "./record-payment-form"

export const metadata: Metadata = { title: "Detalle CxP · Finanzas" }

export default async function PayableDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()
  const sb = untypedServer()

  const [payableRes, accounts, unread] = await Promise.all([
    sb
      .from("fin_payables")
      .select(
        `*,
         beneficiary:fin_beneficiaries(id, nombre)`,
      )
      .eq("id", params.id)
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .maybeSingle(),
    getFinAccountsWithBalances(session.studioId, { activaOnly: true }),
    countUnreadNotifications(session.studioId),
  ])

  if (!payableRes.data) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = payableRes.data as any
  const pending = Number(d(p.monto).minus(d(p.monto_pagado)).toFixed(2))
  const pct = Number(
    d(p.monto).gt(0)
      ? d(p.monto_pagado).div(d(p.monto)).times(100).toFixed(0)
      : 0,
  )
  const isPastDue =
    p.fecha_venc &&
    new Date(p.fecha_venc) < new Date() &&
    p.estado !== "pagada" &&
    p.estado !== "cancelada"

  return (
    <>
      <AppTopbar
        eyebrow="Finanzas / CxP"
        title={p.acreedor}
        description={`Monto ${formatCurrency(Number(p.monto), p.currency)} · Estado ${p.estado}`}
        unreadNotifications={unread}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/finance/payables">
              <ArrowLeft className="mr-1 size-3.5" />
              Volver
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Resumen + progreso */}
        <section className="sf-card p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Monto total
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {formatCurrency(Number(p.monto), p.currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Pagado
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatCurrency(Number(p.monto_pagado), p.currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Pendiente
              </p>
              <p
                className={
                  "mt-1 text-2xl font-bold tabular-nums " +
                  (pending === 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : isPastDue
                    ? "text-red-600 dark:text-red-400"
                    : "text-amber-600 dark:text-amber-400")
                }
              >
                {formatCurrency(pending, p.currency)}
              </p>
            </div>
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
            </p>
          </div>
        </section>

        {/* Metadata */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sf-card p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Building className="size-4" />
              Acreedor
            </h3>
            <p className="text-lg font-medium">{p.acreedor}</p>
            {p.beneficiary && (
              <p className="mt-1 text-xs text-muted-foreground">
                Beneficiario: <strong>{p.beneficiary.nombre}</strong>
              </p>
            )}
          </div>

          <div className="sf-card p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Receipt className="size-4" />
              Fechas
            </h3>
            <div className="space-y-1 text-xs text-muted-foreground">
              {p.fecha_emision && (
                <p className="flex items-center gap-1">
                  <Calendar className="size-3" />
                  Emisión: {formatDate(new Date(p.fecha_emision))}
                </p>
              )}
              {p.fecha_venc && (
                <p
                  className={
                    "flex items-center gap-1 " +
                    (isPastDue ? "font-medium text-red-600" : "")
                  }
                >
                  {isPastDue && <AlertTriangle className="size-3" />}
                  <Calendar className="size-3" />
                  Vence: {formatDate(new Date(p.fecha_venc))}
                </p>
              )}
            </div>
          </div>
        </section>

        {pending > 0 && p.estado !== "cancelada" && (
          <section className="sf-card p-6">
            <h3 className="mb-3 text-lg font-semibold">Registrar pago</h3>
            <RecordPayablePaymentForm
              payableId={p.id}
              pendingAmount={pending}
              currency={p.currency}
              accounts={accounts.map((a) => ({
                id: a.id,
                nombre: a.nombre,
                currency: a.currency,
                balance: a.balance,
              }))}
            />
          </section>
        )}

        {p.notas && (
          <section className="sf-card p-5">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Notas
            </h3>
            <p className="whitespace-pre-wrap text-sm">{p.notas}</p>
          </section>
        )}
      </main>
    </>
  )
}
