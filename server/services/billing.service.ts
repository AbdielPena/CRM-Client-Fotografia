import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"

/**
 * Service de billing / SaaS subscription management.
 *
 * Patrón:
 *   - billing_plans son el catálogo (editable por platform_admin)
 *   - billing_subscriptions es 1 fila por studio con su plan actual
 *   - features se resuelven con merge plan.features + subscription.features_override
 *   - hasFeature() / requireFeature() son los helpers para gating
 *
 * Default cuando no hay suscripción: 'free' plan (auto-creado al primer signup)
 */

export type BillingPlan = {
  id: string
  slug: string
  name: string
  description: string | null
  tagline: string | null
  price_monthly: number | string | null
  price_yearly: number | string | null
  currency: string
  stripe_price_id_monthly: string | null
  stripe_price_id_yearly: string | null
  stripe_product_id: string | null
  features: PlanFeatures
  trial_days: number | null
  sort_order: number
  is_featured: boolean
  badge_text: string | null
  badge_color: string | null
  is_active: boolean
  is_public: boolean
  created_at: string
}

export type PlanFeatures = {
  // Limites (null = ilimitado)
  max_clients?: number | null
  max_users?: number | null
  max_storage_gb?: number | null
  // Módulos habilitados
  modules?: string[]
  // Flags
  custom_domain?: boolean
  api_access?: boolean
  white_label?: boolean
  remove_branding?: boolean
  // Soporte
  support_tier?: "community" | "email" | "priority"
  // Límites por feature
  automations_max_rules?: number | null
  mail_max_accounts?: number | null
}

export type BillingSubscription = {
  id: string
  studio_id: string
  plan_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  status:
    | "trialing"
    | "active"
    | "past_due"
    | "canceled"
    | "unpaid"
    | "incomplete"
    | "incomplete_expired"
    | "paused"
  interval: "month" | "year" | "lifetime"
  current_period_start: string | null
  current_period_end: string | null
  trial_ends_at: string | null
  cancel_at_period_end: boolean
  canceled_at: string | null
  metadata: Record<string, unknown>
  features_override: PlanFeatures | null
  created_at: string
  updated_at: string
}

// ============================================================================
// Plans CRUD (platform_admin only via UI)
// ============================================================================

export async function getPublicPlans(): Promise<BillingPlan[]> {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("billing_plans")
    .select("*")
    .eq("is_active", true)
    .eq("is_public", true)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })

  if (error) throwServiceError("BILLING_PLANS_LIST_FAILED", error)
  return (data ?? []) as BillingPlan[]
}

export async function getAllPlans(): Promise<BillingPlan[]> {
  const sb = untypedService()
  const { data, error } = await sb
    .from("billing_plans")
    .select("*")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })

  if (error) throwServiceError("BILLING_PLANS_ADMIN_LIST_FAILED", error)
  return (data ?? []) as BillingPlan[]
}

export async function getPlanBySlug(slug: string): Promise<BillingPlan | null> {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("billing_plans")
    .select("*")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) throwServiceError("BILLING_PLAN_GET_FAILED", error)
  return (data as BillingPlan) ?? null
}

export async function getPlanById(planId: string): Promise<BillingPlan | null> {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("billing_plans")
    .select("*")
    .eq("id", planId)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) throwServiceError("BILLING_PLAN_GET_FAILED", error)
  return (data as BillingPlan) ?? null
}

export async function upsertPlan(
  actorId: string,
  data: {
    id?: string
    slug: string
    name: string
    description?: string
    tagline?: string
    priceMonthly?: number
    priceYearly?: number
    currency?: string
    stripePriceIdMonthly?: string
    stripePriceIdYearly?: string
    stripeProductId?: string
    features?: PlanFeatures
    trialDays?: number
    sortOrder?: number
    isFeatured?: boolean
    badgeText?: string
    badgeColor?: string
    isActive?: boolean
    isPublic?: boolean
  },
): Promise<BillingPlan> {
  const sb = untypedService()
  const payload = {
    slug: data.slug,
    name: data.name,
    description: data.description ?? null,
    tagline: data.tagline ?? null,
    price_monthly: data.priceMonthly ?? null,
    price_yearly: data.priceYearly ?? null,
    currency: (data.currency ?? "USD").toUpperCase(),
    stripe_price_id_monthly: data.stripePriceIdMonthly ?? null,
    stripe_price_id_yearly: data.stripePriceIdYearly ?? null,
    stripe_product_id: data.stripeProductId ?? null,
    features: data.features ?? {},
    trial_days: data.trialDays ?? null,
    sort_order: data.sortOrder ?? 0,
    is_featured: data.isFeatured ?? false,
    badge_text: data.badgeText ?? null,
    badge_color: data.badgeColor ?? null,
    is_active: data.isActive ?? true,
    is_public: data.isPublic ?? true,
    created_by: actorId,
  }

  let row: BillingPlan
  if (data.id) {
    const { data: updated, error } = await sb
      .from("billing_plans")
      .update(payload)
      .eq("id", data.id)
      .select("*")
      .single()
    if (error) throwServiceError("BILLING_PLAN_UPDATE_FAILED", error)
    row = updated as BillingPlan
  } else {
    const { data: inserted, error } = await sb
      .from("billing_plans")
      .insert(payload)
      .select("*")
      .single()
    if (error) throwServiceError("BILLING_PLAN_CREATE_FAILED", error)
    row = inserted as BillingPlan
  }

  await logActivity({
    studioId: "platform",
    actorId,
    entityType: "billing_plan",
    entityId: row.id,
    action: data.id ? "billing_plan.updated" : "billing_plan.created",
    metadata: { slug: row.slug, name: row.name },
  })

  return row
}

// ============================================================================
// Subscriptions
// ============================================================================

export async function getStudioSubscription(
  studioId: string,
): Promise<{ subscription: BillingSubscription; plan: BillingPlan } | null> {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("billing_subscriptions")
    .select(
      `*,
       plan:billing_plans(*)`,
    )
    .eq("studio_id", studioId)
    .maybeSingle()

  if (error) throwServiceError("BILLING_SUB_GET_FAILED", error)
  if (!data) return null

  const sub = data as BillingSubscription & { plan: BillingPlan | null }
  if (!sub.plan) return null

  return { subscription: sub, plan: sub.plan }
}

/**
 * Crea suscripción inicial al plan 'free' para un studio nuevo.
 * Idempotente: si ya existe, devuelve la existente.
 */
export async function ensureFreeSubscription(
  studioId: string,
): Promise<BillingSubscription> {
  const sb = untypedService()

  // Check si ya existe
  const { data: existing } = await sb
    .from("billing_subscriptions")
    .select("*")
    .eq("studio_id", studioId)
    .maybeSingle()
  if (existing) return existing as BillingSubscription

  // Buscar plan free
  const freePlan = await getPlanBySlug("free")
  if (!freePlan) throw new Error("BILLING_FREE_PLAN_NOT_FOUND")

  const { data: inserted, error } = await sb
    .from("billing_subscriptions")
    .insert({
      studio_id: studioId,
      plan_id: freePlan.id,
      status: "active",
      interval: "month",
      current_period_start: new Date().toISOString(),
    })
    .select("*")
    .single()

  if (error)
    throwServiceError("BILLING_SUB_CREATE_FAILED", error, { studioId })

  return inserted as BillingSubscription
}

/**
 * Cambia el plan del studio. Usado:
 *   - desde Stripe webhook (customer.subscription.updated)
 *   - desde platform_admin UI (cambio manual)
 *
 * No maneja prorrateo (eso lo hace Stripe). Solo persiste el cambio local.
 */
export async function updateStudioSubscription(
  actorId: string,
  studioId: string,
  patch: Partial<{
    planId: string
    status: BillingSubscription["status"]
    interval: BillingSubscription["interval"]
    stripeCustomerId: string
    stripeSubscriptionId: string
    currentPeriodStart: string
    currentPeriodEnd: string
    trialEndsAt: string
    cancelAtPeriodEnd: boolean
    canceledAt: string
    featuresOverride: PlanFeatures | null
    metadata: Record<string, unknown>
  }>,
): Promise<BillingSubscription> {
  const sb = untypedService()
  const dbPatch: Record<string, unknown> = {}
  if (patch.planId !== undefined) dbPatch.plan_id = patch.planId
  if (patch.status !== undefined) dbPatch.status = patch.status
  if (patch.interval !== undefined) dbPatch.interval = patch.interval
  if (patch.stripeCustomerId !== undefined)
    dbPatch.stripe_customer_id = patch.stripeCustomerId
  if (patch.stripeSubscriptionId !== undefined)
    dbPatch.stripe_subscription_id = patch.stripeSubscriptionId
  if (patch.currentPeriodStart !== undefined)
    dbPatch.current_period_start = patch.currentPeriodStart
  if (patch.currentPeriodEnd !== undefined)
    dbPatch.current_period_end = patch.currentPeriodEnd
  if (patch.trialEndsAt !== undefined)
    dbPatch.trial_ends_at = patch.trialEndsAt
  if (patch.cancelAtPeriodEnd !== undefined)
    dbPatch.cancel_at_period_end = patch.cancelAtPeriodEnd
  if (patch.canceledAt !== undefined) dbPatch.canceled_at = patch.canceledAt
  if (patch.featuresOverride !== undefined)
    dbPatch.features_override = patch.featuresOverride
  if (patch.metadata !== undefined) dbPatch.metadata = patch.metadata

  const { data, error } = await sb
    .from("billing_subscriptions")
    .update(dbPatch)
    .eq("studio_id", studioId)
    .select("*")
    .single()

  if (error)
    throwServiceError("BILLING_SUB_UPDATE_FAILED", error, { studioId })

  await logActivity({
    studioId,
    actorId,
    entityType: "billing_subscription",
    entityId: (data as BillingSubscription).id,
    action: "billing_subscription.updated",
    metadata: patch as Record<string, unknown>,
  })

  return data as BillingSubscription
}

// ============================================================================
// Feature gating
// ============================================================================

/**
 * Devuelve features efectivas del studio (plan.features merge con override).
 * Si no hay suscripción, devuelve features del plan 'free'.
 */
export async function getEffectiveFeatures(
  studioId: string,
): Promise<PlanFeatures> {
  const subResult = await getStudioSubscription(studioId)
  if (!subResult) {
    const freePlan = await getPlanBySlug("free")
    return (freePlan?.features as PlanFeatures) ?? {}
  }

  const { subscription, plan } = subResult
  const planFeatures = (plan.features ?? {}) as PlanFeatures
  const override = (subscription.features_override ?? {}) as PlanFeatures

  // Merge: override wins
  return { ...planFeatures, ...override }
}

/**
 * Verifica si una feature está habilitada para el studio.
 *
 * Soporta paths con notación dot:
 *   hasFeature(studioId, "custom_domain")        → boolean
 *   hasFeature(studioId, "modules.inventory")    → boolean (incluye en modules[])
 *   hasFeature(studioId, "api_access")           → boolean
 *
 * Para limites usar getFeatureLimit() en su lugar.
 */
export async function hasFeature(
  studioId: string,
  feature: string,
): Promise<boolean> {
  const features = await getEffectiveFeatures(studioId)

  // Modules array
  if (feature.startsWith("modules.")) {
    const moduleName = feature.slice("modules.".length)
    return (features.modules ?? []).includes(moduleName)
  }

  // Boolean flags
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const value = (features as any)[feature]
  return value === true
}

/**
 * Devuelve el limite numerico de una feature (null = ilimitado).
 *
 * getFeatureLimit(studioId, "max_clients") → 250 | null | 0
 */
export async function getFeatureLimit(
  studioId: string,
  feature: keyof PlanFeatures,
): Promise<number | null | undefined> {
  const features = await getEffectiveFeatures(studioId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const value = (features as any)[feature]
  if (typeof value === "number") return value
  if (value === null) return null // ilimitado
  return undefined // feature no definida
}

/**
 * Throws si el studio no tiene la feature. Usar en Server Actions / Route Handlers.
 */
export async function requireFeature(
  studioId: string,
  feature: string,
  errorMessage?: string,
): Promise<void> {
  const has = await hasFeature(studioId, feature)
  if (!has) {
    throw new Error(
      errorMessage ?? `FEATURE_NOT_AVAILABLE: ${feature} requires plan upgrade`,
    )
  }
}

/**
 * Verifica si el studio puede crear N más entidades sin exceder el límite.
 * Devuelve { allowed: boolean, current: number, limit: number | null }.
 */
export async function checkLimit(
  studioId: string,
  limitKey: keyof PlanFeatures,
  currentCount: number,
  delta = 1,
): Promise<{ allowed: boolean; current: number; limit: number | null }> {
  const limit = await getFeatureLimit(studioId, limitKey)
  if (limit === null || limit === undefined) {
    // null = ilimitado, undefined = sin restricción
    return { allowed: true, current: currentCount, limit: null }
  }
  return {
    allowed: currentCount + delta <= limit,
    current: currentCount,
    limit,
  }
}

// ============================================================================
// Usage metrics refresh
// ============================================================================

/**
 * Refresca los counts de uso para un studio. Llamar desde cron diario.
 */
export async function refreshUsageMetrics(studioId: string): Promise<void> {
  const sb = untypedService()

  const [clientsRes, usersRes, invoicesRes, mailAccountsRes, automationsRes] =
    await Promise.all([
      sb
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", studioId)
        .is("deleted_at", null),
      sb
        .from("studio_members")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", studioId),
      sb
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", studioId)
        .is("deleted_at", null),
      sb
        .from("mail_accounts")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", studioId)
        .is("deleted_at", null),
      sb
        .from("automation_rules")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", studioId)
        .is("deleted_at", null),
    ])

  await sb.from("billing_usage_metrics").upsert(
    {
      studio_id: studioId,
      clients_count: clientsRes.count ?? 0,
      users_count: usersRes.count ?? 0,
      invoices_count: invoicesRes.count ?? 0,
      mail_accounts_count: mailAccountsRes.count ?? 0,
      automation_rules_count: automationsRes.count ?? 0,
      refreshed_at: new Date().toISOString(),
    },
    { onConflict: "studio_id" },
  )
}
