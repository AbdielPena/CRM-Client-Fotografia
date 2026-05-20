import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"

/**
 * Service de automatizaciones (workflows) del monolito.
 *
 * Flujo:
 *   1. CRUD de automation_rules vía UI /automations
 *   2. Eventos del sistema (CRM/Finance/Inventory/Mail) llaman a
 *      `dispatchAutomationEvent(event, entity, studioId)` después de
 *      su operación principal
 *   3. El dispatcher busca rules activas con trigger_event matching,
 *      aplica trigger_filters JSONB, y ejecuta cada action via
 *      executeAction() que dispatch por action_kind
 *   4. Cada ejecución se guarda en automation_runs con status final
 *
 * Las actions complejas (send_email, create_task) llaman a otros services
 * del monolito. Errores en una rule no bloquean las otras (Promise.allSettled).
 */

export type AutomationTriggerEvent =
  | "client.created"
  | "project.created"
  | "project.status_changed"
  | "invoice.sent"
  | "invoice.paid"
  | "booking.received"
  | "inv_loan.created"
  | "inv_loan.returned"
  | "inv_rental.completed"
  | "gallery.published"
  | "contract.signed"

export type AutomationActionKind =
  | "send_email"
  | "create_task"
  | "send_notification"
  | "update_project_status"
  | "add_tag"

export type AutomationRule = {
  id: string
  studio_id: string
  name: string
  description: string | null
  trigger_event: AutomationTriggerEvent
  trigger_filters: Record<string, unknown>
  action_kind: AutomationActionKind
  action_config: Record<string, unknown>
  is_active: boolean
  last_run_at: string | null
  total_runs: number
  success_runs: number
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// ============================================================================
// CRUD
// ============================================================================

export async function getAutomationRules(
  studioId: string,
  opts: { activeOnly?: boolean } = {},
) {
  const sb = untypedServer()
  let query = sb
    .from("automation_rules")
    .select("*")
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (opts.activeOnly) query = query.eq("is_active", true)

  const { data, error } = await query
  if (error) throwServiceError("AUTOMATION_LIST_FAILED", error, { studioId })
  return (data ?? []) as AutomationRule[]
}

export async function getAutomationRuleById(
  studioId: string,
  ruleId: string,
) {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("automation_rules")
    .select("*")
    .eq("id", ruleId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()

  if (error)
    throwServiceError("AUTOMATION_GET_FAILED", error, { studioId, ruleId })
  if (!data) return null

  // Últimos 20 runs
  const { data: runs } = await sb
    .from("automation_runs")
    .select("id, status, started_at, finished_at, duration_ms, result, error_message, entity_type, entity_id")
    .eq("rule_id", ruleId)
    .eq("studio_id", studioId)
    .order("started_at", { ascending: false })
    .limit(20)

  return {
    ...(data as AutomationRule),
    runs: (runs ?? []) as Array<{
      id: string
      status: string
      started_at: string
      finished_at: string | null
      duration_ms: number | null
      result: unknown
      error_message: string | null
      entity_type: string | null
      entity_id: string | null
    }>,
  }
}

export async function createAutomationRule(
  studioId: string,
  actorId: string,
  data: {
    name: string
    description?: string
    triggerEvent: AutomationTriggerEvent
    triggerFilters?: Record<string, unknown>
    actionKind: AutomationActionKind
    actionConfig: Record<string, unknown>
    isActive?: boolean
  },
) {
  const sb = untypedService()

  if (!data.name.trim()) throw new Error("AUTOMATION_NAME_REQUIRED")

  const { data: row, error } = await sb
    .from("automation_rules")
    .insert({
      studio_id: studioId,
      name: data.name.trim(),
      description: data.description ?? null,
      trigger_event: data.triggerEvent,
      trigger_filters: data.triggerFilters ?? {},
      action_kind: data.actionKind,
      action_config: data.actionConfig,
      is_active: data.isActive ?? true,
      created_by: actorId,
    })
    .select("*")
    .single()

  if (error)
    throwServiceError("AUTOMATION_CREATE_FAILED", error, { studioId })

  const rule = row as AutomationRule
  await logActivity({
    studioId,
    actorId,
    entityType: "automation_rule",
    entityId: rule.id,
    action: "automation_rule.created",
    metadata: {
      name: rule.name,
      trigger_event: rule.trigger_event,
      action_kind: rule.action_kind,
    },
  })

  return rule
}

export async function updateAutomationRule(
  studioId: string,
  actorId: string,
  ruleId: string,
  data: Partial<{
    name: string
    description: string
    triggerEvent: AutomationTriggerEvent
    triggerFilters: Record<string, unknown>
    actionKind: AutomationActionKind
    actionConfig: Record<string, unknown>
    isActive: boolean
  }>,
) {
  const sb = untypedService()

  const patch: Record<string, unknown> = {}
  if (data.name !== undefined) patch.name = data.name
  if (data.description !== undefined) patch.description = data.description
  if (data.triggerEvent !== undefined) patch.trigger_event = data.triggerEvent
  if (data.triggerFilters !== undefined)
    patch.trigger_filters = data.triggerFilters
  if (data.actionKind !== undefined) patch.action_kind = data.actionKind
  if (data.actionConfig !== undefined) patch.action_config = data.actionConfig
  if (data.isActive !== undefined) patch.is_active = data.isActive

  const { error } = await sb
    .from("automation_rules")
    .update(patch)
    .eq("id", ruleId)
    .eq("studio_id", studioId)

  if (error)
    throwServiceError("AUTOMATION_UPDATE_FAILED", error, { studioId, ruleId })

  await logActivity({
    studioId,
    actorId,
    entityType: "automation_rule",
    entityId: ruleId,
    action: "automation_rule.updated",
    metadata: data as Record<string, unknown>,
  })
}

export async function deleteAutomationRule(
  studioId: string,
  actorId: string,
  ruleId: string,
) {
  const sb = untypedService()
  const { error } = await sb
    .from("automation_rules")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", ruleId)
    .eq("studio_id", studioId)

  if (error)
    throwServiceError("AUTOMATION_DELETE_FAILED", error, { studioId, ruleId })

  await logActivity({
    studioId,
    actorId,
    entityType: "automation_rule",
    entityId: ruleId,
    action: "automation_rule.deleted",
  })
}

// ============================================================================
// Dispatcher
// ============================================================================

/**
 * Match trigger_filters JSONB against the entity payload.
 * Soporta igualdad estricta para cualquier key del JSONB.
 *
 * Si trigger_filters es vacío ({}) → siempre matchea.
 */
function filtersMatch(
  filters: Record<string, unknown>,
  payload: Record<string, unknown>,
): boolean {
  if (!filters || Object.keys(filters).length === 0) return true
  for (const [k, expected] of Object.entries(filters)) {
    const actual = payload[k]
    if (actual === undefined) return false
    if (Array.isArray(expected)) {
      if (!(expected as unknown[]).includes(actual)) return false
    } else if (actual !== expected) {
      return false
    }
  }
  return true
}

/**
 * Despacha un evento y ejecuta las rules que matchen.
 * Llamar después de la operación principal (no antes — no toques inputs del usuario).
 *
 * Errores en una rule NO bloquean otras: Promise.allSettled + log.
 */
export async function dispatchAutomationEvent(opts: {
  studioId: string
  event: AutomationTriggerEvent
  entityType?: string
  entityId?: string
  payload?: Record<string, unknown>
}): Promise<{ matched: number; succeeded: number; failed: number }> {
  const sb = untypedService()

  const { data: rules, error } = await sb
    .from("automation_rules")
    .select("*")
    .eq("studio_id", opts.studioId)
    .eq("trigger_event", opts.event)
    .eq("is_active", true)
    .is("deleted_at", null)

  if (error) {
    console.error("[automation] list rules failed:", error)
    return { matched: 0, succeeded: 0, failed: 0 }
  }

  const matchingRules = (rules ?? []).filter((r: AutomationRule) =>
    filtersMatch(r.trigger_filters ?? {}, opts.payload ?? {}),
  ) as AutomationRule[]

  if (matchingRules.length === 0) {
    return { matched: 0, succeeded: 0, failed: 0 }
  }

  const results = await Promise.allSettled(
    matchingRules.map((rule) => executeRule(rule, opts)),
  )

  const succeeded = results.filter((r) => r.status === "fulfilled" && (r.value as { success: boolean }).success).length
  const failed = results.length - succeeded

  return {
    matched: matchingRules.length,
    succeeded,
    failed,
  }
}

async function executeRule(
  rule: AutomationRule,
  ctx: {
    studioId: string
    event: AutomationTriggerEvent
    entityType?: string
    entityId?: string
    payload?: Record<string, unknown>
  },
): Promise<{ success: boolean; runId?: string }> {
  const sb = untypedService()

  // Crear el run en estado 'running'
  const { data: runRow, error: runErr } = await sb
    .from("automation_runs")
    .insert({
      studio_id: ctx.studioId,
      rule_id: rule.id,
      trigger_event: rule.trigger_event,
      entity_type: ctx.entityType ?? null,
      entity_id: ctx.entityId ?? null,
      status: "running",
      started_at: new Date().toISOString(),
      action_kind: rule.action_kind,
      action_config: rule.action_config,
    })
    .select("id")
    .single()

  if (runErr || !runRow) {
    console.error("[automation] insert run failed:", runErr)
    return { success: false }
  }

  const runId = (runRow as { id: string }).id
  const startedAt = Date.now()

  try {
    const result = await executeAction(rule, ctx)
    const durationMs = Date.now() - startedAt

    await sb
      .from("automation_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        result,
      })
      .eq("id", runId)

    await sb
      .from("automation_rules")
      .update({
        last_run_at: new Date().toISOString(),
        total_runs: rule.total_runs + 1,
        success_runs: rule.success_runs + 1,
      })
      .eq("id", rule.id)

    return { success: true, runId }
  } catch (err) {
    const durationMs = Date.now() - startedAt
    const errorMessage = err instanceof Error ? err.message : "Unknown"

    await sb
      .from("automation_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        error_message: errorMessage,
      })
      .eq("id", runId)

    await sb
      .from("automation_rules")
      .update({
        last_run_at: new Date().toISOString(),
        total_runs: rule.total_runs + 1,
      })
      .eq("id", rule.id)

    console.error(`[automation] rule ${rule.id} failed:`, err)
    return { success: false, runId }
  }
}

/**
 * Despacha por action_kind a la implementación concreta.
 * Cada implementación devuelve un objeto JSON con detalle del result.
 */
async function executeAction(
  rule: AutomationRule,
  ctx: {
    studioId: string
    event: AutomationTriggerEvent
    entityType?: string
    entityId?: string
    payload?: Record<string, unknown>
  },
): Promise<Record<string, unknown>> {
  const cfg = rule.action_config

  switch (rule.action_kind) {
    case "send_notification":
      return await actionSendNotification(rule, ctx, cfg)
    case "add_tag":
      return await actionAddTag(rule, ctx, cfg)
    case "send_email":
      return await actionSendEmail(rule, ctx, cfg)
    case "create_task":
      return await actionCreateTask(rule, ctx, cfg)
    case "update_project_status":
      return await actionUpdateProjectStatus(rule, ctx, cfg)
    default:
      throw new Error(`Unsupported action_kind: ${rule.action_kind}`)
  }
}

// ============================================================================
// Action implementations
// ============================================================================

async function actionSendNotification(
  rule: AutomationRule,
  ctx: { studioId: string; entityType?: string; entityId?: string; payload?: Record<string, unknown> },
  cfg: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const sb = untypedService()
  const title = String(cfg.title ?? rule.name)
  const body = String(cfg.body ?? `Automation "${rule.name}" disparada`)
  const severity = (cfg.severity as string) ?? "info"

  const { data, error } = await sb
    .from("notifications")
    .insert({
      studio_id: ctx.studioId,
      type: "automation",
      title,
      body,
      entity_type: ctx.entityType ?? null,
      entity_id: ctx.entityId ?? null,
      severity,
    })
    .select("id")
    .maybeSingle()

  if (error) throw error
  return { notification_id: (data as { id: string } | null)?.id ?? null }
}

async function actionAddTag(
  _rule: AutomationRule,
  ctx: { studioId: string; entityType?: string; entityId?: string },
  cfg: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const sb = untypedService()
  const tagName = String(cfg.tag_name ?? "auto-tagged")

  if (!ctx.entityType || !ctx.entityId) {
    throw new Error("add_tag requires entity_type + entity_id")
  }

  // Buscar/crear tag
  let tagId: string | null = null
  const { data: existing } = await sb
    .from("tags")
    .select("id")
    .eq("studio_id", ctx.studioId)
    .eq("name", tagName)
    .maybeSingle()
  if (existing) {
    tagId = (existing as { id: string }).id
  } else {
    const { data: created, error: tErr } = await sb
      .from("tags")
      .insert({
        studio_id: ctx.studioId,
        name: tagName,
        color: (cfg.tag_color as string) ?? "#6366F1",
      })
      .select("id")
      .single()
    if (tErr) throw tErr
    tagId = (created as { id: string }).id
  }

  const { error: assignErr } = await sb
    .from("tag_assignments")
    .insert({
      studio_id: ctx.studioId,
      tag_id: tagId,
      entity_type: ctx.entityType,
      entity_id: ctx.entityId,
    })

  if (assignErr && assignErr.code !== "23505") throw assignErr // ignorar duplicado

  return { tag_id: tagId, tag_name: tagName }
}

async function actionSendEmail(
  rule: AutomationRule,
  ctx: { studioId: string; entityType?: string; entityId?: string; payload?: Record<string, unknown> },
  cfg: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const templateSlug = String(cfg.template_slug ?? "")
  const toAddress = (ctx.payload?.email as string) ?? (cfg.to as string)
  if (!toAddress) throw new Error("send_email requires recipient (payload.email or config.to)")

  // V1: log only — la integración real con EmailQueue se hace en V2 del módulo Mail
  // Dejamos el hook listo pero no enviamos para no spamear sin que el user lo
  // confirme. El user puede ver el log en /automations/[id] runs.
  return {
    skipped: "send_email action is stubbed in V1 — implement via email-queue.service",
    intended_recipient: toAddress,
    template_slug: templateSlug,
    rule_id: rule.id,
  }
}

async function actionCreateTask(
  _rule: AutomationRule,
  ctx: { studioId: string; entityType?: string; entityId?: string; payload?: Record<string, unknown> },
  cfg: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const sb = untypedService()
  const title = String(cfg.title ?? "Tarea automática")
  const dueOffsetDays = Number(cfg.due_offset_days ?? 1)
  const dueDate = new Date(Date.now() + dueOffsetDays * 86400000)
    .toISOString()
    .slice(0, 10)

  const { data, error } = await sb
    .from("tasks")
    .insert({
      studio_id: ctx.studioId,
      title,
      description: String(cfg.description ?? "Creada por automatización"),
      due_date: dueDate,
      priority: String(cfg.priority ?? "medium"),
      status: "pendiente",
      // vincular al entity si aplica
      project_id: ctx.entityType === "project" ? ctx.entityId : null,
      client_id: ctx.entityType === "client" ? ctx.entityId : null,
    })
    .select("id")
    .maybeSingle()

  if (error) throw error
  return { task_id: (data as { id: string } | null)?.id ?? null, due_date: dueDate }
}

async function actionUpdateProjectStatus(
  _rule: AutomationRule,
  ctx: { studioId: string; entityType?: string; entityId?: string },
  cfg: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (ctx.entityType !== "project" || !ctx.entityId) {
    throw new Error("update_project_status only applies to project entities")
  }
  const intent = String(cfg.intent ?? "edicion")

  // Hook al service existente. Si no hay match keyword no pasa nada (silencioso).
  try {
    const { transitionProjectStatus } = await import(
      "./project-automation.service"
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await transitionProjectStatus(
      ctx.studioId,
      ctx.entityId,
      intent as Parameters<typeof transitionProjectStatus>[2],
    )
    return { project_id: ctx.entityId, intent, ...result }
  } catch {
    return {
      project_id: ctx.entityId,
      intent,
      note: "transitionProjectStatus not available — manual project-status update needed",
    }
  }
}
