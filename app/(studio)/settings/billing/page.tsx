import Link from "next/link"
import {
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowUpRight,
  Sparkles,
  ExternalLink,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  ensureFreeSubscription,
  getPublicPlans,
  getStudioSubscription,
} from "@/server/services/billing.service"
import { untypedServer } from "@/server/supabase/untyped"
import { formatCurrency, formatDate } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

import { BillingActions } from "./billing-actions"
import { PlanUpgradeGrid } from "./plan-upgrade-grid"

export const metadata: Metadata = { title: "Facturación · Configuración" }

export default async function BillingSettingsPage({
  searchParams,
}: {
  searchParams?: { checkout?: string; session_id?: string }
}) {
  const session = await requireStudioAuth()

  // Garantizar que el studio tiene al menos plan free
  await ensureFreeSubscription(session.studioId).catch(() => null)

  const [subResult, plans, unread, invoicesRes] = await Promise.all([
    getStudioSubscription(session.studioId),
    getPublicPlans(),
    countUnreadNotifications(session.studioId),
    untypedServer()
      .from("billing_invoices")
      .select("*")
      .eq("studio_id", session.studioId)
      .order("issued_at", { ascending: false })
      .limit(12),
  ])

  if (!subResult) {
    // No debería pasar después de ensureFreeSubscription, fallback
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No se pudo cargar la suscripción. Recarga la página.
        </p>
      </main>
    )
  }

  const { subscription, plan } = subResult
  type InvoiceRow = {
    id: string
    amount_due: number | string
    amount_paid: number | string
    currency: string
    status: string
    issued_at: string
    paid_at: string | null
    hosted_invoice_url: string | null
    invoice_pdf_url: string | null
  }
  const invoices = (invoicesRes.data ?? []) as InvoiceRow[]

  const checkoutSuccess = searchParams?.checkout === "success"
  const checkoutCancel = searchParams?.checkout === "cancel"

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Facturación y plan"
        description="Gestiona tu suscripción, cambia de plan o cancela cuando quieras."
        unreadNotifications={unread}
      />

      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Checkout result banners */}
        {checkoutSuccess && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 className="size-4" />
            ¡Suscripción activada! Bienvenido al plan{" "}
            <strong>{plan.name}</strong>.
          </div>
        )}
        {checkoutCancel && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <AlertCircle className="size-4" />
            Checkout cancelado. Sigues en el plan {plan.name}.
          </div>
        )}

        {/* Plan actual */}
        <section className="sf-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Plan actual
              </p>
              <h2 className="mt-1 text-2xl font-bold">
                {plan.name}
                {plan.badge_text && (
                  <span
                    className="ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white"
                    style={{
                      backgroundColor: plan.badge_color ?? "#7C3AED",
                    }}
                  >
                    <Sparkles className="size-2.5" />
                    {plan.badge_text}
                  </span>
                )}
              </h2>
              {plan.description && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {plan.description}
                </p>
              )}
            </div>

            <StatusBadge status={subscription.status} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-4">
            <KV label="Precio">
              {Number(plan.price_monthly ?? 0) === 0 ? (
                <span>Gratis</span>
              ) : (
                <span className="font-semibold tabular-nums">
                  {plan.currency === "USD"
                    ? `$${Number(subscription.interval === "year" ? plan.price_yearly : plan.price_monthly).toFixed(2)}`
                    : formatCurrency(
                        Number(
                          subscription.interval === "year"
                            ? plan.price_yearly
                            : plan.price_monthly,
                        ),
                      )}{" "}
                  /
                  {subscription.interval === "year" ? "año" : "mes"}
                </span>
              )}
            </KV>
            <KV label="Renueva el">
              <span>
                {subscription.current_period_end
                  ? formatDate(new Date(subscription.current_period_end))
                  : "—"}
              </span>
            </KV>
            <KV label="Trial">
              {subscription.trial_ends_at &&
              new Date(subscription.trial_ends_at) > new Date() ? (
                <span className="text-amber-600">
                  Hasta {formatDate(new Date(subscription.trial_ends_at))}
                </span>
              ) : (
                <span>—</span>
              )}
            </KV>
            <KV label="Cancelación">
              {subscription.cancel_at_period_end ? (
                <span className="text-red-600">
                  Al final del periodo actual
                </span>
              ) : (
                <span>—</span>
              )}
            </KV>
          </div>

          <BillingActions
            hasCustomerId={!!subscription.stripe_customer_id}
            currentStatus={subscription.status}
          />
        </section>

        {/* Upgrade options */}
        {plan.slug !== "agency" && (
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {plan.slug === "free" ? "Mejora tu plan" : "Cambiar de plan"}
            </h3>
            <PlanUpgradeGrid plans={plans} currentPlanSlug={plan.slug} />
          </section>
        )}

        {/* Invoice history */}
        {invoices.length > 0 && (
          <section className="sf-card p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <CreditCard className="mr-1 inline size-3.5" />
              Historial de facturas
            </h3>
            <ul className="divide-y divide-border">
              {invoices.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {formatDate(new Date(inv.issued_at))}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Status: {inv.status}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums">
                      ${Number(inv.amount_paid).toFixed(2)} {inv.currency}
                    </span>
                    {inv.hosted_invoice_url && (
                      <a
                        href={inv.hosted_invoice_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Ver <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { label: string; cls: string; Icon: typeof CheckCircle2 }
  > = {
    active: {
      label: "Activa",
      cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
      Icon: CheckCircle2,
    },
    trialing: {
      label: "Trial",
      cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
      Icon: Clock,
    },
    past_due: {
      label: "Pago atrasado",
      cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
      Icon: AlertCircle,
    },
    canceled: {
      label: "Cancelada",
      cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
      Icon: AlertCircle,
    },
    unpaid: {
      label: "Sin pagar",
      cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
      Icon: AlertCircle,
    },
  }
  const m = map[status] ?? map.active
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${m.cls}`}
    >
      <m.Icon className="size-3.5" />
      {m.label}
    </span>
  )
}

function KV({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  )
}
