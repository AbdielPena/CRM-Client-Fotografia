import { cookies } from "next/headers"
import { CreditCard } from "lucide-react"

import {
  PORTAL_COOKIE_NAME,
  parsePortalCookieValue,
} from "@/server/services/client-portal.service"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { StatusBadge } from "@/components/shared/status-badge"
import { formatCurrency, formatDateShort } from "@/lib/utils/currency"

export const dynamic = "force-dynamic"

export default async function PortalPaymentsPage() {
  const session = parsePortalCookieValue(cookies().get(PORTAL_COOKIE_NAME)?.value)
  if (!session) return null

  const supabase = createSupabaseServiceClient()
  const { data: paymentsRaw } = await supabase
    .from("payments")
    .select("id, amount, currency, status, payment_date, method, created_at")
    .eq("client_id", session.clientId)
    .order("created_at", { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payments = (paymentsRaw ?? []) as any[]

  const total = payments
    .filter((p) => p.status === "completed" || p.status === "succeeded")
    .reduce((s, p) => s + Number(p.amount ?? 0), 0)

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Tus pagos
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Historial de pagos registrados.
          </p>
        </div>
        <div className="rounded-xl bg-emerald-50 px-4 py-2 text-right dark:bg-emerald-500/10">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Total pagado
          </p>
          <p className="font-mono text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
            {formatCurrency(total, payments[0]?.currency ?? "USD")}
          </p>
        </div>
      </header>

      {payments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <CreditCard className="mx-auto h-8 w-8 text-zinc-400" />
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Aún no hay pagos registrados.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center gap-4 px-5 py-4">
                <CreditCard className="h-5 w-5 flex-shrink-0 text-zinc-400" />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                    {formatCurrency(Number(p.amount ?? 0), p.currency ?? "USD")}
                  </p>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                    {p.method ? <span className="uppercase">{p.method}</span> : "—"}{" "}
                    ·{" "}
                    {p.payment_date
                      ? formatDateShort(new Date(p.payment_date))
                      : formatDateShort(new Date(p.created_at))}
                  </p>
                </div>
                <StatusBadge status={String(p.status)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
