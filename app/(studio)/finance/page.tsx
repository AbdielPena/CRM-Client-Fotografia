import Link from "next/link"
import { ExternalLink, AlertTriangle, Wallet, TrendingUp } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getFinanceDashboard } from "@/server/services/finance-dashboard.service"
import { AppTopbar } from "@/components/layout/app-topbar"
import { StatCard } from "@/components/shared/stat-card"
import { DefaultAccountBlock } from "@/components/finance/default-account-block"
import { AssignAccountCell } from "@/components/finance/assign-account-cell"
import { formatCurrency, formatDateShort } from "@/lib/utils/currency"

export const metadata: Metadata = { title: "Finanzas" }
export const dynamic = "force-dynamic"

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Transferencia",
  cash: "Efectivo",
  check: "Cheque",
  azul: "Azul",
  cardnet: "CardNet",
  zelle: "Zelle",
  paypal: "PayPal",
  stripe: "Stripe",
  other: "Otro",
}

export default async function FinancePage() {
  const session = await requireStudioAuth()
  const [data, unread] = await Promise.all([
    getFinanceDashboard(session.studioId, { limit: 100 }),
    countUnreadNotifications(session.studioId),
  ])

  const accountOptions = data.accounts.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    banco: a.banco ?? null,
  }))

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
          <a
            href="https://fi.abbypixel.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir FinanzApp
          </a>
        }
      />

      <div className="space-y-6 px-6 py-6 lg:px-8 lg:py-8">
        {/* KPIs */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title="Cobrado este mes"
            value={formatCurrency(data.totalsByMonth.thisMonth, "DOP")}
            trend={
              trendPct !== null
                ? { value: trendPct, label: "vs. mes anterior" }
                : undefined
            }
            subtitle={
              trendPct === null
                ? `Mes anterior: ${formatCurrency(data.totalsByMonth.lastMonth, "DOP")}`
                : undefined
            }
          />
          <StatCard
            title="Mes anterior"
            value={formatCurrency(data.totalsByMonth.lastMonth, "DOP")}
            subtitle="Total cobrado"
          />
          <StatCard
            title="Año en curso"
            value={formatCurrency(data.totalsByMonth.ytd, "DOP")}
            subtitle="YTD acumulado"
          />
        </div>

        {/* Pendientes */}
        {data.pendingCount > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    {data.pendingCount}{" "}
                    {data.pendingCount === 1 ? "pago" : "pagos"} sin cuenta asignada
                  </p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Total pendiente: {formatCurrency(data.pendingTotal, "DOP")}.
                    Asígnales una cuenta para que se reflejen en tu app de Finanzas.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Por cuenta + cuenta default */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">
                Desglose por cuenta
              </h3>
            </div>
            {data.byAccount.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Aún no hay pagos asignados a una cuenta.
              </p>
            ) : (
              <div className="space-y-2">
                {data.byAccount.map((a) => (
                  <div
                    key={a.accountId}
                    className="flex items-center justify-between rounded-lg border border-border/60 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {a.accountName}
                      </p>
                      {a.bank && (
                        <p className="text-[11px] text-muted-foreground">{a.bank}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground tabular-nums">
                        {formatCurrency(a.total, "DOP")}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {a.count} {a.count === 1 ? "pago" : "pagos"}
                      </p>
                    </div>
                  </div>
                ))}
                {data.pendingCount > 0 && (
                  <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-3.5 w-3.5 text-amber-600" />
                      <p className="text-sm font-medium text-amber-900">
                        Sin asignar
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-amber-900 tabular-nums">
                        {formatCurrency(data.pendingTotal, "DOP")}
                      </p>
                      <p className="text-[11px] text-amber-700">
                        {data.pendingCount} {data.pendingCount === 1 ? "pago" : "pagos"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DefaultAccountBlock
            accounts={accountOptions}
            currentAccountId={data.defaultAccountId}
          />
        </div>

        {/* Lista de pagos */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">
              Pagos recientes
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Los últimos {data.payments.length} pagos registrados en el CRM.
            </p>
          </div>
          {data.payments.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Aún no hay pagos registrados.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2.5 text-left font-medium">Fecha</th>
                    <th className="px-5 py-2.5 text-left font-medium">Factura</th>
                    <th className="px-5 py-2.5 text-left font-medium">Cliente</th>
                    <th className="px-5 py-2.5 text-left font-medium">Método</th>
                    <th className="px-5 py-2.5 text-right font-medium">Monto</th>
                    <th className="px-5 py-2.5 text-left font-medium">Cuenta destino</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data.payments.map((p) => (
                    <tr
                      key={p.id}
                      className={p.pending ? "bg-amber-50/30" : "hover:bg-muted/30"}
                    >
                      <td className="px-5 py-3 text-foreground/80 whitespace-nowrap">
                        {formatDateShort(new Date(p.receivedAt))}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <Link
                          href={`/invoices/${p.invoiceId}`}
                          className="font-mono text-xs text-primary hover:underline"
                        >
                          {p.invoiceNumber ?? p.invoiceId.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-foreground/80">
                        {p.clientName ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-[12.5px] text-muted-foreground">
                        {METHOD_LABELS[p.method] ?? p.method}
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-foreground tabular-nums whitespace-nowrap">
                        {formatCurrency(p.amount, p.currency)}
                      </td>
                      <td className="px-5 py-3">
                        <AssignAccountCell
                          paymentId={p.id}
                          currentAccountId={p.finanzappAccountId}
                          currentLabel={p.finanzappAccountName}
                          accounts={accountOptions}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
