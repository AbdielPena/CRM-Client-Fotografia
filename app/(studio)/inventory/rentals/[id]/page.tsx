import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  Truck,
  CreditCard,
  User,
  CalendarDays,
  Package as PackageIcon,
  AlertTriangle,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getInvRentalById } from "@/server/services/inv-rental.service"
import { untypedServer } from "@/server/supabase/untyped"
import { formatCurrency, formatDate, formatDateShort } from "@/lib/utils/currency"
import { d } from "@/lib/decimal"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

import { RecordRentalPaymentForm } from "./record-payment-form"

export const metadata: Metadata = { title: "Alquiler · Inventario" }

export default async function RentalDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()
  // fetch cuentas Finance directo (sin service hard-import — fin-account vive
  // en F5 branch). Cuando F5 merge, podemos cambiar a service tipado.
  const sb = untypedServer()
  const [rental, accountsRes, unread] = await Promise.all([
    getInvRentalById(session.studioId, params.id),
    sb
      .from("fin_accounts")
      .select("id, nombre, currency, saldo_inicial")
      .eq("studio_id", session.studioId)
      .eq("activa", true)
      .is("deleted_at", null)
      .order("nombre"),
    countUnreadNotifications(session.studioId),
  ])

  if (!rental) notFound()
  const accounts = (accountsRes.data ?? []) as Array<{
    id: string
    nombre: string
    currency: string
    saldo_inicial: number | string
  }>

  const balance = Number(rental.balance ?? 0)
  const isPastDue =
    new Date(rental.end_date) < new Date() && rental.status === "activa"
  const paidPct = Number(
    d(rental.total).gt(0)
      ? d(rental.paid_amount).div(d(rental.total)).times(100).toFixed(0)
      : 0,
  )

  // Compat tipos extendidos
  const client = (rental as unknown as { client?: { id: string; name: string; email: string | null; phone: string | null } | null }).client
  const project = (rental as unknown as { project?: { id: string; name: string } | null }).project
  const items = (rental as unknown as { items?: Array<{ id: string; quantity: number; returned_quantity: number; price_per_day: number | string; line_total: number | string; status: string; item?: { name: string; brand?: string; model?: string } | null; unit?: { serial_number?: string; internal_code?: string } | null }> }).items ?? []
  const payments = (rental as unknown as { payments?: Array<{ id: string; amount: number | string; method: string; paid_at: string; reference?: string | null; notes?: string | null }> }).payments ?? []

  return (
    <>
      <AppTopbar
        eyebrow="Inventario / Alquiler"
        title={rental.code}
        description={`${client?.name ?? "—"} · ${rental.days} día(s) · ${rental.status}`}
        unreadNotifications={unread}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/inventory/rentals">
              <ArrowLeft className="mr-1 size-3.5" />
              Volver
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Resumen financiero */}
        <section className="sf-card p-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Total" value={formatCurrency(Number(rental.total))} />
            <Stat
              label="Pagado"
              value={formatCurrency(Number(rental.paid_amount))}
              tone="positive"
            />
            <Stat
              label="Balance"
              value={formatCurrency(balance)}
              tone={balance === 0 ? "positive" : balance > 0 ? "warning" : "neutral"}
            />
            <Stat
              label="Depósito"
              value={formatCurrency(Number(rental.deposit))}
              hint="Garantía"
            />
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${paidPct}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {paidPct}% cobrado · subtotal{" "}
              {formatCurrency(Number(rental.subtotal))} − descuento{" "}
              {formatCurrency(Number(rental.discount))} + impuestos{" "}
              {formatCurrency(Number(rental.tax))}
            </p>
          </div>
        </section>

        {/* Metadata: cliente + project + fechas */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sf-card p-5">
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <User className="size-3.5" />
              Cliente
            </h3>
            {client ? (
              <>
                <Link
                  href={`/clients/${client.id}`}
                  className="font-medium hover:underline"
                >
                  {client.name}
                </Link>
                {client.email && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {client.email}
                  </p>
                )}
                {client.phone && (
                  <p className="text-xs text-muted-foreground">{client.phone}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
            {project && (
              <p className="mt-3 text-xs">
                <span className="text-muted-foreground">Proyecto: </span>
                <Link
                  href={`/projects/${project.id}`}
                  className="text-primary hover:underline"
                >
                  {project.name}
                </Link>
              </p>
            )}
          </div>

          <div className="sf-card p-5">
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <CalendarDays className="size-3.5" />
              Periodo
            </h3>
            <div className="space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Inicio: </span>
                <strong>{formatDate(new Date(rental.start_date))}</strong>
              </p>
              <p
                className={
                  isPastDue ? "text-red-600 dark:text-red-400" : undefined
                }
              >
                <span className="text-muted-foreground">Fin: </span>
                <strong>
                  {isPastDue && <AlertTriangle className="mr-1 inline size-3" />}
                  {formatDate(new Date(rental.end_date))}
                </strong>
              </p>
              {rental.actual_return_date && (
                <p>
                  <span className="text-muted-foreground">Devuelto: </span>
                  <strong>
                    {formatDate(new Date(rental.actual_return_date))}
                  </strong>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {rental.days} día(s) cobrados
              </p>
            </div>
          </div>
        </section>

        {/* Items rentados */}
        <section className="sf-card overflow-hidden">
          <div className="border-b border-border p-4">
            <h3 className="text-base font-semibold">Equipos rentados</h3>
          </div>
          <ul className="divide-y divide-border">
            {items.length === 0 ? (
              <li className="p-4 text-sm text-muted-foreground">
                Sin items en este alquiler.
              </li>
            ) : (
              items.map((line) => {
                const pendingQty = line.quantity - line.returned_quantity
                return (
                  <li key={line.id} className="flex items-start gap-3 p-4">
                    <PackageIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {line.item?.name ?? "Item"}
                        {line.unit?.serial_number && (
                          <code className="ml-2 rounded bg-muted px-1 py-0.5 text-[10px]">
                            S/N: {line.unit.serial_number}
                          </code>
                        )}
                      </p>
                      {(line.item?.brand || line.item?.model) && (
                        <p className="text-[11px] text-muted-foreground">
                          {[line.item.brand, line.item.model].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                        {line.quantity}× ·{" "}
                        {formatCurrency(Number(line.price_per_day))}/día ={" "}
                        {formatCurrency(Number(line.line_total))}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {line.status === "devuelta" ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          Devuelto
                        </span>
                      ) : pendingQty > 0 ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          {pendingQty} pendiente(s)
                        </span>
                      ) : null}
                    </div>
                  </li>
                )
              })
            )}
          </ul>
        </section>

        {/* Form registrar pago (si hay balance) */}
        {balance > 0 && (
          <section className="sf-card p-6">
            <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <CreditCard className="size-5" />
              Registrar pago
            </h3>
            <RecordRentalPaymentForm
              rentalId={rental.id}
              pendingAmount={balance}
              accounts={accounts.map((a) => ({
                id: a.id,
                nombre: a.nombre,
                currency: a.currency,
                balance: Number(a.saldo_inicial ?? 0),
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
              {payments.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium tabular-nums">
                      {formatCurrency(Number(p.amount))}
                      <span className="ml-2 text-[10px] uppercase text-muted-foreground">
                        {p.method}
                      </span>
                    </p>
                    {(p.reference || p.notes) && (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {p.reference}
                        {p.reference && p.notes && " · "}
                        {p.notes}
                      </p>
                    )}
                  </div>
                  <time className="shrink-0 text-[11px] text-muted-foreground">
                    {formatDateShort(new Date(p.paid_at))}
                  </time>
                </li>
              ))}
            </ul>
          </section>
        )}

        {rental.notes && (
          <section className="sf-card p-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Notas
            </h3>
            <p className="whitespace-pre-wrap text-sm">{rental.notes}</p>
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
  hint,
}: {
  label: string
  value: string
  tone?: "positive" | "warning" | "neutral"
  hint?: string
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
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
