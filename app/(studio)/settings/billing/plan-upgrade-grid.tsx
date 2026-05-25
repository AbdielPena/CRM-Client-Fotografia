"use client"

import { useState, useTransition } from "react"
import { Check, X, Loader2, ArrowRight } from "lucide-react"

import { startCheckoutAction } from "@/server/actions/billing.actions"
import type { BillingPlan } from "@/server/services/billing.service"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils/currency"

const MODULE_LABELS: Record<string, string> = {
  crm: "CRM",
  invoices: "Facturas",
  galleries: "Galerías",
  inventory: "Inventario",
  finance: "Finanzas",
  mail: "Correo",
  automations: "Automatizaciones",
}

export function PlanUpgradeGrid({
  plans,
  currentPlanSlug,
}: {
  plans: BillingPlan[]
  currentPlanSlug: string
}) {
  const [interval, setInterval] = useState<"month" | "year">("month")
  const [isPending, startTransition] = useTransition()
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null)

  function handleCheckout(planId: string) {
    setPendingPlanId(planId)
    startTransition(async () => {
      try {
        await startCheckoutAction(planId, interval)
      } catch (err) {
        console.error(err)
        setPendingPlanId(null)
      }
    })
  }

  // Filtra: planes públicos + distintos del actual
  const upgradePlans = plans.filter(
    (p) => p.is_public && p.slug !== currentPlanSlug,
  )

  return (
    <div className="space-y-4">
      <div className="inline-flex gap-1 rounded-xl bg-muted p-1">
        <button
          type="button"
          onClick={() => setInterval("month")}
          className={
            "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors " +
            (interval === "month"
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          Mensual
        </button>
        <button
          type="button"
          onClick={() => setInterval("year")}
          className={
            "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors " +
            (interval === "year"
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          Anual
          <span className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            -17%
          </span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {upgradePlans.map((plan) => {
          const features = plan.features ?? {}
          const price =
            interval === "year"
              ? Number(plan.price_yearly ?? 0)
              : Number(plan.price_monthly ?? 0)
          return (
            <div
              key={plan.id}
              className={
                "relative rounded-2xl border p-5 transition-shadow hover:shadow-md " +
                (plan.is_featured
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card")
              }
            >
              {plan.badge_text && (
                <span
                  className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white"
                  style={{ backgroundColor: plan.badge_color ?? "#7C3AED" }}
                >
                  {plan.badge_text}
                </span>
              )}

              <h3 className="text-base font-bold">{plan.name}</h3>
              {plan.tagline && (
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {plan.tagline}
                </p>
              )}

              <div className="my-4">
                {price === 0 ? (
                  <p className="text-2xl font-bold">Gratis</p>
                ) : (
                  <p className="text-2xl font-bold tabular-nums">
                    {plan.currency === "USD" ? "$" : ""}
                    {price.toFixed(0)}
                    {plan.currency !== "USD" && ` ${plan.currency}`}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      /{interval === "year" ? "año" : "mes"}
                    </span>
                  </p>
                )}
              </div>

              {plan.description && (
                <p className="mb-3 text-xs text-muted-foreground">
                  {plan.description}
                </p>
              )}

              <Button
                onClick={() => handleCheckout(plan.id)}
                disabled={isPending}
                variant={plan.is_featured ? "default" : "outline"}
                size="sm"
                fullWidth
                className="mb-4"
              >
                {isPending && pendingPlanId === plan.id ? (
                  <>
                    <Loader2 className="mr-1 size-3.5 animate-spin" />
                    Redirigiendo a Stripe...
                  </>
                ) : (
                  <>
                    Cambiar a {plan.name}
                    <ArrowRight className="ml-1 size-3.5" />
                  </>
                )}
              </Button>

              <ul className="space-y-1.5 text-[11px]">
                <FeatureRow
                  enabled
                  label={`${features.max_clients ?? "∞"} clientes`}
                />
                <FeatureRow
                  enabled
                  label={`${features.max_users ?? "∞"} usuarios`}
                />
                <FeatureRow
                  enabled
                  label={`${features.max_storage_gb ?? "∞"} GB storage`}
                />
                {features.modules && (
                  <li className="text-[10px] text-muted-foreground">
                    Módulos:{" "}
                    {features.modules
                      .map((m) => MODULE_LABELS[m] ?? m)
                      .join(", ")}
                  </li>
                )}
                <FeatureRow
                  enabled={!!features.custom_domain}
                  label="Dominio personalizado"
                />
                <FeatureRow
                  enabled={!!features.api_access}
                  label="Acceso API"
                />
                <FeatureRow
                  enabled={!!features.white_label}
                  label="White-label"
                />
                <FeatureRow
                  enabled
                  label={`Soporte ${features.support_tier ?? "community"}`}
                />
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FeatureRow({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <li className="flex items-start gap-1.5">
      {enabled ? (
        <Check className="mt-0.5 size-3 shrink-0 text-emerald-500" />
      ) : (
        <X className="mt-0.5 size-3 shrink-0 text-muted-foreground/50" />
      )}
      <span className={enabled ? "" : "text-muted-foreground/70 line-through"}>
        {label}
      </span>
    </li>
  )
}
