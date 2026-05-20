import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"

/**
 * Service de tasks con asignación, due date, priority, polymorphic entity link
 * y notificaciones al asignado.
 */

export type TaskStatus =
  | "pendiente"
  | "en_progreso"
  | "completada"
  | "cancelada"
  | "bloqueada"

export type TaskPriority = "low" | "medium" | "high" | "urgent"

export type TaskRow = {
  id: string
  studio_id: string
  title: string
  description: string | null
  assigned_to_user_id: string | null
  assigned_by_user_id: string | null
  assigned_at: string | null
  due_date: string | null
  due_time: string | null
  reminder_minutes_before: number | null
  reminded_at: string | null
  started_at: string | null
  completed_at: string | null
  completed_by: string | null
  status: TaskStatus
  priority: TaskPriority
  tags: string[]
  entity_type: string | null
  entity_id: string | null
  notify_assignee: boolean
  notify_email_sent_at: string | null
  is_recurring: boolean
  recurring_interval_days: number | null
  parent_task_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export async function getTasks(
  studioId: string,
  opts: {
    status?: TaskStatus
    assignedToUserId?: string
    entityType?: string
    entityId?: string
    overdue?: boolean
    search?: string
    page?: number
    pageSize?: number
  } = {},
) {
  const { page = 1, pageSize = 50 } = opts
  const sb = untypedServer()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = sb
    .from("tasks")
    .select(
      `*,
       assignee:assigned_to_user_id(id, email, raw_user_meta_data),
       creator:created_by(id, email, raw_user_meta_data)`,
      { count: "exact" },
    )
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("priority", { ascending: false })
    .order("due_date", { ascending: true, nullsFirst: false })
    .range(from, to)

  if (opts.status) query = query.eq("status", opts.status)
  if (opts.assignedToUserId)
    query = query.eq("assigned_to_user_id", opts.assignedToUserId)
  if (opts.entityType) query = query.eq("entity_type", opts.entityType)
  if (opts.entityId) query = query.eq("entity_id", opts.entityId)
  if (opts.overdue) {
    const today = new Date().toISOString().slice(0, 10)
    query = query
      .lt("due_date", today)
      .in("status", ["pendiente", "en_progreso"])
  }
  if (opts.search && opts.search.trim()) {
    const term = `%${opts.search.trim()}%`
    query = query.or(`title.ilike.${term},description.ilike.${term}`)
  }

  const { data, count, error } = await query
  if (error) throwServiceError("TASKS_LIST_FAILED", error, { studioId })

  return {
    items: (data ?? []) as TaskRow[],
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize) || 1,
  }
}

export async function getTaskById(studioId: string, taskId: string) {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()

  if (error) throwServiceError("TASK_GET_FAILED", error, { studioId, taskId })
  return (data as TaskRow) ?? null
}

export async function createTask(
  studioId: string,
  actorId: string,
  data: {
    title: string
    description?: string
    assignedToUserId?: string
    dueDate?: string
    dueTime?: string
    reminderMinutesBefore?: number
    priority?: TaskPriority
    tags?: string[]
    entityType?: string
    entityId?: string
    notifyAssignee?: boolean
    isRecurring?: boolean
    recurringIntervalDays?: number
  },
): Promise<TaskRow> {
  const sb = untypedService()

  if (!data.title.trim()) throw new Error("TASK_TITLE_REQUIRED")

  const payload = {
    studio_id: studioId,
    title: data.title.trim(),
    description: data.description ?? null,
    assigned_to_user_id: data.assignedToUserId ?? null,
    assigned_by_user_id: data.assignedToUserId ? actorId : null,
    assigned_at: data.assignedToUserId ? new Date().toISOString() : null,
    due_date: data.dueDate ?? null,
    due_time: data.dueTime ?? null,
    reminder_minutes_before: data.reminderMinutesBefore ?? null,
    priority: data.priority ?? "medium",
    tags: data.tags ?? [],
    entity_type: data.entityType ?? null,
    entity_id: data.entityId ?? null,
    notify_assignee: data.notifyAssignee ?? true,
    is_recurring: data.isRecurring ?? false,
    recurring_interval_days: data.recurringIntervalDays ?? null,
    created_by: actorId,
  }

  const { data: row, error } = await sb
    .from("tasks")
    .insert(payload)
    .select("*")
    .single()

  if (error) throwServiceError("TASK_CREATE_FAILED", error, { studioId })

  const task = row as TaskRow

  // Notificación al asignado (in-app)
  if (task.assigned_to_user_id && task.notify_assignee) {
    void notifyAssignee(task, "task.assigned").catch((err) =>
      console.error("[task] notify failed:", err),
    )
  }

  // Automation dispatch (opcional, best-effort)
  void (async () => {
    try {
      const { dispatchAutomationEvent } = await import("./automation.service")
      // task.created no es trigger oficial pero podríamos agregarlo si hace falta
      await dispatchAutomationEvent({
        studioId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        event: "task.created" as any,
        entityType: "task",
        entityId: task.id,
        payload: {
          priority: task.priority,
          assigned_to: task.assigned_to_user_id,
        },
      })
    } catch {
      // event "task.created" puede no estar en el enum — ignore
    }
  })()

  await logActivity({
    studioId,
    actorId,
    entityType: "task",
    entityId: task.id,
    action: "task.created",
    metadata: {
      title: task.title,
      priority: task.priority,
      assigned_to: task.assigned_to_user_id,
    },
  })

  return task
}

export async function updateTask(
  studioId: string,
  actorId: string,
  taskId: string,
  data: Partial<{
    title: string
    description: string | null
    assignedToUserId: string | null
    dueDate: string | null
    dueTime: string | null
    reminderMinutesBefore: number | null
    priority: TaskPriority
    tags: string[]
    notifyAssignee: boolean
  }>,
): Promise<TaskRow> {
  const sb = untypedService()
  const existing = await getTaskById(studioId, taskId)
  if (!existing) throw new Error("TASK_NOT_FOUND")

  const patch: Record<string, unknown> = {}
  if (data.title !== undefined) patch.title = data.title
  if (data.description !== undefined) patch.description = data.description
  if (data.assignedToUserId !== undefined) {
    patch.assigned_to_user_id = data.assignedToUserId
    if (
      data.assignedToUserId &&
      data.assignedToUserId !== existing.assigned_to_user_id
    ) {
      patch.assigned_by_user_id = actorId
      patch.assigned_at = new Date().toISOString()
    }
  }
  if (data.dueDate !== undefined) patch.due_date = data.dueDate
  if (data.dueTime !== undefined) patch.due_time = data.dueTime
  if (data.reminderMinutesBefore !== undefined)
    patch.reminder_minutes_before = data.reminderMinutesBefore
  if (data.priority !== undefined) patch.priority = data.priority
  if (data.tags !== undefined) patch.tags = data.tags
  if (data.notifyAssignee !== undefined)
    patch.notify_assignee = data.notifyAssignee

  const { data: row, error } = await sb
    .from("tasks")
    .update(patch)
    .eq("id", taskId)
    .eq("studio_id", studioId)
    .select("*")
    .single()

  if (error) throwServiceError("TASK_UPDATE_FAILED", error, { studioId })

  const updated = row as TaskRow

  // Notificar nuevo asignado si cambió
  if (
    data.assignedToUserId &&
    data.assignedToUserId !== existing.assigned_to_user_id &&
    updated.notify_assignee
  ) {
    void notifyAssignee(updated, "task.reassigned").catch(() => {})
  }

  await logActivity({
    studioId,
    actorId,
    entityType: "task",
    entityId: taskId,
    action: "task.updated",
    metadata: { keys: Object.keys(patch) },
  })

  return updated
}

export async function changeTaskStatus(
  studioId: string,
  actorId: string,
  taskId: string,
  status: TaskStatus,
): Promise<TaskRow> {
  const sb = untypedService()
  const patch: Record<string, unknown> = { status }
  if (status === "en_progreso") {
    patch.started_at = new Date().toISOString()
  }
  if (status === "completada") {
    patch.completed_at = new Date().toISOString()
    patch.completed_by = actorId
  }

  const { data: row, error } = await sb
    .from("tasks")
    .update(patch)
    .eq("id", taskId)
    .eq("studio_id", studioId)
    .select("*")
    .single()

  if (error) throwServiceError("TASK_STATUS_CHANGE_FAILED", error, { studioId })

  const task = row as TaskRow

  await logActivity({
    studioId,
    actorId,
    entityType: "task",
    entityId: taskId,
    action: `task.status_${status}`,
  })

  // Si es completada y es recurring, crear el siguiente
  if (status === "completada" && task.is_recurring && task.recurring_interval_days) {
    void (async () => {
      try {
        const nextDue = new Date(task.due_date ?? new Date())
        nextDue.setDate(nextDue.getDate() + task.recurring_interval_days!)
        await createTask(studioId, actorId, {
          title: task.title,
          description: task.description ?? undefined,
          assignedToUserId: task.assigned_to_user_id ?? undefined,
          dueDate: nextDue.toISOString().slice(0, 10),
          dueTime: task.due_time ?? undefined,
          reminderMinutesBefore: task.reminder_minutes_before ?? undefined,
          priority: task.priority,
          tags: task.tags,
          entityType: task.entity_type ?? undefined,
          entityId: task.entity_id ?? undefined,
          notifyAssignee: task.notify_assignee,
          isRecurring: true,
          recurringIntervalDays: task.recurring_interval_days ?? undefined,
        })
      } catch (err) {
        console.error("[task] recurrence creation failed:", err)
      }
    })()
  }

  return task
}

export async function deleteTask(
  studioId: string,
  actorId: string,
  taskId: string,
): Promise<void> {
  const sb = untypedService()
  const { error } = await sb
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("studio_id", studioId)
  if (error) throwServiceError("TASK_DELETE_FAILED", error, { studioId })

  await logActivity({
    studioId,
    actorId,
    entityType: "task",
    entityId: taskId,
    action: "task.deleted",
  })
}

/**
 * Notifica al asignado vía notification in-app (V1).
 * TODO V2: trigger email via email_queue.
 */
async function notifyAssignee(
  task: TaskRow,
  action: "task.assigned" | "task.reassigned",
): Promise<void> {
  if (!task.assigned_to_user_id) return

  const sb = untypedService()
  await sb.from("notifications").insert({
    studio_id: task.studio_id,
    user_id: task.assigned_to_user_id,
    type: action,
    title:
      action === "task.assigned" ? "Te asignaron una tarea" : "Tarea reasignada a ti",
    body: task.title,
    entity_type: "task",
    entity_id: task.id,
    severity: task.priority === "urgent" ? "warning" : "info",
  })
}

/**
 * Cron job: procesa reminders pendientes.
 * Llamar desde /api/cron/tasks-reminders (cada 5 min).
 */
export async function processTaskReminders(): Promise<{
  reminded: number
  errors: number
}> {
  const sb = untypedService()
  const now = new Date()

  // Tasks con reminder pendiente y due_at <= now + reminder_minutes_before
  const { data: tasks, error } = await sb
    .from("tasks")
    .select("*")
    .is("deleted_at", null)
    .eq("status", "pendiente")
    .not("reminder_minutes_before", "is", null)
    .is("reminded_at", null)
    .not("due_date", "is", null)
    .limit(500)

  if (error) {
    console.error("[task-reminders] query failed:", error)
    return { reminded: 0, errors: 1 }
  }

  let reminded = 0
  let errors = 0

  for (const task of (tasks ?? []) as TaskRow[]) {
    try {
      if (!task.due_date) continue
      const dueDt = new Date(`${task.due_date}T${task.due_time ?? "23:59"}`)
      const reminderDt = new Date(
        dueDt.getTime() - (task.reminder_minutes_before ?? 0) * 60_000,
      )
      if (reminderDt > now) continue // todavía no toca

      if (task.assigned_to_user_id && task.notify_assignee) {
        await sb.from("notifications").insert({
          studio_id: task.studio_id,
          user_id: task.assigned_to_user_id,
          type: "task.reminder",
          title: `Recordatorio: ${task.title}`,
          body: `Vence ${task.due_date}${task.due_time ? ` a las ${task.due_time}` : ""}`,
          entity_type: "task",
          entity_id: task.id,
          severity: task.priority === "urgent" ? "warning" : "info",
        })
      }

      await sb
        .from("tasks")
        .update({ reminded_at: new Date().toISOString() })
        .eq("id", task.id)

      reminded++
    } catch (err) {
      errors++
      console.error("[task-reminders] item failed:", err)
    }
  }

  return { reminded, errors }
}
