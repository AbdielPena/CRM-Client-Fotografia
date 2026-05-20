import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"

/**
 * Service de onboarding del studio nuevo. Wizard step-by-step.
 *
 * Patrón:
 *   - ensureOnboardingSteps(studioId): RPC siembra 10 steps si no existen
 *   - getOnboardingSteps: lista para UI
 *   - markStepCompleted(stepKey): cuando el user hace la acción
 *   - skipStep(stepKey): si no aplica
 *   - completionPercentage: para progress bar global
 */

export type OnboardingStep = {
  id: string
  studio_id: string
  step_key: string
  title: string
  description: string | null
  is_completed: boolean
  is_skipped: boolean
  completed_at: string | null
  skipped_at: string | null
  sort_order: number
  category: string
  action_url: string | null
  action_label: string | null
  created_at: string
  updated_at: string
}

export async function ensureOnboardingSteps(studioId: string): Promise<void> {
  const sb = untypedService()
  await sb.rpc("studio_seed_onboarding", { p_studio_id: studioId })
}

export async function getOnboardingSteps(
  studioId: string,
): Promise<OnboardingStep[]> {
  // Asegura que existan
  await ensureOnboardingSteps(studioId)

  const sb = untypedServer()
  const { data, error } = await sb
    .from("studio_onboarding_steps")
    .select("*")
    .eq("studio_id", studioId)
    .order("sort_order", { ascending: true })

  if (error)
    throwServiceError("ONBOARDING_LIST_FAILED", error, { studioId })

  return (data ?? []) as OnboardingStep[]
}

export async function markStepCompleted(
  studioId: string,
  actorId: string,
  stepKey: string,
): Promise<void> {
  const sb = untypedService()
  const { error } = await sb
    .from("studio_onboarding_steps")
    .update({
      is_completed: true,
      completed_at: new Date().toISOString(),
    })
    .eq("studio_id", studioId)
    .eq("step_key", stepKey)

  if (error)
    throwServiceError("ONBOARDING_MARK_FAILED", error, {
      studioId,
      stepKey,
    })

  await logActivity({
    studioId,
    actorId,
    entityType: "onboarding_step",
    entityId: stepKey,
    action: "onboarding_step.completed",
    metadata: { step_key: stepKey },
  })
}

export async function skipStep(
  studioId: string,
  actorId: string,
  stepKey: string,
): Promise<void> {
  const sb = untypedService()
  const { error } = await sb
    .from("studio_onboarding_steps")
    .update({
      is_skipped: true,
      skipped_at: new Date().toISOString(),
    })
    .eq("studio_id", studioId)
    .eq("step_key", stepKey)

  if (error)
    throwServiceError("ONBOARDING_SKIP_FAILED", error, {
      studioId,
      stepKey,
    })

  await logActivity({
    studioId,
    actorId,
    entityType: "onboarding_step",
    entityId: stepKey,
    action: "onboarding_step.skipped",
  })
}

/**
 * Auto-detecta steps completados basándose en data real del studio.
 * Útil al cargar el wizard — si ya hay clientes, marca first_client done.
 *
 * Llamar en getOnboardingSteps para que se refresque automáticamente.
 */
export async function autoDetectCompletedSteps(
  studioId: string,
): Promise<{ updated: number }> {
  const sb = untypedService()

  // Check qué condiciones se cumplen
  const checks = await Promise.all([
    // first_client: hay al menos 1 cliente
    sb
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .is("deleted_at", null)
      .limit(1)
      .then((r: { count: number | null }) => ({ key: "first_client", count: r.count ?? 0 })),
    // first_project: hay al menos 1 proyecto
    sb
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .is("deleted_at", null)
      .limit(1)
      .then((r: { count: number | null }) => ({ key: "first_project", count: r.count ?? 0 })),
    // first_package: hay packages
    sb
      .from("packages")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .is("deleted_at", null)
      .limit(1)
      .then((r: { count: number | null }) => ({ key: "first_package", count: r.count ?? 0 })),
    // contract_template
    sb
      .from("contract_templates")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .is("deleted_at", null)
      .limit(1)
      .then((r: { count: number | null }) => ({ key: "contract_template", count: r.count ?? 0 }))
      .catch(() => ({ key: "contract_template", count: 0 })),
    // mail_account
    sb
      .from("mail_accounts")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .is("deleted_at", null)
      .limit(1)
      .then((r: { count: number | null }) => ({ key: "mail_account", count: r.count ?? 0 }))
      .catch(() => ({ key: "mail_account", count: 0 })),
    // automation
    sb
      .from("automation_rules")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .is("deleted_at", null)
      .limit(1)
      .then((r: { count: number | null }) => ({ key: "automation", count: r.count ?? 0 }))
      .catch(() => ({ key: "automation", count: 0 })),
    // fiscal: tax_config existe
    sb
      .from("fiscal_tax_configs")
      .select("studio_id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .limit(1)
      .then((r: { count: number | null }) => ({ key: "fiscal_config", count: r.count ?? 0 }))
      .catch(() => ({ key: "fiscal_config", count: 0 })),
    // google: integration enabled
    sb
      .from("studio_integrations")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .eq("service", "google_calendar")
      .eq("is_enabled", true)
      .limit(1)
      .then((r: { count: number | null }) => ({ key: "google_calendar", count: r.count ?? 0 }))
      .catch(() => ({ key: "google_calendar", count: 0 })),
    // invite_team: more than 1 member
    sb
      .from("studio_members")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .then((r: { count: number | null }) => ({ key: "invite_team", count: (r.count ?? 0) > 1 ? 1 : 0 })),
    // studio_info: branding completo (logo o color custom)
    sb
      .from("studio_branding")
      .select("logo_url, primary_color")
      .eq("studio_id", studioId)
      .maybeSingle()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((r: any) => {
        const data = r.data as { logo_url: string | null; primary_color: string } | null
        const hasInfo = !!(data?.logo_url || (data?.primary_color && data.primary_color !== "#7C3AED"))
        return { key: "studio_info", count: hasInfo ? 1 : 0 }
      })
      .catch(() => ({ key: "studio_info", count: 0 })),
  ])

  // Marcar como completed los que tengan count > 0 y aún no estén marcados
  const completedKeys = checks.filter((c) => c.count > 0).map((c) => c.key)
  if (completedKeys.length === 0) return { updated: 0 }

  const { error: updateErr, count } = await sb
    .from("studio_onboarding_steps")
    .update({
      is_completed: true,
      completed_at: new Date().toISOString(),
    })
    .eq("studio_id", studioId)
    .eq("is_completed", false)
    .eq("is_skipped", false)
    .in("step_key", completedKeys)

  if (updateErr) return { updated: 0 }
  return { updated: count ?? 0 }
}

export function calculateProgress(steps: OnboardingStep[]): {
  total: number
  completed: number
  skipped: number
  percentage: number
  isComplete: boolean
} {
  const total = steps.length
  const completed = steps.filter((s) => s.is_completed).length
  const skipped = steps.filter((s) => s.is_skipped).length
  const done = completed + skipped
  const percentage = total > 0 ? Math.round((done / total) * 100) : 0
  return {
    total,
    completed,
    skipped,
    percentage,
    isComplete: done >= total,
  }
}
