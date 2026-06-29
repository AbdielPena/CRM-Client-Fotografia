"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createCollaboratorSchema,
  updateCollaboratorSchema,
  assignCollaboratorSchema,
  updateAssignmentSchema,
} from "@/lib/validations/collaborator.schema"
import {
  createCollaborator,
  updateCollaborator,
  deleteCollaborator,
  assignCollaborator,
  updateAssignment,
  removeAssignment,
} from "@/server/services/collaborator.service"

function firstError(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Datos inválidos"
}

// ── Roster ──────────────────────────────────────────────────────────────────
export async function createCollaboratorAction(formData: FormData) {
  const session = await requireStudioAuth()
  const parsed = createCollaboratorSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type") || "otro",
    phone: formData.get("phone"),
    whatsapp: formData.get("whatsapp"),
    email: formData.get("email"),
    serviceOffered: formData.get("serviceOffered"),
    baseRate: (formData.get("baseRate") as string) || undefined,
    notes: formData.get("notes"),
    status: formData.get("status") || "active",
  })
  if (!parsed.success) throw new Error(firstError(parsed.error.issues))
  const row = await createCollaborator(session.studioId, parsed.data)
  revalidatePath("/colaboradores")
  return { ok: true as const, id: row.id }
}

export async function updateCollaboratorAction(id: string, formData: FormData) {
  const session = await requireStudioAuth()
  const parsed = updateCollaboratorSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type") || undefined,
    phone: formData.get("phone"),
    whatsapp: formData.get("whatsapp"),
    email: formData.get("email"),
    serviceOffered: formData.get("serviceOffered"),
    baseRate: (formData.get("baseRate") as string) || undefined,
    notes: formData.get("notes"),
    status: formData.get("status") || undefined,
  })
  if (!parsed.success) throw new Error(firstError(parsed.error.issues))
  await updateCollaborator(session.studioId, id, parsed.data)
  revalidatePath("/colaboradores")
  return { ok: true as const }
}

export async function deleteCollaboratorAction(id: string) {
  const session = await requireStudioAuth()
  await deleteCollaborator(session.studioId, id)
  revalidatePath("/colaboradores")
  return { ok: true as const }
}

// ── Asignaciones por proyecto ────────────────────────────────────────────────
export async function assignCollaboratorAction(
  projectId: string,
  formData: FormData,
) {
  const session = await requireStudioAuth()
  const parsed = assignCollaboratorSchema.safeParse({
    collaboratorId: formData.get("collaboratorId"),
    role: formData.get("role"),
    agreedPay: (formData.get("agreedPay") as string) || undefined,
    payStatus: formData.get("payStatus") || "pending",
    serviceDate: formData.get("serviceDate"),
    paymentMethod: formData.get("paymentMethod"),
    notes: formData.get("notes"),
  })
  if (!parsed.success) throw new Error(firstError(parsed.error.issues))
  await assignCollaborator(session.studioId, projectId, parsed.data)
  revalidatePath(`/projects/${projectId}`)
  return { ok: true as const }
}

export async function updateAssignmentAction(
  assignmentId: string,
  projectId: string,
  formData: FormData,
) {
  const session = await requireStudioAuth()
  const parsed = updateAssignmentSchema.safeParse({
    role: formData.get("role"),
    agreedPay: (formData.get("agreedPay") as string) || undefined,
    payStatus: formData.get("payStatus") || undefined,
    serviceDate: formData.get("serviceDate"),
    paymentMethod: formData.get("paymentMethod"),
    notes: formData.get("notes"),
  })
  if (!parsed.success) throw new Error(firstError(parsed.error.issues))
  await updateAssignment(session.studioId, assignmentId, parsed.data)
  revalidatePath(`/projects/${projectId}`)
  return { ok: true as const }
}

export async function removeAssignmentAction(
  assignmentId: string,
  projectId: string,
) {
  const session = await requireStudioAuth()
  await removeAssignment(session.studioId, assignmentId)
  revalidatePath(`/projects/${projectId}`)
  return { ok: true as const }
}
