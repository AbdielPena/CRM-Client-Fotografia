"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Save, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"

import { upsertPlanAction } from "@/server/actions/billing.actions"
import type { BillingPlan } from "@/server/services/billing.service"
import { Button } from "@/components/ui/button"

export function PlanEditForm({ plan }: { plan: BillingPlan | null }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{
    type: "ok" | "err"
    msg: string
  } | null>(null)
  const [featuresJson, setFeaturesJson] = useState<string>(() =>
    JSON.stringify(plan?.features ?? defaultFeatures(), null, 2),
  )

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("featuresJson", featuresJson)
    if (plan?.id) formData.set("id", plan.id)

    startTransition(async () => {
      const res = await upsertPlanAction(formData)
      if (res.ok) {
        setFeedback({ type: "ok", msg: "Plan guardado" })
        if (!plan && res.planId) {
          setTimeout(
            () => router.push(`/admin/billing/plans/${res.planId}`),
            500,
          )
        } else {
          router.refresh()
        }
      } else {
        setFeedback({
          type: "err",
          msg: res.message ?? "Error desconocido",
        })
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {feedback && (
        <div
          className={
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm " +
            (feedback.type === "ok"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300")
          }
        >
          {feedback.type === "ok" ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <AlertCircle className="size-4" />
          )}
          {feedback.msg}
        </div>
      )}

      {/* Info básica */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Información básica
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Slug <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="slug"
              required
              defaultValue={plan?.slug ?? ""}
              placeholder="pro, studio, agency..."
              pattern="^[a-z0-9_-]+$"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Solo lowercase, underscores y dashes. No se puede cambiar después.
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              required
              defaultValue={plan?.name ?? ""}
              placeholder="Pro"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium">
              Descripción
            </label>
            <textarea
              name="description"
              defaultValue={plan?.description ?? ""}
              rows={2}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">Tagline</label>
            <input
              type="text"
              name="tagline"
              defaultValue={plan?.tagline ?? ""}
              placeholder="Más popular"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Orden de display
            </label>
            <input
              type="number"
              name="sortOrder"
              defaultValue={plan?.sort_order ?? 0}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Precios
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Precio mensual
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="priceMonthly"
              defaultValue={
                plan?.price_monthly ? String(plan.price_monthly) : ""
              }
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Precio anual
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="priceYearly"
              defaultValue={
                plan?.price_yearly ? String(plan.price_yearly) : ""
              }
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">Moneda</label>
            <select
              name="currency"
              defaultValue={plan?.currency ?? "USD"}
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="USD">USD</option>
              <option value="DOP">DOP</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Trial gratis (días)
            </label>
            <input
              type="number"
              min="0"
              name="trialDays"
              defaultValue={plan?.trial_days ?? ""}
              placeholder="0 = sin trial"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      {/* Stripe IDs */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Stripe IDs (configurar después de crear los Products en Stripe)
        </h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              stripe_price_id_monthly
            </label>
            <input
              type="text"
              name="stripePriceIdMonthly"
              defaultValue={plan?.stripe_price_id_monthly ?? ""}
              placeholder="price_XXXXXXXXXXX"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              stripe_price_id_yearly
            </label>
            <input
              type="text"
              name="stripePriceIdYearly"
              defaultValue={plan?.stripe_price_id_yearly ?? ""}
              placeholder="price_XXXXXXXXXXX"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              stripe_product_id (opcional)
            </label>
            <input
              type="text"
              name="stripeProductId"
              defaultValue={plan?.stripe_product_id ?? ""}
              placeholder="prod_XXXXXXXXXXX"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono"
            />
          </div>
        </div>
      </section>

      {/* Features JSONB */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Features (JSON editable)
        </h3>
        <textarea
          value={featuresJson}
          onChange={(e) => setFeaturesJson(e.target.value)}
          rows={16}
          className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 font-mono text-xs"
        />
        <p className="mt-2 text-[10px] text-muted-foreground">
          Keys soportadas: <code>max_clients</code>, <code>max_users</code>,{" "}
          <code>max_storage_gb</code>, <code>modules</code> (array),{" "}
          <code>custom_domain</code>, <code>api_access</code>,{" "}
          <code>white_label</code>, <code>remove_branding</code>,{" "}
          <code>support_tier</code>, <code>automations_max_rules</code>,{" "}
          <code>mail_max_accounts</code>. null = ilimitado.
        </p>
      </section>

      {/* Display + estado */}
      <section className="sf-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Display + estado
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Badge text (opcional)
            </label>
            <input
              type="text"
              name="badgeText"
              defaultValue={plan?.badge_text ?? ""}
              placeholder="Más popular"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Badge color (hex)
            </label>
            <input
              type="text"
              name="badgeColor"
              defaultValue={plan?.badge_color ?? ""}
              placeholder="#7C3AED"
              className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono"
            />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="isFeatured"
              defaultChecked={plan?.is_featured ?? false}
              className="mt-0.5 rounded border-input"
            />
            <div>
              <p className="text-sm font-medium">Destacado</p>
              <p className="text-[10px] text-muted-foreground">
                Aparece más grande en /pricing
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={plan?.is_active ?? true}
              className="mt-0.5 rounded border-input"
            />
            <div>
              <p className="text-sm font-medium">Activo</p>
              <p className="text-[10px] text-muted-foreground">
                Si desactivas, studios con sub mantienen el plan pero nadie
                nuevo se puede suscribir
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="isPublic"
              defaultChecked={plan?.is_public ?? true}
              className="mt-0.5 rounded border-input"
            />
            <div>
              <p className="text-sm font-medium">Público en /pricing</p>
              <p className="text-[10px] text-muted-foreground">
                Si lo desactivas, el plan existe pero solo via link directo /register?plan=slug
              </p>
            </div>
          </label>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="mr-1 size-4 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="mr-1 size-4" />
              {plan ? "Guardar cambios" : "Crear plan"}
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

function defaultFeatures() {
  return {
    max_clients: 100,
    max_users: 3,
    max_storage_gb: 25,
    modules: ["crm", "invoices", "galleries"],
    custom_domain: false,
    api_access: false,
    white_label: false,
    remove_branding: false,
    support_tier: "email",
    automations_max_rules: 5,
    mail_max_accounts: 1,
  }
}
