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
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Tus facturas
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Detalle de facturas emitidas a tu nombre.
          </p>
        </div>
        {totalDue > 0 && (
          <div className="rounded-xl bg-amber-50 px-4 py-2 text-right dark:bg-amber-500/10">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              Pendiente
            </p>
            <p className="font-mono text-lg font-bold tabular-nums text-amber-700 dark:text-amber-300">
              {formatCurrency(totalDue, currency)}
            </p>
          </div>
        )}
      </header>

      {invoices.length === 0 ? (
        <Empty msg="Sin facturas todavía." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {invoices.map((inv) => {
              const href = inv.public_token
                ? `/i/${inv.public_token}`
                : `#`
              return (
                <li key={inv.id} className="flex items-center gap-4 px-5 py-4">
                  <Receipt className="h-5 w-5 flex-shrink-0 text-zinc-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                      {inv.invoice_number ?? `Factura #${String(inv.id).slice(0, 6)}`}
                    </p>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                      {inv.due_date
                        ? `Vence ${formatDateShort(new Date(inv.due_date))}`
                        : formatDateShort(new Date(inv.created_at))}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {formatCurrency(Number(inv.total_amount ?? 0), inv.currency ?? "USD")}
                  </span>
                  <StatusBadge status={String(inv.status)} />
                  <Link
                    href={`/invoice-print/${inv.id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                  >
                    <Printer className="h-3 w-3" />
                    PDF
                  </Link>
                  {inv.public_token && (
                    <Link
                      href={href}
                      target="_blank"
                      className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                    >
                      Ver
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <Receipt className="mx-auto h-8 w-8 text-zinc-400" />
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{msg}</p>
    </div>
  )
}
