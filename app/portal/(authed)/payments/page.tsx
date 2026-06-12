import { cookies } from "next/headers"
import { CreditCard } from "lucide-react"

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

export default async function PortalPaymentsPage() {
  const session = parsePortalCookieValue(cookies().get(PORTAL_COOKIE_NAME)?.value)
  if (!session) return null

  const supabase = createSupabaseServiceClient()
  const { data: paymentsRaw } = await supabase
    .from("payments")
    .select("id, amount, currency, status, received_at, method, created_at")
    .eq("client_id", session.clientId)
    .order("created_at", { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payments = (paymentsRaw ?? []) as any[]

  const total = payments
    .filter((p) => p.status === "completed" || p.status === "succeeded")
    .reduce((s, p) => s + Number(p.amount ?? 0), 0)

  const titleCase = (s: string) =>
    s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "—"

  return (
    <div className="space-y-8">
      <PortalHeader
        eyebrow="Historial"
        title="Tus pagos"
        description="El registro de todos tus pagos, en un solo lugar."
        right={
          <PortalSummaryPill
            label="Total pagado"
            value={formatCurrency(total, payments[0]?.currency ?? "USD")}
            tone="success"
          />
        }
      />

      {payments.length === 0 ? (
        <PortalEmpty
          icon={CreditCard}
          title="Aún no hay pagos"
          description="Tus pagos aparecerán aquí a medida que se registren."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {payments.map((p, i) => {
            const ok = p.status === "completed" || p.status === "succeeded"
            return (
              <div
                key={p.id}
                className="lx-card animate-fade-in-up flex items-center gap-4 p-5"
                style={{ animationDelay: `${Math.min(i * 50, 300)}ms` }}
              >
                <span
                  className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${
                    ok
                      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : "bg-brand-soft text-gold-600"
                  }`}
                >
                  <CreditCard className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-serif-soft text-2xl font-semibold tabular-nums text-foreground">
                    {formatCurrency(Number(p.amount ?? 0), p.currency ?? "USD")}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {titleCase(p.method ?? "")} ·{" "}
                    {p.received_at
                      ? formatDateShort(new Date(p.received_at))
                      : formatDateShort(new Date(p.created_at))}
                  </p>
                </div>
                <StatusBadge status={String(p.status)} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
