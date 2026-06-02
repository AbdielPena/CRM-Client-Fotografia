"use server"

import { revalidatePath } from "next/cache"
import { requireRole } from "@/server/middleware/auth"
import {
  setChecklistItem,
  saveWorkflowNotes,
  markWorkflowValidated,
  createError,
  updateError,
  deleteError,
  recordTestRun,
  saveAuditRun,
  type ErrorPriority,
  type ErrorStatus,
  type TestResult,
} from "@/server/services/status.service"
import { runAudit } from "@/server/services/status-audit.service"

export async function toggleChecklistItemAction(
  workflowKey: string,
  itemKey: string,
  checked: boolean,
) {
  const session = await requireRole("staff")
  await setChecklistItem(session.studioId, workflowKey, itemKey, checked)
  revalidatePath("/status")
  return { success: true }
}

export async function saveWorkflowNotesAction(workflowKey: string, notes: string) {
  const session = await requireRole("staff")
  await saveWorkflowNotes(session.studioId, workflowKey, notes)
  revalidatePath("/status")
  return { success: true }
}

export async function markWorkflowValidatedAction(workflowKey: string) {
  const session = await requireRole("staff")
  await markWorkflowValidated(session.studioId, workflowKey, session.userId)
  revalidatePath("/status")
  return { success: true }
}

export async function createErrorAction(formData: FormData) {
  const session = await requireRole("staff")
  const title = String(formData.get("title") ?? "").trim()
  if (!title) return { error: "El título es requerido" }
  await createError(session.studioId, session.userId, {
    title,
    description: (formData.get("description") as string) || null,
    module: (formData.get("module") as string) || null,
    workflowKey: (formData.get("workflowKey") as string) || null,
    priority: ((formData.get("priority") as string) || "media") as ErrorPriority,
  })
  revalidatePath("/status")
  return { success: true }
}

export async function updateErrorStatusAction(errorId: string, status: string) {
  const session = await requireRole("staff")
  await updateError(session.studioId, errorId, { status: status as ErrorStatus })
  revalidatePath("/status")
  return { success: true }
}

export async function updateErrorPriorityAction(errorId: string, priority: string) {
  const session = await requireRole("staff")
  await updateError(session.studioId, errorId, { priority: priority as ErrorPriority })
  revalidatePath("/status")
  return { success: true }
}

export async function deleteErrorAction(errorId: string) {
  const session = await requireRole("staff")
  await deleteError(session.studioId, errorId)
  revalidatePath("/status")
  return { success: true }
}

export async function runAuditAction() {
  const session = await requireRole("staff")
  const audit = await runAudit(session.studioId)
  await saveAuditRun(session.studioId, session.userId, audit.results, audit.summary).catch(() => {})
  revalidatePath("/status")
  return { success: true, ...audit }
}

export async function recordTestRunAction(formData: FormData) {
  const session = await requireRole("staff")
  await recordTestRun(
    session.studioId,
    session.userId,
    session.name || session.email || null,
    {
      workflowKey: (formData.get("workflowKey") as string) || null,
      result: ((formData.get("result") as string) || "passed") as TestResult,
      notes: (formData.get("notes") as string) || null,
    },
  )
  revalidatePath("/status")
  return { success: true }
}
