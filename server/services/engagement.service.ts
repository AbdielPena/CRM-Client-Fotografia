import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { resolveTemplate, TEMPLATE_CATALOG } from "@/server/services/email-template.service"
import { enqueueEmail } from "@/server/services/email.service"

/**
 * Client Engagement Hub — motor de automatizaciones por FECHA + secuencias.
 * Fase 1: triggers por cumpleaños/inactividad/evento → flujos lineales de email.
 * Reusa plantillas (resolveTemplate) y cola (enqueueEmail) existentes.
 */

export type TriggerType =
  | "date_birthday"
  | "date_project_completed"
  | "date_final_delivery"
  | "date_inactivity"
  | "event_immediate"
  | "manual"

export type BlockType =
  | "wait"
  | "send_email"
  | "send_whatsapp"
  | "create_task"
  | "add_tag"
  | "condition"
  | "ai_generate"
  | "request_feedback"
  | "request_review"
  | "notify"
  | "recommend"

export interface StepInput {
  block_type: BlockType
  config: Record<string, unknown>
}

export interface CreateAutomationInput {
  name: string
  description?: string | null
  triggerType: TriggerType
  triggerConfig: Record<string, unknown>
  steps: StepInput[]
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createEngagementAutomation(
  studioId: string,
  userId: string | null,
  input: CreateAutomationInput,
): Promise<{ id: string }> {
  const sb = untypedService()
  const { data: autoRow, error } = await sb
    .from("engagement_automations")
    .insert({
      studio_id: studioId,
      name: input.name.trim(),
      description: input.description ?? null,
      trigger_type: input.triggerType,
      trigger_config: input.triggerConfig ?? {},
      created_by: userId,
    })
    .select("id")
    .single()
  if (error) throw error
  const automationId = (autoRow as { id: string }).id

  // Inserta pasos en orden y los encadena (lineal).
  const stepIds: string[] = []
  for (let i = 0; i < input.steps.length; i++) {
    const s = input.steps[i]
    const { data: stepRow, error: se } = await sb
      .from("engagement_steps")
      .insert({
        studio_id: studioId,
        automation_id: automationId,
        step_order: i,
        block_type: s.block_type,
        config: s.config ?? {},
      })
      .select("id")
      .single()
    if (se) throw se
    stepIds.push((stepRow as { id: string }).id)
  }
  // Encadena next_step_id.
  for (let i = 0; i < stepIds.length - 1; i++) {
    await sb.from("engagement_steps").update({ next_step_id: stepIds[i + 1] }).eq("id", stepIds[i])
  }
  return { id: automationId }
}

export async function listEngagementAutomations(studioId: string): Promise<
  Array<{
    id: string
    name: string
    description: string | null
    trigger_type: string
    trigger_config: Record<string, unknown>
    is_active: boolean
    total_enrolled: number
    steps: number
    created_at: string
  }>
> {
  const sb = untypedService()
  const { data } = await sb
    .from("engagement_automations")
    .select("id, name, description, trigger_type, trigger_config, is_active, total_enrolled, created_at")
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
  const rows = (data ?? []) as Array<Record<string, unknown>>
  // contar pasos
  const ids = rows.map((r) => r["id"] as string)
  const counts: Record<string, number> = {}
  if (ids.length) {
    const { data: steps } = await sb
      .from("engagement_steps")
      .select("automation_id")
      .in("automation_id", ids)
    for (const s of (steps ?? []) as Array<{ automation_id: string }>) {
      counts[s.automation_id] = (counts[s.automation_id] ?? 0) + 1
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    trigger_type: r.trigger_type,
    trigger_config: r.trigger_config ?? {},
    is_active: r.is_active,
    total_enrolled: r.total_enrolled ?? 0,
    steps: counts[r.id] ?? 0,
    created_at: r.created_at,
  }))
}

export async function toggleEngagementAutomation(
  studioId: string,
  id: string,
  active: boolean,
): Promise<void> {
  const sb = untypedService()
  await sb
    .from("engagement_automations")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("studio_id", studioId)
}

export async function deleteEngagementAutomation(studioId: string, id: string): Promise<void> {
  const sb = untypedService()
  await sb
    .from("engagement_automations")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", id)
    .eq("studio_id", studioId)
}

// ---------------------------------------------------------------------------
// Inscripción
// ---------------------------------------------------------------------------

async function firstStepId(automationId: string): Promise<string | null> {
  const sb = untypedService()
  const { data } = await sb
    .from("engagement_steps")
    .select("id")
    .eq("automation_id", automationId)
    .order("step_order", { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

/** Inscribe un cliente (idempotente por ciclo). Devuelve true si creó una nueva. */
export async function enrollClient(
  studioId: string,
  automationId: string,
  clientId: string,
  cycle: string,
  context: Record<string, unknown> = {},
): Promise<boolean> {
  const sb = untypedService()
  const stepId = await firstStepId(automationId)
  if (!stepId) return false
  const { error } = await sb.from("engagement_enrollments").insert({
    studio_id: studioId,
    automation_id: automationId,
    client_id: clientId,
    current_step_id: stepId,
    status: "active",
    context: { ...context, cycle },
  })
  if (error) {
    // 23505 = ya inscrito en este ciclo (anti-spam) → no es error.
    if ((error as { code?: string }).code === "23505") return false
    throw error
  }
  // Incrementa el contador de inscritos (best-effort).
  try {
    const { data: cur } = await sb
      .from("engagement_automations")
      .select("total_enrolled")
      .eq("id", automationId)
      .maybeSingle()
    const next = ((cur as { total_enrolled?: number } | null)?.total_enrolled ?? 0) + 1
    await sb.from("engagement_automations").update({ total_enrolled: next }).eq("id", automationId)
  } catch {
    /* no crítico */
  }
  return true
}

/** Engancha triggers por EVENTO (project_completed / final_delivery) desde sus hooks. */
export async function enrollByEvent(
  studioId: string,
  triggerType: Extract<TriggerType, "date_project_completed" | "date_final_delivery" | "event_immediate">,
  clientId: string,
  eventKey: string,
): Promise<void> {
  const sb = untypedService()
  const { data } = await sb
    .from("engagement_automations")
    .select("id")
    .eq("studio_id", studioId)
    .eq("trigger_type", triggerType)
    .eq("is_active", true)
    .is("deleted_at", null)
  for (const a of (data ?? []) as Array<{ id: string }>) {
    try {
      await enrollClient(studioId, a.id, clientId, eventKey)
    } catch (e) {
      console.error("[engagement] enrollByEvent failed", a.id, e)
    }
  }
}

/** Atajo: inscribe al cliente de una galería en automatizaciones de entrega final. */
export async function enrollByFinalDelivery(studioId: string, galleryId: string): Promise<void> {
  const sb = untypedService()
  const { data } = await sb.from("galleries").select("client_id").eq("id", galleryId).maybeSingle()
  const clientId = (data as { client_id?: string } | null)?.client_id
  if (clientId) await enrollByEvent(studioId, "date_final_delivery", clientId, `gallery:${galleryId}`)
}

// ---------------------------------------------------------------------------
// Scanner por fecha (cron)
// ---------------------------------------------------------------------------

function birthdayMonthDay(s: string | null): { m: number; d: number } | null {
  if (!s) return null
  const t = s.trim()
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/) // YYYY-MM-DD
  if (m) return { m: +m[2], d: +m[3] }
  m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/) // DD-MM-YYYY (LatAm)
  if (m) return { m: +m[2], d: +m[1] }
  m = t.match(/^(\d{1,2})[-/](\d{1,2})$/) // MM-DD o DD-MM
  if (m) {
    const a = +m[1]
    const b = +m[2]
    if (a > 12) return { m: b, d: a }
    return { m: a, d: b }
  }
  const dt = new Date(t)
  if (!isNaN(dt.getTime())) return { m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
  return null
}

/**
 * Escanea automatizaciones de fecha activas y crea inscripciones para los
 * clientes elegibles HOY. Devuelve cuántas inscripciones creó.
 */
export async function scanEngagementDateTriggers(): Promise<{ enrolled: number }> {
  const sb = untypedService()
  const { data: autos } = await sb
    .from("engagement_automations")
    .select("id, studio_id, trigger_type, trigger_config")
    .in("trigger_type", ["date_birthday", "date_inactivity"])
    .eq("is_active", true)
    .is("deleted_at", null)

  let enrolled = 0
  const now = new Date()
  const year = String(now.getUTCFullYear())

  for (const a of (autos ?? []) as Array<{
    id: string
    studio_id: string
    trigger_type: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trigger_config: any
  }>) {
    if (a.trigger_type === "date_birthday") {
      const offset = Number(a.trigger_config?.offset_days ?? 0)
      const dir = (a.trigger_config?.offset_dir as string) ?? "before"
      const target = new Date(now)
      if (dir === "before") target.setUTCDate(target.getUTCDate() + offset)
      else if (dir === "after") target.setUTCDate(target.getUTCDate() - offset)
      const tm = target.getUTCMonth() + 1
      const td = target.getUTCDate()

      const { data: clients } = await sb
        .from("clients")
        .select("id, birthday")
        .eq("studio_id", a.studio_id)
        .is("deleted_at", null)
        .not("birthday", "is", null)
      for (const c of (clients ?? []) as Array<{ id: string; birthday: string | null }>) {
        const md = birthdayMonthDay(c.birthday)
        if (md && md.m === tm && md.d === td) {
          // cycle = año + offset para distinguir "7 días antes" de "el día".
          const cycle = `${year}:${dir}:${offset}`
          if (await enrollClient(a.studio_id, a.id, c.id, cycle, { kind: "birthday" })) enrolled++
        }
      }
    } else if (a.trigger_type === "date_inactivity") {
      const months = Number(a.trigger_config?.inactivity_months ?? 6)
      const cutoff = new Date(now)
      cutoff.setUTCMonth(cutoff.getUTCMonth() - months)

      // Última actividad = max(projects.created_at) por cliente; si no tiene
      // proyectos, clients.created_at.
      const { data: clients } = await sb
        .from("clients")
        .select("id, created_at")
        .eq("studio_id", a.studio_id)
        .is("deleted_at", null)
      const clientList = (clients ?? []) as Array<{ id: string; created_at: string }>
      const ids = clientList.map((c) => c.id)
      const lastByClient: Record<string, string> = {}
      if (ids.length) {
        const { data: projs } = await sb
          .from("projects")
          .select("client_id, created_at")
          .in("client_id", ids)
          .is("deleted_at", null)
        for (const p of (projs ?? []) as Array<{ client_id: string; created_at: string }>) {
          if (!p.client_id) continue
          if (!lastByClient[p.client_id] || p.created_at > lastByClient[p.client_id])
            lastByClient[p.client_id] = p.created_at
        }
      }
      for (const c of clientList) {
        const last = lastByClient[c.id] ?? c.created_at
        if (new Date(last).getTime() <= cutoff.getTime()) {
          const cycle = `inact:${months}`
          if (await enrollClient(a.studio_id, a.id, c.id, cycle, { kind: "inactivity", months })) enrolled++
        }
      }
    }
  }
  return { enrolled }
}

// ---------------------------------------------------------------------------
// Ejecución de pasos (cron)
// ---------------------------------------------------------------------------

interface EnrollmentRow {
  id: string
  studio_id: string
  automation_id: string
  client_id: string
  current_step_id: string | null
  status: string
  wait_until: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any
}

interface StepRow {
  id: string
  block_type: BlockType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any
  next_step_id: string | null
}

async function clientVars(
  studioId: string,
  clientId: string,
): Promise<{ email: string | null; name: string; vars: Record<string, string> }> {
  const sb = untypedService()
  const { data: c } = await sb.from("clients").select("name, email, birthday").eq("id", clientId).maybeSingle()
  const client = c as { name?: string; email?: string; birthday?: string } | null
  const { data: s } = await sb.from("studios").select("name").eq("id", studioId).maybeSingle()
  const studioName = (s as { name?: string } | null)?.name ?? "Tu fotógrafo"
  return {
    email: client?.email ?? null,
    name: client?.name ?? "",
    vars: {
      client_name: client?.name ?? "",
      birthday: client?.birthday ?? "",
      studio_name: studioName,
    },
  }
}

async function logRun(
  studioId: string,
  enrollmentId: string,
  stepId: string | null,
  blockType: string,
  status: "done" | "failed" | "skipped",
  result?: Record<string, unknown>,
  error?: string,
): Promise<void> {
  const sb = untypedService()
  await sb.from("engagement_step_runs").insert({
    studio_id: studioId,
    enrollment_id: enrollmentId,
    step_id: stepId,
    block_type: blockType,
    status,
    result: result ?? null,
    error: error ?? null,
  })
}

/** Avanza inscripciones listas. Devuelve cuántos pasos ejecutó. */
export async function advanceEngagementEnrollments(limit = 50): Promise<{ steps: number }> {
  const sb = untypedService()
  const nowIso = new Date().toISOString()
  const { data } = await sb
    .from("engagement_enrollments")
    .select("id, studio_id, automation_id, client_id, current_step_id, status, wait_until, context")
    .in("status", ["active", "waiting"])
    .or(`wait_until.is.null,wait_until.lte.${nowIso}`)
    .limit(limit)

  const enrollments = (data ?? []) as EnrollmentRow[]
  let stepsRun = 0

  for (const e of enrollments) {
    let currentStepId = e.current_step_id
    let guard = 0
    // Despierta si estaba esperando.
    let status = "active"
    while (status === "active" && guard < 20) {
      guard++
      if (!currentStepId) {
        await sb
          .from("engagement_enrollments")
          .update({ status: "completed", completed_at: new Date().toISOString(), current_step_id: null })
          .eq("id", e.id)
        break
      }
      const { data: stepRaw } = await sb
        .from("engagement_steps")
        .select("id, block_type, config, next_step_id")
        .eq("id", currentStepId)
        .maybeSingle()
      const step = stepRaw as StepRow | null
      if (!step) {
        await sb
          .from("engagement_enrollments")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", e.id)
        break
      }

      if (step.block_type === "wait") {
        const days = Number(step.config?.wait_days ?? 0)
        const hours = Number(step.config?.wait_hours ?? 0)
        const until = new Date(Date.now() + days * 86400000 + hours * 3600000)
        await sb
          .from("engagement_enrollments")
          .update({ status: "waiting", wait_until: until.toISOString(), current_step_id: step.next_step_id })
          .eq("id", e.id)
        await logRun(e.studio_id, e.id, step.id, "wait", "done", { until: until.toISOString() })
        stepsRun++
        status = "waiting"
        break
      }

      if (step.block_type === "send_email") {
        try {
          const cv = await clientVars(e.studio_id, e.client_id)
          if (!cv.email) {
            await logRun(e.studio_id, e.id, step.id, "send_email", "skipped", undefined, "cliente sin email")
          } else {
            const extraVars = (step.config?.vars as Record<string, string>) ?? {}
            const vars = { ...cv.vars, ...extraVars }
            const slug = (step.config?.template_slug as string) ?? "engagement_generic"
            // Usa el default del CATÁLOGO para el slug (la plantilla bonita), y
            // permite overrides inline del paso. resolveTemplate aún prioriza la
            // versión editada por el estudio si existe.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cat = (TEMPLATE_CATALOG as any)[slug] as
              | { defaultSubject: string; defaultBodyHtml: string }
              | undefined
            const defSubject =
              (step.config?.subject as string) ?? cat?.defaultSubject ?? "Un mensaje de {{studio_name}}"
            const defBody =
              (step.config?.bodyHtml as string) ??
              cat?.defaultBodyHtml ??
              `<p>Hola {{client_name}},</p><p>${(step.config?.message as string) ?? "Queríamos saludarte."}</p><p>— {{studio_name}}</p>`
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tpl = await resolveTemplate(e.studio_id, slug as any, vars, {
              subject: defSubject,
              bodyHtml: defBody,
            })
            await enqueueEmail({
              studioId: e.studio_id,
              toEmail: cv.email,
              toName: cv.name,
              subject: tpl.subject,
              bodyHtml: tpl.bodyHtml,
              fromName: tpl.fromName ?? cv.vars.studio_name,
              relatedEntityType: "client",
              relatedEntityId: e.client_id,
            })
            await logRun(e.studio_id, e.id, step.id, "send_email", "done", { to: cv.email })
          }
        } catch (err) {
          await logRun(e.studio_id, e.id, step.id, "send_email", "failed", undefined, err instanceof Error ? err.message : String(err))
        }
        stepsRun++
        currentStepId = step.next_step_id
        await sb.from("engagement_enrollments").update({ current_step_id: currentStepId }).eq("id", e.id)
        continue
      }

      // Bloques de fases posteriores (whatsapp/ia/tarea/etiqueta/condición/feedback):
      // se registran como 'skipped' en Fase 1 y se avanza.
      await logRun(e.studio_id, e.id, step.id, step.block_type, "skipped", undefined, "bloque no soportado en Fase 1")
      stepsRun++
      currentStepId = step.next_step_id
      await sb.from("engagement_enrollments").update({ current_step_id: currentStepId }).eq("id", e.id)
    }
  }
  return { steps: stepsRun }
}

/** Corre el ciclo completo (scan + advance). Llamado por el cron endpoint. */
export async function runEngagementCron(): Promise<{ enrolled: number; steps: number }> {
  const scan = await scanEngagementDateTriggers()
  const adv = await advanceEngagementEnrollments(100)
  return { enrolled: scan.enrolled, steps: adv.steps }
}
