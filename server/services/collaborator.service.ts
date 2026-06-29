import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import type {
  CreateCollaboratorInput,
  UpdateCollaboratorInput,
  AssignCollaboratorInput,
  UpdateAssignmentInput,
} from "@/lib/validations/collaborator.schema"

/**
 * Módulo Colaboradores — acceso server-side con service-role; cada query filtra
 * por studio_id (la autorización la garantiza requireStudioAuth en las actions).
 * Tablas nuevas (no en los tipos generados) → untypedService().
 */

export type CollaboratorRow = {
  id: string
  studio_id: string
  name: string
  type: string
  phone: string | null
  whatsapp: string | null
  email: string | null
  service_offered: string | null
  base_rate: number | null
  notes: string | null
  status: "active" | "inactive"
  created_at: string
  updated_at: string
}

export type ProjectCollaboratorRow = {
  id: string
  studio_id: string
  project_id: string
  collaborator_id: string
  role: string | null
  agreed_pay: number
  pay_status: "pending" | "paid" | "cancelled"
  confirm_status: "pending" | "invited" | "confirmed" | "rejected" | "completed"
  service_date: string | null
  payment_method: string | null
  paid_at: string | null
  notes: string | null
  created_at: string
  collaborator: {
    id: string
    name: string
    type: string
    email: string | null
    phone: string | null
    whatsapp: string | null
  } | null
}

const emptyToNull = (v: string | undefined | null): string | null =>
  v && v.trim() ? v.trim() : null

// ── Roster ──────────────────────────────────────────────────────────────────
export async function listCollaborators(
  studioId: string,
  opts: { includeInactive?: boolean } = {},
): Promise<CollaboratorRow[]> {
  const sb = untypedService()
  let q = sb
    .from("collaborators")
    .select("*")
    .eq("studio_id", studioId)
    .is("deleted_at", null)
  if (!opts.includeInactive) q = q.eq("status", "active")
  const { data, error } = await q
    .order("status", { ascending: true })
    .order("name", { ascending: true })
  if (error) throwServiceError("COLLABORATOR_LIST_FAILED", error, { studioId })
  return (data ?? []) as CollaboratorRow[]
}

export async function createCollaborator(
  studioId: string,
  data: CreateCollaboratorInput,
): Promise<CollaboratorRow> {
  const sb = untypedService()
  const insert = {
    studio_id: studioId,
    name: data.name.trim(),
    type: data.type ?? "otro",
    phone: emptyToNull(data.phone),
    whatsapp: emptyToNull(data.whatsapp),
    email: emptyToNull(data.email),
    service_offered: emptyToNull(data.serviceOffered),
    base_rate: data.baseRate ?? null,
    notes: emptyToNull(data.notes),
    status: data.status ?? "active",
  }
  const { data: row, error } = await sb
    .from("collaborators")
    .insert(insert)
    .select("*")
    .single()
  if (error) throwServiceError("COLLABORATOR_CREATE_FAILED", error, { studioId })
  return row as CollaboratorRow
}

export async function updateCollaborator(
  studioId: string,
  id: string,
  data: UpdateCollaboratorInput,
): Promise<void> {
  const sb = untypedService()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (data.name !== undefined) patch.name = data.name.trim()
  if (data.type !== undefined) patch.type = data.type
  if (data.phone !== undefined) patch.phone = emptyToNull(data.phone)
  if (data.whatsapp !== undefined) patch.whatsapp = emptyToNull(data.whatsapp)
  if (data.email !== undefined) patch.email = emptyToNull(data.email)
  if (data.serviceOffered !== undefined)
    patch.service_offered = emptyToNull(data.serviceOffered)
  if (data.baseRate !== undefined) patch.base_rate = data.baseRate ?? null
  if (data.notes !== undefined) patch.notes = emptyToNull(data.notes)
  if (data.status !== undefined) patch.status = data.status

  const { error } = await sb
    .from("collaborators")
    .update(patch)
    .eq("id", id)
    .eq("studio_id", studioId)
  if (error) throwServiceError("COLLABORATOR_UPDATE_FAILED", error, { studioId, id })
}

export async function deleteCollaborator(
  studioId: string,
  id: string,
): Promise<void> {
  const sb = untypedService()
  const { error } = await sb
    .from("collaborators")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("studio_id", studioId)
  if (error) throwServiceError("COLLABORATOR_DELETE_FAILED", error, { studioId, id })
}

// ── Asignaciones por proyecto ────────────────────────────────────────────────
export async function listProjectCollaborators(
  studioId: string,
  projectId: string,
): Promise<ProjectCollaboratorRow[]> {
  const sb = untypedService()
  const { data, error } = await sb
    .from("project_collaborators")
    .select(
      "*, collaborator:collaborators(id, name, type, email, phone, whatsapp)",
    )
    .eq("studio_id", studioId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
  if (error)
    throwServiceError("PROJECT_COLLABORATORS_LIST_FAILED", error, {
      studioId,
      projectId,
    })
  return (data ?? []) as ProjectCollaboratorRow[]
}

export async function assignCollaborator(
  studioId: string,
  projectId: string,
  data: AssignCollaboratorInput,
): Promise<ProjectCollaboratorRow> {
  const sb = untypedService()
  // El colaborador debe pertenecer al estudio.
  const { data: collab } = await sb
    .from("collaborators")
    .select("id")
    .eq("id", data.collaboratorId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!collab) throw new Error("COLLABORATOR_NOT_FOUND")

  const insert = {
    studio_id: studioId,
    project_id: projectId,
    collaborator_id: data.collaboratorId,
    role: emptyToNull(data.role),
    agreed_pay: data.agreedPay ?? 0,
    pay_status: data.payStatus ?? "pending",
    service_date: emptyToNull(data.serviceDate),
    payment_method: emptyToNull(data.paymentMethod),
    notes: emptyToNull(data.notes),
    paid_at: data.payStatus === "paid" ? new Date().toISOString() : null,
  }
  const { data: row, error } = await sb
    .from("project_collaborators")
    .insert(insert)
    .select(
      "*, collaborator:collaborators(id, name, type, email, phone, whatsapp)",
    )
    .single()
  if (error)
    throwServiceError("PROJECT_COLLABORATOR_ASSIGN_FAILED", error, {
      studioId,
      projectId,
    })
  return row as ProjectCollaboratorRow
}

export async function updateAssignment(
  studioId: string,
  assignmentId: string,
  data: UpdateAssignmentInput,
): Promise<void> {
  const sb = untypedService()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (data.role !== undefined) patch.role = emptyToNull(data.role)
  if (data.agreedPay !== undefined) patch.agreed_pay = data.agreedPay ?? 0
  if (data.payStatus !== undefined) {
    patch.pay_status = data.payStatus
    // Sello de pago al pasar a "paid"; se limpia si vuelve a pendiente.
    patch.paid_at = data.payStatus === "paid" ? new Date().toISOString() : null
  }
  if (data.serviceDate !== undefined)
    patch.service_date = emptyToNull(data.serviceDate)
  if (data.paymentMethod !== undefined)
    patch.payment_method = emptyToNull(data.paymentMethod)
  if (data.notes !== undefined) patch.notes = emptyToNull(data.notes)

  const { error } = await sb
    .from("project_collaborators")
    .update(patch)
    .eq("id", assignmentId)
    .eq("studio_id", studioId)
  if (error)
    throwServiceError("PROJECT_COLLABORATOR_UPDATE_FAILED", error, {
      studioId,
      assignmentId,
    })
}

export async function removeAssignment(
  studioId: string,
  assignmentId: string,
): Promise<void> {
  const sb = untypedService()
  const { error } = await sb
    .from("project_collaborators")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .eq("studio_id", studioId)
  if (error)
    throwServiceError("PROJECT_COLLABORATOR_REMOVE_FAILED", error, {
      studioId,
      assignmentId,
    })
}
