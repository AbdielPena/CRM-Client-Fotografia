import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import {
  recordCollaboratorPayable,
  settleCollaboratorPayable,
  cancelCollaboratorPayable,
  reopenCollaboratorPayable,
  listCollaboratorPayableStatuses,
} from "./finanzapp-bridge.service"
import {
  normalizeRequirements,
  evaluateRequirements,
} from "@/lib/collaborators/requirements"
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
/**
 * Reconciliación inversa (FinanzApp → CRM): si un payable fue pagado/cancelado
 * directamente en FinanzApp, refleja ese estado en el CRM. Best-effort.
 */
async function reconcileProjectPayments(
  studioId: string,
  projectId: string,
): Promise<void> {
  const sb = untypedService()
  const { data: rows } = await sb
    .from("project_collaborators")
    .select("id, pay_status, finanzapp_payable_ref")
    .eq("studio_id", studioId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .not("finanzapp_payable_ref", "is", null)
  const pend = ((rows ?? []) as Array<{
    id: string
    pay_status: string
    finanzapp_payable_ref: string | null
  }>).filter((r) => r.pay_status === "pending" && r.finanzapp_payable_ref)
  if (pend.length === 0) return
  const statuses = await listCollaboratorPayableStatuses(studioId)
  for (const r of pend) {
    if (statuses[r.finanzapp_payable_ref as string] === "pagada") {
      await sb
        .from("project_collaborators")
        .update({
          pay_status: "paid",
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", r.id)
        .eq("studio_id", studioId)
    }
  }
}

export async function listProjectCollaborators(
  studioId: string,
  projectId: string,
): Promise<ProjectCollaboratorRow[]> {
  // Sincroniza pagos hechos directamente en FinanzApp antes de listar.
  try {
    await reconcileProjectPayments(studioId, projectId)
  } catch (err) {
    console.error("[collab] reconcile failed", err)
  }
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

  const created = row as ProjectCollaboratorRow
  const agreed = Number(created.agreed_pay ?? 0)
  // Fase 3: registrar la deuda en FinanzApp (best-effort, no bloquea).
  if (agreed > 0) {
    await sb
      .from("project_collaborators")
      .update({ finanzapp_payable_ref: `crm-collab:${created.id}` })
      .eq("id", created.id)
    const acreedor = created.collaborator?.name ?? "Colaborador"
    try {
      await recordCollaboratorPayable(studioId, {
        assignmentId: created.id,
        acreedor,
        monto: agreed,
        dueDate: created.service_date,
        notas: created.role ? `Colaborador: ${created.role}` : null,
      })
      if (created.pay_status === "paid") {
        await settleCollaboratorPayable(studioId, {
          assignmentId: created.id,
          descripcion: `Pago a colaborador: ${acreedor}`,
        })
      }
    } catch (err) {
      console.error("[collab→finanzapp] assign sync failed", err)
    }
  }
  return created
}

export async function updateAssignment(
  studioId: string,
  assignmentId: string,
  data: UpdateAssignmentInput,
): Promise<void> {
  const sb = untypedService()
  const { data: existing } = await sb
    .from("project_collaborators")
    .select("agreed_pay, pay_status, service_date, collaborator:collaborators(name)")
    .eq("id", assignmentId)
    .eq("studio_id", studioId)
    .maybeSingle()
  if (!existing) throw new Error("ASSIGNMENT_NOT_FOUND")
  const prev = existing as {
    agreed_pay: number
    pay_status: string
    service_date: string | null
    collaborator: { name: string } | { name: string }[] | null
  }

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

  const newAgreed =
    data.agreedPay !== undefined
      ? data.agreedPay ?? 0
      : Number(prev.agreed_pay ?? 0)
  if (newAgreed > 0) patch.finanzapp_payable_ref = `crm-collab:${assignmentId}`

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

  // Fase 3: sincronizar FinanzApp según la transición de pago (best-effort).
  const newPay = data.payStatus ?? prev.pay_status
  const c = prev.collaborator
  const acreedor = (Array.isArray(c) ? c[0]?.name : c?.name) ?? "Colaborador"
  const dueDate =
    data.serviceDate !== undefined
      ? emptyToNull(data.serviceDate)
      : prev.service_date
  try {
    if (newAgreed > 0 && newPay !== "cancelled") {
      await recordCollaboratorPayable(studioId, {
        assignmentId,
        acreedor,
        monto: newAgreed,
        dueDate,
        notas: null,
      })
    }
    if (newPay === "paid" && prev.pay_status !== "paid" && newAgreed > 0) {
      await settleCollaboratorPayable(studioId, {
        assignmentId,
        descripcion: `Pago a colaborador: ${acreedor}`,
      })
    } else if (newPay === "pending" && prev.pay_status === "paid") {
      await reopenCollaboratorPayable(studioId, assignmentId)
    } else if (newPay === "cancelled") {
      await cancelCollaboratorPayable(studioId, assignmentId)
    }
  } catch (err) {
    console.error("[collab→finanzapp] update sync failed", err)
  }
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
  // Fase 3: cancelar la deuda en FinanzApp (best-effort).
  try {
    await cancelCollaboratorPayable(studioId, assignmentId)
  } catch (err) {
    console.error("[collab→finanzapp] remove cancel failed", err)
  }
}

/**
 * De una lista de proyectos, devuelve el Set de IDs cuyo PLAN requiere
 * colaboradores que aún NO están asignados (para el badge en la lista). 3
 * queries fijas sin importar N. Best-effort: si algo falla devuelve vacío.
 */
export async function getProjectsMissingCollaborators(
  studioId: string,
  projectIds: string[],
): Promise<Set<string>> {
  if (projectIds.length === 0) return new Set()
  const sb = untypedService()
  try {
    const { data: projRows } = await sb
      .from("projects")
      .select("id, package_id")
      .eq("studio_id", studioId)
      .in("id", projectIds)
    const projs = ((projRows ?? []) as Array<{
      id: string
      package_id: string | null
    }>).filter((p) => p.package_id)
    const pkgIds = [...new Set(projs.map((p) => p.package_id as string))]
    if (pkgIds.length === 0) return new Set()

    const { data: pkgRows } = await sb
      .from("packages")
      .select("id, collaborator_requirements")
      .in("id", pkgIds)
    const reqByPkg = new Map<string, ReturnType<typeof normalizeRequirements>>()
    for (const p of (pkgRows ?? []) as Array<{
      id: string
      collaborator_requirements: unknown
    }>) {
      const reqs = normalizeRequirements(p.collaborator_requirements)
      if (reqs.length) reqByPkg.set(p.id, reqs)
    }
    const projsWithReq = projs.filter((p) => reqByPkg.has(p.package_id as string))
    if (projsWithReq.length === 0) return new Set()

    const { data: pcRows } = await sb
      .from("project_collaborators")
      .select("project_id, collaborator:collaborators(type)")
      .eq("studio_id", studioId)
      .in(
        "project_id",
        projsWithReq.map((p) => p.id),
      )
      .is("deleted_at", null)
      .neq("pay_status", "cancelled")
    const typesByProj = new Map<string, string[]>()
    for (const r of (pcRows ?? []) as Array<{
      project_id: string
      collaborator: { type: string } | { type: string }[] | null
    }>) {
      const c = Array.isArray(r.collaborator) ? r.collaborator[0] : r.collaborator
      if (!c?.type) continue
      const arr = typesByProj.get(r.project_id) ?? []
      arr.push(c.type)
      typesByProj.set(r.project_id, arr)
    }

    const missing = new Set<string>()
    for (const p of projsWithReq) {
      const reqs = reqByPkg.get(p.package_id as string) ?? []
      const statuses = evaluateRequirements(reqs, typesByProj.get(p.id) ?? [])
      if (statuses.some((s) => !s.satisfied)) missing.add(p.id)
    }
    return missing
  } catch (err) {
    console.error("[collab] getProjectsMissingCollaborators failed", err)
    return new Set()
  }
}

/**
 * Totales por colaborador (reporte): nº de asignaciones, monto pendiente y
 * pagado, a través de todos los proyectos. Para la vista de Colaboradores.
 */
export async function getCollaboratorTotals(
  studioId: string,
): Promise<Record<string, { assignments: number; pending: number; paid: number }>> {
  const sb = untypedService()
  const { data } = await sb
    .from("project_collaborators")
    .select("collaborator_id, agreed_pay, pay_status")
    .eq("studio_id", studioId)
    .is("deleted_at", null)
  const out: Record<string, { assignments: number; pending: number; paid: number }> = {}
  for (const r of (data ?? []) as Array<{
    collaborator_id: string
    agreed_pay: number
    pay_status: string
  }>) {
    const t = (out[r.collaborator_id] ??= { assignments: 0, pending: 0, paid: 0 })
    t.assignments += 1
    const amt = Number(r.agreed_pay ?? 0)
    if (r.pay_status === "paid") t.paid += amt
    else if (r.pay_status === "pending") t.pending += amt
  }
  return out
}
