import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"

/**
 * Service de plantillas de proyecto. Permite definir flujos completos
 * reutilizables (tasks, emails, deliverables, packages).
 */

export type ProjectTemplate = {
  id: string
  studio_id: string
  name: string
  description: string | null
  event_type: string | null
  cover_image_url: string | null
  default_duration_days: number | null
  default_currency: string
  config: TemplateConfig
  is_active: boolean
  usage_count: number
  last_used_at: string | null
  created_at: string
  updated_at: string
}

export type TemplateConfig = {
  tasks?: Array<{
    title: string
    description?: string
    due_offset_days: number // negativo = antes del event_date, positivo = después
    priority?: "low" | "medium" | "high" | "urgent"
    assigned_role?: string
  }>
  email_triggers?: Array<{
    event: "booked" | "week_before" | "day_before" | "after_session"
    template_slug: string
    delay_minutes?: number
  }>
  deliverables?: Array<{
    name: string
    description?: string
    due_offset_days: number
    type: "gallery" | "album" | "video" | "prints" | "other"
  }>
  package_ids?: string[]
  pricing?: {
    base_amount?: number
    deposit_amount?: number
    currency?: string
  }
  custom_fields?: Record<string, string>
}

export async function listProjectTemplates(
  studioId: string,
): Promise<ProjectTemplate[]> {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("project_templates")
    .select("*")
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("usage_count", { ascending: false })
    .order("name", { ascending: true })

  if (error) throwServiceError("PROJECT_TEMPLATES_LIST_FAILED", error)
  return (data ?? []) as ProjectTemplate[]
}

export async function getProjectTemplateById(
  studioId: string,
  templateId: string,
): Promise<ProjectTemplate | null> {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("project_templates")
    .select("*")
    .eq("id", templateId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()

  if (error) throwServiceError("PROJECT_TEMPLATE_GET_FAILED", error)
  return (data as ProjectTemplate) ?? null
}

export async function createProjectTemplate(
  studioId: string,
  actorId: string,
  data: {
    name: string
    description?: string
    eventType?: string
    coverImageUrl?: string
    defaultDurationDays?: number
    defaultCurrency?: string
    config?: TemplateConfig
  },
): Promise<ProjectTemplate> {
  const sb = untypedService()
  const { data: row, error } = await sb
    .from("project_templates")
    .insert({
      studio_id: studioId,
      name: data.name,
      description: data.description ?? null,
      event_type: data.eventType ?? null,
      cover_image_url: data.coverImageUrl ?? null,
      default_duration_days: data.defaultDurationDays ?? null,
      default_currency: data.defaultCurrency ?? "DOP",
      config: data.config ?? {},
      is_active: true,
      created_by: actorId,
    })
    .select("*")
    .single()

  if (error) throwServiceError("PROJECT_TEMPLATE_CREATE_FAILED", error)

  const template = row as ProjectTemplate
  await logActivity({
    studioId,
    actorId,
    entityType: "project_template",
    entityId: template.id,
    action: "project_template.created",
    metadata: { name: template.name },
  })

  return template
}

export async function updateProjectTemplate(
  studioId: string,
  actorId: string,
  templateId: string,
  data: Partial<{
    name: string
    description: string | null
    eventType: string | null
    coverImageUrl: string | null
    defaultDurationDays: number | null
    defaultCurrency: string
    config: TemplateConfig
    isActive: boolean
  }>,
): Promise<void> {
  const sb = untypedService()
  const patch: Record<string, unknown> = {}
  if (data.name !== undefined) patch.name = data.name
  if (data.description !== undefined) patch.description = data.description
  if (data.eventType !== undefined) patch.event_type = data.eventType
  if (data.coverImageUrl !== undefined)
    patch.cover_image_url = data.coverImageUrl
  if (data.defaultDurationDays !== undefined)
    patch.default_duration_days = data.defaultDurationDays
  if (data.defaultCurrency !== undefined)
    patch.default_currency = data.defaultCurrency
  if (data.config !== undefined) patch.config = data.config
  if (data.isActive !== undefined) patch.is_active = data.isActive

  const { error } = await sb
    .from("project_templates")
    .update(patch)
    .eq("id", templateId)
    .eq("studio_id", studioId)

  if (error) throwServiceError("PROJECT_TEMPLATE_UPDATE_FAILED", error)

  await logActivity({
    studioId,
    actorId,
    entityType: "project_template",
    entityId: templateId,
    action: "project_template.updated",
    metadata: { keys: Object.keys(patch) },
  })
}

export async function deleteProjectTemplate(
  studioId: string,
  actorId: string,
  templateId: string,
): Promise<void> {
  const sb = untypedService()
  const { error } = await sb
    .from("project_templates")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", templateId)
    .eq("studio_id", studioId)

  if (error) throwServiceError("PROJECT_TEMPLATE_DELETE_FAILED", error)

  await logActivity({
    studioId,
    actorId,
    entityType: "project_template",
    entityId: templateId,
    action: "project_template.deleted",
  })
}

/**
 * Aplica una plantilla a un proyecto existente. Crea las tasks, deliverables,
 * etc. con due_dates calculados desde event_date.
 */
export async function applyTemplateToProject(
  studioId: string,
  actorId: string,
  templateId: string,
  projectId: string,
  eventDate: string,
): Promise<{
  tasksCreated: number
  deliverablesCreated: number
  errors: string[]
}> {
  const template = await getProjectTemplateById(studioId, templateId)
  if (!template) throw new Error("PROJECT_TEMPLATE_NOT_FOUND")

  const sb = untypedService()
  const errors: string[] = []
  let tasksCreated = 0
  let deliverablesCreated = 0

  const eventDt = new Date(eventDate)

  // 1. Tasks
  for (const t of template.config.tasks ?? []) {
    try {
      const dueDate = new Date(eventDt)
      dueDate.setDate(dueDate.getDate() + t.due_offset_days)

      await sb.from("tasks").insert({
        studio_id: studioId,
        title: t.title,
        description: t.description ?? null,
        due_date: dueDate.toISOString().slice(0, 10),
        priority: t.priority ?? "medium",
        status: "pendiente",
        entity_type: "project",
        entity_id: projectId,
        created_by: actorId,
        notify_assignee: true,
      })
      tasksCreated++
    } catch (err) {
      errors.push(
        `Task "${t.title}": ${err instanceof Error ? err.message : "?"}`,
      )
    }
  }

  // 2. Deliverables (insert en deliveries si existe la tabla)
  for (const d of template.config.deliverables ?? []) {
    try {
      const dueDate = new Date(eventDt)
      dueDate.setDate(dueDate.getDate() + d.due_offset_days)
      await sb.from("deliveries").insert({
        studio_id: studioId,
        project_id: projectId,
        title: d.name,
        description: d.description ?? null,
        delivery_type: d.type,
        scheduled_for: dueDate.toISOString(),
        status: "pending",
      })
      deliverablesCreated++
    } catch (err) {
      // deliveries table puede no existir aún
      errors.push(
        `Deliverable "${d.name}": ${err instanceof Error ? err.message : "?"}`,
      )
    }
  }

  // 3. Increment usage_count
  await sb
    .from("project_templates")
    .update({
      usage_count: template.usage_count + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", templateId)

  await logActivity({
    studioId,
    actorId,
    entityType: "project_template",
    entityId: templateId,
    action: "project_template.applied",
    metadata: {
      project_id: projectId,
      tasks_created: tasksCreated,
      deliverables_created: deliverablesCreated,
    },
  })

  return { tasksCreated, deliverablesCreated, errors }
}
