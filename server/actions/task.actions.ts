"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  changeTaskStatus,
  createTask,
  deleteTask,
  updateTask,
  type TaskPriority,
  type TaskStatus,
} from "@/server/services/task.service"

export type TaskActionState = {
  ok?: boolean
  message?: string
  taskId?: string
  values?: Record<string, string>
}

function collectValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  formData.forEach((v, k) => {
    if (typeof v === "string") out[k] = v
  })
  return out
}

export async function createTaskAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)
  const title = String(formData.get("title") ?? "").trim()
  if (!title) return { ok: false, message: "El título es requerido", values }

  try {
    const task = await createTask(session.studioId, session.userId, {
      title,
      description: (formData.get("description") as string) || undefined,
      assignedToUserId: (formData.get("assignedToUserId") as string) || undefined,
      dueDate: (formData.get("dueDate") as string) || undefined,
      dueTime: (formData.get("dueTime") as string) || undefined,
      reminderMinutesBefore: formData.get("reminderMinutesBefore")
        ? Number(formData.get("reminderMinutesBefore"))
        : undefined,
      priority: (formData.get("priority") as TaskPriority) || "medium",
      tags: formData.get("tags")
        ? String(formData.get("tags"))
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined,
      entityType: (formData.get("entityType") as string) || undefined,
      entityId: (formData.get("entityId") as string) || undefined,
      notifyAssignee: formData.get("notifyAssignee") !== "off",
      isRecurring: formData.get("isRecurring") === "on",
      recurringIntervalDays: formData.get("recurringIntervalDays")
        ? Number(formData.get("recurringIntervalDays"))
        : undefined,
    })
    revalidatePath("/tasks")
    redirect(`/tasks/${task.id}`)
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido",
      values,
    }
  }
}

export async function updateTaskAction(
  taskId: string,
  data: {
    title?: string
    description?: string | null
    assignedToUserId?: string | null
    dueDate?: string | null
    dueTime?: string | null
    reminderMinutesBefore?: number | null
    priority?: TaskPriority
    tags?: string[]
    notifyAssignee?: boolean
  },
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  try {
    await updateTask(session.studioId, session.userId, taskId, data)
    revalidatePath(`/tasks/${taskId}`)
    revalidatePath("/tasks")
    return { ok: true, message: "Tarea actualizada" }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido",
    }
  }
}

export async function changeTaskStatusAction(
  taskId: string,
  status: TaskStatus,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  try {
    await changeTaskStatus(session.studioId, session.userId, taskId, status)
    revalidatePath(`/tasks/${taskId}`)
    revalidatePath("/tasks")
    revalidatePath("/deliveries")
    return { ok: true, message: `Estado: ${status}` }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido",
    }
  }
}

export async function deleteTaskAction(
  taskId: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  try {
    await deleteTask(session.studioId, session.userId, taskId)
    revalidatePath("/tasks")
    return { ok: true, message: "Tarea eliminada" }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido",
    }
  }
}
