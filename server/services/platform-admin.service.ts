import 'server-only'

import { createSupabaseServiceClient } from '@/server/supabase/service'

/**
 * Servicio para el panel de super admin global (Fase 4.5).
 * Usa service client (bypasa RLS). TODAS las funciones deben ser llamadas
 * SOLO desde código que ya pasó por `requirePlatformAdmin()`.
 */

export type PlatformStudioSummary = {
  id: string
  name: string
  slug: string
  planSlug: string | null
  planName: string | null
  isSuspended: boolean
  createdAt: string
  memberCount: number
  bookingsCount: number
  revenueDop: number
}

export type PlatformStudioDetail = {
  id: string
  name: string
  slug: string
  email: string | null
  phone: string | null
  primaryColor: string
  currency: string
  timezone: string
  createdAt: string
  isSuspended: boolean
  plan: {
    id: string
    slug: string
    name: string
    priceMonthlyDop: number | null
    priceYearlyDop: number | null
  } | null
  owner: {
    userId: string
    email: string | null
    name: string | null
    role: string
  } | null
  stats: {
    members: number
    bookings: number
    clients: number
    revenueDop: number
  }
  overrides: PlatformFeatureOverride[]
}

export type PlatformPlan = {
  id: string
  slug: string
  name: string
  description: string | null
  priceMonthlyDop: number | null
  priceYearlyDop: number | null
  priceMonthlyUsd: number | null
  priceYearlyUsd: number | null
  trialDays: number
  isPublic: boolean
  isActive: boolean
  sortOrder: number
  studiosCount: number
  features: PlatformPlanFeature[]
}

export type PlatformPlanFeature = {
  featureKey: string
  isEnabled: boolean
  limitValue: number | null
  metadata: Record<string, unknown> | null
}

export type PlatformFeatureOverride = {
  id: string
  featureKey: string
  isEnabled: boolean
  limitValue: number | null
  reason: string | null
  expiresAt: string | null
  createdAt: string
}

export type PlatformGlobalStats = {
  totalStudios: number
  activeStudios: number
  suspendedStudios: number
  totalUsers: number
  totalRevenueDop: number
  totalBookings: number
  studiosByPlan: Array<{ planSlug: string | null; planName: string | null; count: number }>
  studiosCreatedLast30d: number
}

/**
 * Stats globales para el landing del super admin.
 */
export async function getPlatformGlobalStats(): Promise<PlatformGlobalStats> {
  const supabase = createSupabaseServiceClient()

  const [
    { count: totalStudios },
    { data: studiosPlanRows },
    { count: totalUsers },
    { data: payments },
    { count: totalBookings },
    { count: recentStudios },
  ] = await Promise.all([
    supabase.from('studios').select('id', { count: 'exact', head: true }),
    supabase.from('studios').select('id, plan_id, is_suspended, plans(slug, name)'),
    supabase.from('studio_members').select('user_id', { count: 'exact', head: true }),
    supabase.from('payments').select('amount').eq('status', 'completed'),
    supabase.from('booking_requests').select('id', { count: 'exact', head: true }),
    supabase
      .from('studios')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
  ])

  const rows = (studiosPlanRows ?? []) as Array<{
    id: string
    plan_id: string | null
    is_suspended: boolean | null
    plans: { slug: string; name: string } | null
  }>

  const suspended = rows.filter((r) => r.is_suspended).length
  const active = rows.length - suspended

  const byPlanMap = new Map<string, { slug: string | null; name: string | null; count: number }>()
  for (const r of rows) {
    const key = r.plans?.slug ?? '__none__'
    const existing = byPlanMap.get(key)
    if (existing) existing.count += 1
    else
      byPlanMap.set(key, {
        slug: r.plans?.slug ?? null,
        name: r.plans?.name ?? null,
        count: 1,
      })
  }

  const totalRevenueDop = (payments ?? []).reduce(
    (sum: number, p: { amount?: number | string | null }) =>
      sum + Number(p.amount ?? 0),
    0,
  )

  return {
    totalStudios: totalStudios ?? 0,
    activeStudios: active,
    suspendedStudios: suspended,
    totalUsers: totalUsers ?? 0,
    totalRevenueDop,
    totalBookings: totalBookings ?? 0,
    studiosByPlan: Array.from(byPlanMap.values()).map((v) => ({
      planSlug: v.slug,
      planName: v.name,
      count: v.count,
    })),
    studiosCreatedLast30d: recentStudios ?? 0,
  }
}

/**
 * Lista de studios para el panel. Enriquecida con plan + contadores básicos.
 */
export async function listPlatformStudios(opts?: {
  search?: string
  planSlug?: string | null
  suspended?: boolean | null
}): Promise<PlatformStudioSummary[]> {
  const supabase = createSupabaseServiceClient()

  let query = supabase
    .from('studios')
    .select('id, name, slug, created_at, is_suspended, plan_id, plans(slug, name)')
    .order('created_at', { ascending: false })

  if (opts?.search) {
    query = query.or(`name.ilike.%${opts.search}%,slug.ilike.%${opts.search}%`)
  }
  if (opts?.suspended === true) query = query.eq('is_suspended', true)
  if (opts?.suspended === false) query = query.eq('is_suspended', false)

  const { data: studios, error } = await query.limit(200)
  if (error) throw error
  if (!studios || studios.length === 0) return []

  const studioIds = studios.map((s: { id: string }) => s.id)

  const [{ data: membersRaw }, { data: bookingsRaw }, { data: paymentsRaw }] = await Promise.all([
    supabase.from('studio_members').select('studio_id').in('studio_id', studioIds),
    supabase.from('booking_requests').select('studio_id').in('studio_id', studioIds),
    supabase
      .from('payments')
      .select('studio_id, amount')
      .in('studio_id', studioIds)
      .eq('status', 'completed'),
  ])

  const memberCounts = new Map<string, number>()
  for (const row of membersRaw ?? []) {
    memberCounts.set(row.studio_id, (memberCounts.get(row.studio_id) ?? 0) + 1)
  }
  const bookingCounts = new Map<string, number>()
  for (const row of bookingsRaw ?? []) {
    bookingCounts.set(row.studio_id, (bookingCounts.get(row.studio_id) ?? 0) + 1)
  }
  const revenueByStudio = new Map<string, number>()
  for (const row of paymentsRaw ?? []) {
    revenueByStudio.set(
      row.studio_id,
      (revenueByStudio.get(row.studio_id) ?? 0) + Number(row.amount ?? 0),
    )
  }

  const enriched: PlatformStudioSummary[] = studios.map((s: any) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    planSlug: s.plans?.slug ?? null,
    planName: s.plans?.name ?? null,
    isSuspended: !!s.is_suspended,
    createdAt: s.created_at,
    memberCount: memberCounts.get(s.id) ?? 0,
    bookingsCount: bookingCounts.get(s.id) ?? 0,
    revenueDop: revenueByStudio.get(s.id) ?? 0,
  }))

  if (opts?.planSlug) {
    return enriched.filter((s) => s.planSlug === opts.planSlug)
  }
  return enriched
}

/**
 * Detalle completo de un studio para la vista de admin.
 */
export async function getPlatformStudioDetail(
  studioId: string,
): Promise<PlatformStudioDetail | null> {
  const supabase = createSupabaseServiceClient()

  const { data: studio, error } = await supabase
    .from('studios')
    .select(
      'id, name, slug, email, phone, primary_color, currency, timezone, created_at, is_suspended, plan_id, plans(id, slug, name, price_monthly_dop, price_yearly_dop)',
    )
    .eq('id', studioId)
    .maybeSingle()

  if (error) throw error
  if (!studio) return null

  const s = studio as any

  const [
    { data: ownerMember },
    { data: overrides },
    { count: membersCount },
    { count: bookingsCount },
    { count: clientsCount },
    { data: paymentsRaw },
  ] = await Promise.all([
    supabase
      .from('studio_members')
      .select('user_id, role')
      .eq('studio_id', studioId)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('studio_feature_overrides')
      .select('id, feature_key, is_enabled, limit_value, reason, expires_at, created_at')
      .eq('studio_id', studioId)
      .order('created_at', { ascending: false }),
    supabase
      .from('studio_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('studio_id', studioId),
    supabase
      .from('booking_requests')
      .select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId),
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId),
    supabase
      .from('payments')
      .select('amount')
      .eq('studio_id', studioId)
      .eq('status', 'completed'),
  ])

  let owner: PlatformStudioDetail['owner'] = null
  if (ownerMember) {
    const { data: user } = await supabase.auth.admin.getUserById(ownerMember.user_id)
    owner = {
      userId: ownerMember.user_id,
      email: user.user?.email ?? null,
      name:
        (user.user?.user_metadata?.full_name as string | undefined) ??
        (user.user?.user_metadata?.name as string | undefined) ??
        null,
      role: ownerMember.role,
    }
  }

  const revenueDop = (paymentsRaw ?? []).reduce(
    (sum: number, p: { amount?: number | string | null }) =>
      sum + Number(p.amount ?? 0),
    0,
  )

  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    email: s.email,
    phone: s.phone,
    primaryColor: s.primary_color ?? '#7c3aed',
    currency: s.currency ?? 'DOP',
    timezone: s.timezone ?? 'America/Santo_Domingo',
    createdAt: s.created_at,
    isSuspended: !!s.is_suspended,
    plan: s.plans
      ? {
          id: s.plans.id,
          slug: s.plans.slug,
          name: s.plans.name,
          priceMonthlyDop: s.plans.price_monthly_dop,
          priceYearlyDop: s.plans.price_yearly_dop,
        }
      : null,
    owner,
    stats: {
      members: membersCount ?? 0,
      bookings: bookingsCount ?? 0,
      clients: clientsCount ?? 0,
      revenueDop,
    },
    overrides: (overrides ?? []).map((o: any) => ({
      id: o.id,
      featureKey: o.feature_key,
      isEnabled: o.is_enabled,
      limitValue: o.limit_value,
      reason: o.reason,
      expiresAt: o.expires_at,
      createdAt: o.created_at,
    })),
  }
}

/**
 * Lista de planes con contador de estudios y features asociadas.
 */
export async function listPlatformPlans(): Promise<PlatformPlan[]> {
  const supabase = createSupabaseServiceClient()

  const [{ data: plans }, { data: features }, { data: studios }] = await Promise.all([
    supabase
      .from('plans')
      .select(
        'id, slug, name, description, price_monthly_dop, price_yearly_dop, price_monthly_usd, price_yearly_usd, trial_days, is_public, is_active, sort_order',
      )
      .order('sort_order', { ascending: true }),
    supabase
      .from('plan_features')
      .select('plan_id, feature_key, is_enabled, limit_value, metadata'),
    supabase.from('studios').select('plan_id'),
  ])

  const studiosByPlan = new Map<string, number>()
  for (const s of studios ?? []) {
    if (s.plan_id) studiosByPlan.set(s.plan_id, (studiosByPlan.get(s.plan_id) ?? 0) + 1)
  }

  const featuresByPlan = new Map<string, PlatformPlanFeature[]>()
  for (const f of features ?? []) {
    const arr = featuresByPlan.get(f.plan_id) ?? []
    arr.push({
      featureKey: f.feature_key,
      isEnabled: f.is_enabled,
      limitValue: f.limit_value,
      metadata: f.metadata as Record<string, unknown> | null,
    })
    featuresByPlan.set(f.plan_id, arr)
  }

  return (plans ?? []).map((p: any) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    priceMonthlyDop: p.price_monthly_dop,
    priceYearlyDop: p.price_yearly_dop,
    priceMonthlyUsd: p.price_monthly_usd,
    priceYearlyUsd: p.price_yearly_usd,
    trialDays: p.trial_days,
    isPublic: p.is_public,
    isActive: p.is_active,
    sortOrder: p.sort_order,
    studiosCount: studiosByPlan.get(p.id) ?? 0,
    features: featuresByPlan.get(p.id) ?? [],
  }))
}

/**
 * Cambia el plan de un studio. `planSlug = null` remueve el plan.
 */
export async function setStudioPlan(
  studioId: string,
  planSlug: string | null,
): Promise<void> {
  const supabase = createSupabaseServiceClient()

  let planId: string | null = null
  if (planSlug) {
    const { data: plan, error } = await supabase
      .from('plans')
      .select('id')
      .eq('slug', planSlug)
      .maybeSingle()
    if (error) throw error
    if (!plan) throw new Error(`Plan "${planSlug}" no existe`)
    planId = plan.id
  }

  const { error } = await supabase
    .from('studios')
    .update({ plan_id: planId })
    .eq('id', studioId)

  if (error) throw error
}

/**
 * Suspende o reactiva un studio.
 */
export async function setStudioSuspended(
  studioId: string,
  suspended: boolean,
  reason?: string | null,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const payload: Record<string, unknown> = { is_suspended: suspended }
  if (suspended) {
    payload.suspended_at = new Date().toISOString()
    payload.suspended_reason = reason ?? null
  } else {
    payload.suspended_at = null
    payload.suspended_reason = null
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase.from('studios').update(payload as any).eq('id', studioId)
  if (error) throw error
}

/**
 * Otorga un override de feature al studio (ej. activar AI aunque el plan no lo incluya).
 */
export async function grantStudioFeatureOverride(params: {
  studioId: string
  featureKey: string
  isEnabled: boolean
  limitValue?: number | null
  reason?: string | null
  expiresAt?: string | null
  grantedBy: string
}): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase.from('studio_feature_overrides').insert({
    studio_id: params.studioId,
    feature_key: params.featureKey,
    is_enabled: params.isEnabled,
    limit_value: params.limitValue ?? null,
    reason: params.reason ?? null,
    expires_at: params.expiresAt ?? null,
    granted_by: params.grantedBy,
  })
  if (error) throw error
}

export async function removeStudioFeatureOverride(overrideId: string): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('studio_feature_overrides')
    .delete()
    .eq('id', overrideId)
  if (error) throw error
}
