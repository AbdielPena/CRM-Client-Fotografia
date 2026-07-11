import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { resolveTemplate, renderTemplate, TEMPLATE_CATALOG } from "@/server/services/email-template.service"
import { enqueueEmail } from "@/server/services/email.service"
import { draftMessage } from "@/server/services/ai/engagement-ai.service"
import { getOrCreateFeedbackToken, feedbackUrl } from "@/server/services/engagement-feedback.service"

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
): Promise<{ email: string | null; phone: string | null; name: string; vars: Record<string, string> }> {
  const sb = untypedService()
  const { data: c } = await sb.from("clients").select("name, email, birthday, phone").eq("id", clientId).maybeSingle()
  const client = c as { name?: string; email?: string; birthday?: string; phone?: string } | null
  const { data: s } = await sb.from("studios").select("name").eq("id", studioId).maybeSingle()
  const studioName = (s as { name?: string } | null)?.name ?? "Tu fotógrafo"
  return {
    email: client?.email ?? null,
    phone: client?.phone ?? null,
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

function renderVars(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => vars[k] ?? "")
}

/** Bloque: enviar email (también usado por request_feedback/request_review con slug forzado). */
async function runSendEmail(e: EnrollmentRow, step: StepRow, slugOverride?: string): Promise<void> {
  try {
    const cv = await clientVars(e.studio_id, e.client_id)
    if (!cv.email) {
      await logRun(e.studio_id, e.id, step.id, step.block_type, "skipped", undefined, "cliente sin email")
      return
    }
    const extraVars = (step.config?.vars as Record<string, string>) ?? {}
    let reviewLink = ""
    try {
      reviewLink = feedbackUrl(await getOrCreateFeedbackToken(e.studio_id, e.client_id, e.automation_id))
    } catch (err) {
      console.error("[engagement] review link", err)
    }
    const vars = { ...cv.vars, review_link: reviewLink, ...extraVars }

    // Modo IA: redacta el mensaje personalizado con Gemini (gratis) usando el
    // brief del paso + el nombre del cliente. Si la IA falla, cae a la plantilla.
    if (
      !slugOverride &&
      step.config?.ai_enabled &&
      typeof step.config?.ai_brief === "string" &&
      (step.config.ai_brief as string).trim()
    ) {
      try {
        const ai = await draftMessage(e.studio_id, {
          channel: "email",
          brief: String(step.config.ai_brief),
          clientName: cv.name,
          tone: (step.config?.ai_tone as string) ?? null,
        })
        if (!ai.error && ai.body) {
          const subject = renderTemplate(ai.subject || "Un mensaje de {{studio_name}}", vars)
          const bodyHtml = renderTemplate(ai.body, vars)
          await enqueueEmail({
            studioId: e.studio_id,
            toEmail: cv.email,
            toName: cv.name,
            subject,
            bodyHtml,
            fromName: cv.vars.studio_name,
            relatedEntityType: "client",
            relatedEntityId: e.client_id,
            // Marketing → respeta la baja + List-Unsubscribe (ver email-drain.service).
            metadata: { marketing: true },
          })
          await logRun(e.studio_id, e.id, step.id, step.block_type, "done", { to: cv.email, ai: true })
          return
        }
      } catch (err) {
        console.error("[engagement] ai draft failed, fallback a plantilla", err)
      }
    }

    const slug = slugOverride ?? (step.config?.template_slug as string) ?? "engagement_generic"
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
    const tpl = await resolveTemplate(e.studio_id, slug as any, vars, { subject: defSubject, bodyHtml: defBody })
    await enqueueEmail({
      studioId: e.studio_id,
      toEmail: cv.email,
      toName: cv.name,
      subject: tpl.subject,
      bodyHtml: tpl.bodyHtml,
      fromName: tpl.fromName ?? cv.vars.studio_name,
      relatedEntityType: "client",
      relatedEntityId: e.client_id,
      // Marketing → respeta la baja + List-Unsubscribe (ver email-drain.service).
      metadata: { marketing: true },
    })
    await logRun(e.studio_id, e.id, step.id, step.block_type, "done", { to: cv.email })
  } catch (err) {
    await logRun(e.studio_id, e.id, step.id, step.block_type, "failed", undefined, err instanceof Error ? err.message : String(err))
  }
}

/** Bloque: crear tarea interna (inserción directa, sin actor). */
async function runCreateTask(e: EnrollmentRow, step: StepRow): Promise<void> {
  const sb = untypedService()
  try {
    const cv = await clientVars(e.studio_id, e.client_id)
    const title = renderVars((step.config?.title as string) ?? "Seguimiento de fidelización", cv.vars)
    const description = step.config?.description
      ? renderVars(step.config.description as string, cv.vars)
      : `Cliente: ${cv.name}`
    const priority = (step.config?.priority as string) ?? "medium"
    const dueDays = Number(step.config?.due_days ?? 0)
    const dueDate =
      dueDays > 0 ? new Date(Date.now() + dueDays * 86400000).toISOString().slice(0, 10) : null
    await sb.from("tasks").insert({
      studio_id: e.studio_id,
      title,
      description,
      status: "pendiente",
      priority,
      entity_type: "client",
      entity_id: e.client_id,
      due_date: dueDate,
      notify_assignee: false,
      created_by: null,
    })
    await logRun(e.studio_id, e.id, step.id, "create_task", "done", { title })
  } catch (err) {
    await logRun(e.studio_id, e.id, step.id, "create_task", "failed", undefined, err instanceof Error ? err.message : String(err))
  }
}

/** Bloque: aplicar etiqueta al cliente (get-or-create tag + assignment). */
async function runAddTag(e: EnrollmentRow, step: StepRow): Promise<void> {
  const sb = untypedService()
  try {
    const name = ((step.config?.tag as string) ?? "").trim()
    if (!name) {
      await logRun(e.studio_id, e.id, step.id, "add_tag", "skipped", undefined, "sin etiqueta")
      return
    }
    let tagId: string
    const { data: existing } = await sb
      .from("tags")
      .select("id")
      .eq("studio_id", e.studio_id)
      .eq("name", name)
      .maybeSingle()
    if (existing) {
      tagId = (existing as { id: string }).id
    } else {
      const { data: created, error } = await sb
        .from("tags")
        .insert({ studio_id: e.studio_id, name, color: (step.config?.color as string) ?? "#b08a3e" })
        .select("id")
        .single()
      if (error) throw error
      tagId = (created as { id: string }).id
    }
    const { error: aErr } = await sb
      .from("tag_assignments")
      .insert({ studio_id: e.studio_id, tag_id: tagId, client_id: e.client_id })
    if (aErr && (aErr as { code?: string }).code !== "23505") throw aErr
    await logRun(e.studio_id, e.id, step.id, "add_tag", "done", { tag: name })
  } catch (err) {
    await logRun(e.studio_id, e.id, step.id, "add_tag", "failed", undefined, err instanceof Error ? err.message : String(err))
  }
}

/** Bloque: notificación interna al estudio. */
async function runNotify(e: EnrollmentRow, step: StepRow): Promise<void> {
  const sb = untypedService()
  try {
    const cv = await clientVars(e.studio_id, e.client_id)
    const title = renderVars((step.config?.title as string) ?? "Recordatorio de fidelización", cv.vars)
    const body = renderVars((step.config?.body as string) ?? `Acción de engagement para ${cv.name}`, cv.vars)
    await sb.from("notifications").insert({
      studio_id: e.studio_id,
      type: "system",
      title,
      body,
      related_entity_type: "client",
      related_entity_id: e.client_id,
    })
    await logRun(e.studio_id, e.id, step.id, "notify", "done")
  } catch (err) {
    await logRun(e.studio_id, e.id, step.id, "notify", "failed", undefined, err instanceof Error ? err.message : String(err))
  }
}

/**
 * Bloque: enviar WhatsApp (plantilla aprobada de Meta) vía Cloud API.
 * Proactivo → requiere una plantilla aprobada. body_vars llena {{1}},{{2}}…
 * (por defecto el nombre del cliente). Degrada con "skipped" si no hay
 * teléfono / plantilla / WhatsApp no configurado.
 */
async function runSendWhatsApp(e: EnrollmentRow, step: StepRow): Promise<void> {
  try {
    const cv = await clientVars(e.studio_id, e.client_id)
    if (!cv.phone) {
      await logRun(e.studio_id, e.id, step.id, "send_whatsapp", "skipped", undefined, "cliente sin teléfono")
      return
    }
    const templateName = (step.config?.template_name as string | undefined)?.trim()
    if (!templateName) {
      await logRun(e.studio_id, e.id, step.id, "send_whatsapp", "skipped", undefined, "sin plantilla de WhatsApp")
      return
    }
    const lang = (step.config?.lang_code as string | undefined)?.trim() || "es"
    const rawVars =
      Array.isArray(step.config?.body_vars) && (step.config!.body_vars as unknown[]).length > 0
        ? (step.config!.body_vars as string[])
        : ["{{client_name}}"]
    const bodyParams = rawVars.map((v) => renderVars(String(v), cv.vars))

    const { sendTemplateMessage } = await import("./whatsapp/cloud-api.service")
    const r = await sendTemplateMessage(e.studio_id, cv.phone, templateName, lang, bodyParams)
    if (r.ok) {
      await logRun(e.studio_id, e.id, step.id, "send_whatsapp", "done", {
        to: cv.phone,
        wa_id: r.id,
        template: templateName,
      })
    } else {
      await logRun(e.studio_id, e.id, step.id, "send_whatsapp", "failed", undefined, r.error)
    }
  } catch (err) {
    await logRun(
      e.studio_id,
      e.id,
      step.id,
      "send_whatsapp",
      "failed",
      undefined,
      err instanceof Error ? err.message : String(err),
    )
  }
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

      // Bloques de acción: ejecutan y avanzan al siguiente paso.
      if (step.block_type === "send_email") await runSendEmail(e, step)
      else if (step.block_type === "request_feedback") await runSendEmail(e, step, "engagement_post_delivery")
      else if (step.block_type === "request_review") await runSendEmail(e, step, "engagement_review_request")
      else if (step.block_type === "create_task") await runCreateTask(e, step)
      else if (step.block_type === "add_tag") await runAddTag(e, step)
      else if (step.block_type === "notify") await runNotify(e, step)
      else if (step.block_type === "send_whatsapp") await runSendWhatsApp(e, step)
      else {
        // ai_generate / condition / recommend → Fase posterior.
        await logRun(e.studio_id, e.id, step.id, step.block_type, "skipped", undefined, "bloque pendiente (IA generativa/condición)")
      }

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
