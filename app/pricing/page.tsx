import Link from "next/link"
import { Check, Sparkles, ArrowRight, X } from "lucide-react"
import type { Metadata } from "next"

import { getPublicPlans } from "@/server/services/billing.service"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils/currency"

export const metadata: Metadata = {
  title: "Precios · StudioFlow",
  description:
    "Planes para fotógrafos profesionales y estudios. Empieza gratis, escala según crezcas.",
}

const FEATURE_LABELS: Record<string, string> = {
  max_clients: "Clientes",
  max_users: "Usuarios",
  max_storage_gb: "Almacenamiento",
  modules: "Módulos incluidos",
  custom_domain: "Dominio personalizado",
  api_access: "Acceso a API",
  white_label: "White-label",
  remove_branding: "Sin marca StudioFlow",
  support_tier: "Soporte",
  automations_max_rules: "Automatizaciones",
  mail_max_accounts: "Cuentas de correo",
}

const MODULE_LABELS: Record<string, string> = {
  crm: "CRM",
  invoices: "Facturas",
  galleries: "Galerías",
  inventory: "Inventario",
  finance: "Finanzas",
  mail: "Correo",
  automations: "Automatizaciones",
}

export default async function PricingPage() {
  const plans = await getPublicPlans()

  return (
    <main className="min-h-screen bg-background">
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-24">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Planes diseñados para fotógrafos
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Empieza gratis. Escala cuando estés listo. Todos los planes incluyen
          CRM + Facturación. Cancela cuando quieras.
        </p>
      </section>

      {/* Plans grid */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
        <div
          className={
            "grid gap-6 " +
            (plans.length === 1
              ? "max-w-md mx-auto"
              : plans.length === 2
                ? "grid-cols-1 md:grid-cols-2 max-w-3xl mx-auto"
                : plans.length === 3
                  ? "grid-cols-1 md:grid-cols-3"
                  : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4")
          }
        >
          {plans.map((plan) => {
            const features = plan.features ?? {}
            const isFeature = plan.is_featured
            return (
              <div
                key={plan.id}
                className={
                  "relative flex flex-col rounded-2xl border p-6 transition-shadow hover:shadow-lg " +
                  (isFeature
                    ? "border-primary bg-primary/5 shadow-md"
                    : "border-border bg-card")
                }
              >
                {plan.badge_text && (
                  <span
                    className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm"
                    style={{
                      backgroundColor: plan.badge_color ?? "#7C3AED",
                    }}
                  >
                    <Sparkles className="size-3" />
                    {plan.badge_text}
                  </span>
                )}

                <div className="mb-4">
                  <h3 className="text-lg font-bold">{plan.name}</h3>
                  {plan.tagline && (
                    <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
                      {plan.tagline}
                    </p>
                  )}
                </div>

                <div className="mb-4">
                  {Number(plan.price_monthly ?? 0) === 0 ? (
                    <p className="text-3xl font-bold">Gratis</p>
                  ) : (
                    <>
                      <p className="text-3xl font-bold tabular-nums">
                        {plan.currency === "USD"
                          ? `$${Number(plan.price_monthly).toFixed(0)}`
                          : formatCurrency(Number(plan.price_monthly ?? 0))}
                        <span className="ml-1 text-sm font-normal text-muted-foreground">
                          /mes
                        </span>
                      </p>
                      {Number(plan.price_yearly ?? 0) > 0 && (
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          o {plan.currency === "USD" ? "$" : ""}
                          {Number(plan.price_yearly).toFixed(0)} /año (
                          {Math.round(
                            (1 -
                              Number(plan.price_yearly) /
                                (Number(plan.price_monthly) * 12)) *
                              100,
                          )}
                          % off)
                        </p>
                      )}
                    </>
                  )}
                </div>

                {plan.description && (
                  <p className="mb-4 text-sm text-muted-foreground">
                    {plan.description}
                  </p>
                )}

                <Button
                  asChild
                  size="lg"
                  variant={isFeature ? "default" : "outline"}
                  fullWidth
                  className="mb-6"
                >
                  <Link href={`/register?plan=${plan.slug}`}>
                    {plan.trial_days && plan.trial_days > 0
                      ? `Empezar ${plan.trial_days}d gratis`
                      : Number(plan.price_monthly ?? 0) === 0
                        ? "Crear cuenta gratis"
                        : "Empezar ahora"}
                    <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>

                {/* Features */}
                <ul className="flex-1 space-y-2.5 text-sm">
                  <FeatureItem
                    label={`${features.max_clients ?? "∞"} ${FEATURE_LABELS.max_clients}`}
                  />
                  <FeatureItem
                    label={`${features.max_users ?? "∞"} ${FEATURE_LABELS.max_users}`}
                  />
                  <FeatureItem
                    label={`${features.max_storage_gb ?? "∞"} GB ${FEATURE_LABELS.max_storage_gb}`}
                  />
                  {features.modules && features.modules.length > 0 && (
                    <li className="text-xs text-muted-foreground">
                      Módulos:{" "}
                      <span className="text-foreground">
                        {features.modules
                          .map((m) => MODULE_LABELS[m] ?? m)
                          .join(", ")}
                      </span>
                    </li>
                  )}
                  <FeatureItem
                    enabled={!!features.custom_domain}
                    label={FEATURE_LABELS.custom_domain}
                  />
                  <FeatureItem
                    enabled={!!features.remove_branding}
                    label={FEATURE_LABELS.remove_branding}
                  />
                  <FeatureItem
                    enabled={!!features.api_access}
                    label={FEATURE_LABELS.api_access}
                  />
                  <FeatureItem
                    enabled={!!features.white_label}
                    label={FEATURE_LABELS.white_label}
                  />
                  <FeatureItem
                    label={`Soporte: ${features.support_tier ?? "community"}`}
                  />
                </ul>
              </div>
            )
          })}
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        <p>
          ¿Necesitas algo personalizado?{" "}
          <Link href="/contact" className="text-primary hover:underline">
            Contáctanos
          </Link>{" "}
          · Todos los precios en USD · No compromisos
        </p>
      </footer>
    </main>
  )
}

function FeatureItem({
  enabled = true,
  label,
}: {
  enabled?: boolean
  label: string
}) {
  return (
    <li className="flex items-start gap-2">
      {enabled ? (
        <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
      ) : (
        <X className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
      )}
      <span className={enabled ? "" : "text-muted-foreground/70 line-through"}>
        {label}
      </span>
    </li>
  )
}
