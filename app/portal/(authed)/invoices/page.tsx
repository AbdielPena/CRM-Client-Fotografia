import { cookies } from "next/headers"
import Link from "next/link"
import { Receipt, Printer } from "lucide-react"

import {
  PORTAL_COOKIE_NAME,
  parsePortalCookieValue,
} from "@/server/services/client-portal.service"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { StatusBadge } from "@/components/shared/status-badge"
import { formatCurrency, formatDateShort } from "@/lib/utils/currency"
import {
  PortalHeader,
  PortalEmpty,
  PortalSummaryPill,
} from "@/components/portal/portal-ui"

export const dynamic = "force-dynamic"

export default async function PortalInvoicesPage() {
  const session = parsePortalCookieValue(cookies().get(PORTAL_COOKIE_NAME)?.value)
  if (!session) return null

  const supabase = createSupabaseServiceClient()
  const { data: invoicesRaw } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, status, total_amount, currency, due_date, created_at, public_token",
    )
    .eq("client_id", session.clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoices = (invoicesRaw ?? []) as any[]

  const totalDue = invoices
    .filter((i) => i.status !== "paid" && i.status !== "void")
    .reduce((s, i) => s + Number(i.total_amount ?? 0), 0)
  const currency = invoices[0]?.currency ?? "USD"

  return (
    <div className="space-y-8">
      <PortalHeader
        eyebrow="Facturación"
        title="Tus facturas"
        description="Detalle de las facturas emitidas a tu nombre."
        right={
          totalDue > 0 ? (
            <PortalSummaryPill
              label="Pendiente"
              value={formatCurrency(totalDue, currency)}
              tone="warning"
            />
          ) : undefined
        }
      />

      {invoices.length === 0 ? (
        <PortalEmpty icon={Receipt} title="Sin facturas todavía" description="Aquí aparecerán tus facturas cuando tu fotógrafo las emita." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {invoices.map((inv, i) => {
            const isPaid = inv.status === "paid"
            return (
              <div
                key={inv.id}
                className="lx-card animate-fade-in-up p-5"
                style={{ animationDelay: `${Math.min(i * 50, 300)}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-full ${
                        isPaid
                          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                          : "bg-brand-soft text-gold-600"
                      }`}
                    >
                      <Receipt className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-medium text-foreground">
                        {inv.invoice_number ?? `Factura #${String(inv.id).slice(0, 6)}`}
                      </p>
                      <p className="text-[12px] text-muted-foreground">
                        {inv.due_date
                          ? `Vence ${formatDateShort(new Date(inv.due_date))}`
                          : formatDateShort(new Date(inv.created_at))}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={String(inv.status)} />
                </div>

                <div className="mt-4 flex items-end justify-between gap-3 border-t border-border pt-4">
                  <span className="font-serif-soft text-2xl font-semibold tabular-nums text-foreground">
                    {formatCurrency(Number(inv.total_amount ?? 0), inv.currency ?? "USD")}
                  </span>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/invoice-print/${inv.id}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-gold-300 hover:text-gold-700"
                    >
                      <Printer className="h-3 w-3" />
                      PDF
                    </Link>
                    {inv.public_token && (
                      <Link
                        href={`/i/${inv.public_token}`}
                        target="_blank"
                        className={
                          isPaid
                            ? "inline-flex items-center rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-gold-300 hover:text-gold-700"
                            : "lx-btn-gold !px-4 !py-1.5 text-xs"
                        }
                      >
                        {isPaid ? "Ver" : "Pagar ahora"}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
