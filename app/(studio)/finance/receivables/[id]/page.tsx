import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  User,
  Receipt,
  Calendar,
  Mail,
  Phone,
  AlertTriangle,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getFinReceivableById } from "@/server/services/fin-receivable.service"
import { getFinAccountsWithBalances } from "@/server/services/fin-account.service"
import { formatCurrency, formatDate } from "@/lib/utils/currency"
import { d } from "@/lib/decimal"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

import { RecordPaymentForm } from "./record-payment-form"

export const metadata: Metadata = { title: "Detalle CxC · Finanzas" }

export default async function ReceivableDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()
  const [recv, accounts, unread] = await Promise.all([
    getFinReceivableById(session.studioId, params.id),
    getFinAccountsWithBalances(session.studioId, { activaOnly: true }),
    countUnreadNotifications(session.studioId),
  ])

  if (!recv) notFound()

  const pending = Number(d(recv.monto).minus(d(recv.monto_cobrado)).toFixed(2))
  const pct = Number(
    d(recv.monto).gt(0)
      ? d(recv.monto_cobrado).div(d(recv.monto)).times(100).toFixed(0)
      : 0,
  )
  const isPastDue =
    recv.fecha_venc &&
    new Date(recv.fecha_venc) < new Date() &&
    recv.estado !== "cobrada" &&
    recv.estado !== "cancelada"

  // Compatible match con tipo extendido (client?: ..., invoice?: ...)
  const client = (recv as unknown as { client?: { id: string; name: string; email: string | null; phone: string | null } | null }).client
  const invoice = (recv as unknown as { invoice?: { id: string; invoice_number: string; ncf: string | null; status: string } | null }).invoice

  return (
    <>
      <AppTopbar
        eyebrow="Finanzas / CxC"
        title={recv.cliente}
        description={`Monto ${formatCurrency(Number(recv.monto), recv.currency)} · Estado ${recv.estado}`}
        unreadNotifications={unread}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/finance/receivables">
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
                {formatCurrency(Number(recv.monto), recv.currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Cobrado
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatCurrency(Number(recv.monto_cobrado), recv.currency)}
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
                {formatCurrency(pending, recv.currency)}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {pct}% cobrado
            </p>
          </div>
        </section>

        {/* Metadata + cliente + invoice */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sf-card p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <User className="size-4" />
              Cliente
            </h3>
            <p className="text-lg font-medium">{recv.cliente}</p>
            {client && (
              <>
                <p className="mt-1 text-xs text-muted-foreground">
                  Vinculado al CRM:{" "}
                  <Link
                    href={`/clients/${client.id}`}
                    className="text-primary hover:underline"
                  >
                    {client.name}
                  </Link>
                </p>
                {client.email && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <Mail className="size-3" />
                    {client.email}
                  </p>
                )}
                {client.phone && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="size-3" />
                    {client.phone}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="sf-card p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Receipt className="size-4" />
              Documento
            </h3>
            {invoice ? (
              <Link
                href={`/invoices/${invoice.id}`}
                className="text-primary hover:underline"
              >
                Factura {invoice.invoice_number}
                {invoice.ncf && (
                  <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px]">
                    {invoice.ncf}
                  </span>
                )}
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground">
                Sin invoice vinculado del CRM
              </p>
            )}
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              {recv.fecha_emision && (
                <p className="flex items-center gap-1">
                  <Calendar className="size-3" />
                  Emisión: {formatDate(new Date(recv.fecha_emision))}
                </p>
              )}
              {recv.fecha_venc && (
                <p
                  className={
                    "flex items-center gap-1 " +
                    (isPastDue ? "font-medium text-red-600" : "")
                  }
                >
                  {isPastDue && <AlertTriangle className="size-3" />}
                  <Calendar className="size-3" />
                  Vence: {formatDate(new Date(recv.fecha_venc))}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Form registrar pago (solo si hay pendiente) */}
        {pending > 0 && recv.estado !== "cancelada" && (
          <section className="sf-card p-6">
            <h3 className="mb-3 text-lg font-semibold">Registrar pago</h3>
            <RecordPaymentForm
              receivableId={recv.id}
              pendingAmount={pending}
              currency={recv.currency}
              accounts={accounts.map((a) => ({
                id: a.id,
                nombre: a.nombre,
                currency: a.currency,
                balance: a.balance,
              }))}
            />
          </section>
        )}

        {recv.notas && (
          <section className="sf-card p-5">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Notas
            </h3>
            <p className="whitespace-pre-wrap text-sm">{recv.notas}</p>
          </section>
        )}
      </main>
    </>
  )
}
