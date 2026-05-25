import Link from "next/link"
import { CreditCard, Pencil, Plus, EyeOff, Sparkles } from "lucide-react"
import type { Metadata } from "next"

import { requireRole } from "@/server/middleware/auth"
import { getAllPlans } from "@/server/services/billing.service"
import { untypedServer } from "@/server/supabase/untyped"
import { formatDate } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Planes · Admin" }

export default async function AdminPlansPage() {
  const session = await requireRole("admin")

  // Solo platform admins
  const sb = untypedServer()
  const { data: isPlatformAdmin } = await sb
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", session.userId)
    .maybeSingle()

  if (!isPlatformAdmin) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold">Acceso denegado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Solo platform admins pueden editar planes.
        </p>
      </main>
    )
  }

  const plans = await getAllPlans()

  return (
    <>
      <AppTopbar
        eyebrow="Platform admin"
        title="Planes de billing"
        description="Edita precios, features, Stripe IDs. Cambios aplican inmediatamente a nuevos signups."
        actions={
          <Button asChild>
            <Link href="/admin/billing/plans/new">
              <Plus className="mr-1 size-4" />
              Nuevo plan
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        {plans.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            No hay planes configurados. La migration debería haber seeded 4
            planes default (free, pro, studio, agency).
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {plans.map((plan) => {
              const monthly = Number(plan.price_monthly ?? 0)
              return (
                <Link
                  key={plan.id}
                  href={`/admin/billing/plans/${plan.id}`}
                  className="sf-card group block p-4 transition-colors hover:bg-accent/30"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold">
                          {plan.name}
                        </h3>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {plan.slug}
                        </code>
                        {plan.is_featured && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                            <Sparkles className="size-2.5" />
                            Destacado
                          </span>
                        )}
                        {!plan.is_active && (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                            Inactivo
                          </span>
                        )}
                        {!plan.is_public && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                            <EyeOff className="size-2.5" />
                            Oculto
                          </span>
                        )}
                      </div>
                      {plan.description && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {plan.description}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                        <span>
                          Mensual:{" "}
                          <strong className="text-foreground tabular-nums">
                            {monthly === 0
                              ? "Gratis"
                              : `${plan.currency === "USD" ? "$" : ""}${monthly.toFixed(2)}`}
                          </strong>
                        </span>
                        <span>·</span>
                        <span>
                          Anual:{" "}
                          <strong className="text-foreground tabular-nums">
                            {Number(plan.price_yearly ?? 0) === 0
                              ? "—"
                              : `${plan.currency === "USD" ? "$" : ""}${Number(plan.price_yearly).toFixed(2)}`}
                          </strong>
                        </span>
                        {plan.trial_days && (
                          <>
                            <span>·</span>
                            <span>
                              Trial:{" "}
                              <strong className="text-foreground">
                                {plan.trial_days}d
                              </strong>
                            </span>
                          </>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-[10px]">
                        <span
                          className={
                            "rounded px-1.5 py-0.5 " +
                            (plan.stripe_price_id_monthly
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300")
                          }
                        >
                          Stripe Monthly:{" "}
                          {plan.stripe_price_id_monthly ? "✓" : "Falta"}
                        </span>
                        <span
                          className={
                            "rounded px-1.5 py-0.5 " +
                            (plan.stripe_price_id_yearly
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300")
                          }
                        >
                          Stripe Yearly:{" "}
                          {plan.stripe_price_id_yearly ? "✓" : "Falta"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Pencil className="size-4 opacity-50 group-hover:opacity-100" />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        <div className="rounded-xl border border-input bg-card p-4 text-xs text-muted-foreground">
          <p className="mb-2 font-medium text-foreground">
            <CreditCard className="mr-1 inline size-3.5" />
            Setup en Stripe
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              Crea Products + Prices en{" "}
              <a
                href="https://dashboard.stripe.com/products"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Stripe Dashboard
              </a>{" "}
              (uno per intervalo)
            </li>
            <li>
              Copia el <code className="rounded bg-muted px-1">price_id</code>{" "}
              (formato <code>price_XXXX</code>) y pégalo en el plan aquí
            </li>
            <li>
              Configura el webhook endpoint{" "}
              <code className="rounded bg-muted px-1">
                /api/webhooks/stripe-billing
              </code>{" "}
              con eventos: <code>customer.subscription.*</code> +{" "}
              <code>checkout.session.completed</code> +{" "}
              <code>invoice.paid/payment_failed</code>
            </li>
            <li>
              Copia el signing secret al env{" "}
              <code className="rounded bg-muted px-1">
                STRIPE_WEBHOOK_SECRET_BILLING
              </code>
            </li>
          </ul>
        </div>
      </main>
    </>
  )
}
