"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireStudioAuth, requireRole } from "@/server/middleware/auth"
import {
  createCheckoutSession,
  createCustomerPortalSession,
} from "@/server/services/stripe-checkout.service"
import { upsertPlan, type PlanFeatures } from "@/server/services/billing.service"

export async function startCheckoutAction(
  planId: string,
  interval: "month" | "year" = "month",
) {
  const session = await requireStudioAuth()

  const result = await createCheckoutSession({
    studioId: session.studioId,
    studioEmail: session.email,
    studioName: session.studioName,
    planId,
    interval,
  })

  if (!result.url) {
    throw new Error("CHECKOUT_URL_NULL")
  }

  redirect(result.url)
}

export async function openCustomerPortalAction() {
  const session = await requireStudioAuth()
  const result = await createCustomerPortalSession(session.studioId)
  redirect(result.url)
}

// ============================================================================
// Platform admin actions (manage plans)
// ============================================================================

export async function upsertPlanAction(formData: FormData): Promise<{
  ok: boolean
  message?: string
  planId?: string
}> {
  let session
  try {
    session = await requireRole("admin")
  } catch {
    return { ok: false, message: "Permisos insuficientes" }
  }

  // Solo platform_admins
  const { untypedServer } = await import("@/server/supabase/untyped")
  const sb = untypedServer()
  const { data: isPlatformAdmin } = await sb
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", session.userId)
    .maybeSingle()
  if (!isPlatformAdmin) {
    return { ok: false, message: "Solo platform_admins pueden editar planes" }
  }

  try {
    const id = (formData.get("id") as string) || undefined
    const featuresJson = String(formData.get("featuresJson") ?? "{}")
    let features: PlanFeatures
    try {
      features = JSON.parse(featuresJson) as PlanFeatures
    } catch {
      return { ok: false, message: "featuresJson no es JSON válido" }
    }

    const plan = await upsertPlan(session.userId, {
      id,
      slug: String(formData.get("slug") ?? ""),
      name: String(formData.get("name") ?? ""),
      description: (formData.get("description") as string) || undefined,
      tagline: (formData.get("tagline") as string) || undefined,
      priceMonthly: formData.get("priceMonthly")
        ? Number(formData.get("priceMonthly"))
        : undefined,
      priceYearly: formData.get("priceYearly")
        ? Number(formData.get("priceYearly"))
        : undefined,
      currency: (formData.get("currency") as string) || "USD",
      stripePriceIdMonthly:
        (formData.get("stripePriceIdMonthly") as string) || undefined,
      stripePriceIdYearly:
        (formData.get("stripePriceIdYearly") as string) || undefined,
      stripeProductId: (formData.get("stripeProductId") as string) || undefined,
      features,
      trialDays: formData.get("trialDays")
        ? Number(formData.get("trialDays"))
        : undefined,
      sortOrder: formData.get("sortOrder")
        ? Number(formData.get("sortOrder"))
        : 0,
      isFeatured: formData.get("isFeatured") === "on",
      badgeText: (formData.get("badgeText") as string) || undefined,
      badgeColor: (formData.get("badgeColor") as string) || undefined,
      isActive: formData.get("isActive") !== "off",
      isPublic: formData.get("isPublic") !== "off",
    })

    revalidatePath("/admin/billing/plans")
    revalidatePath("/pricing")
    return { ok: true, planId: plan.id }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido",
    }
  }
}
