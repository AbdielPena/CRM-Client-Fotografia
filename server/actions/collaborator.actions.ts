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
import {
  sendCollaboratorInvite,
  sendCollaboratorPortalInvite,
} from "@/server/services/collaborator-invite.service"
import {
  createCollaboratorPayment,
  markCollaboratorPaymentPaid,
  cancelCollaboratorPayment,
  listCollaboratorPaymentsForAdmin,
  COLLAB_PAYMENT_CONCEPTS,
  type CollabPaymentConcept,
} from "@/server/services/collaborator-payments.service"
import { syncProjectById } from "@/server/services/google-calendar.service"

// Re-sincroniza el evento de Google Calendar del proyecto (best-effort, no
// bloquea ni rompe si no hay integración) para reflejar los colaboradores.
function resyncCalendar(studioId: string, projectId: string) {
  void syncProjectById(studioId, projectId).catch(() => {})
}

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

/**
 * Da acceso al PORTAL del colaborador: genera el token de activación, le envía
 * el correo con el link (si tiene email) y devuelve el link para copiarlo.
 */
export async function startPortalSetupAction(collaboratorId: string) {
  const session = await requireStudioAuth()
  const res = await sendCollaboratorPortalInvite(session.studioId, collaboratorId)
  revalidatePath("/colaboradores")
  return {
    ok: true as const,
    link: res.link,
    emailed: res.emailed,
    noEmail: res.reason === "no_email",
  }
}

// ── Pagos adicionales al colaborador (no ligados a proyecto) ──────────────────
export async function loadCollaboratorPaymentsAction(collaboratorId: string) {
  const session = await requireStudioAuth()
  const payments = await listCollaboratorPaymentsForAdmin(session.studioId, collaboratorId)
  return { ok: true as const, payments }
}

export async function createCollaboratorPaymentAction(
  collaboratorId: string,
  formData: FormData,
) {
  const session = await requireStudioAuth()
  const conceptRaw = String(formData.get("concept") ?? "otro")
  const concept = (
    COLLAB_PAYMENT_CONCEPTS.includes(conceptRaw as CollabPaymentConcept)
      ? conceptRaw
      : "otro"
  ) as CollabPaymentConcept
  const amount = Number(formData.get("amount") ?? 0)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Monto inválido")
  const status = formData.get("status") === "paid" ? "paid" : "pending"

  await createCollaboratorPayment(session.studioId, session.userId, collaboratorId, {
    concept,
    description: (formData.get("description") as string) || null,
    amount,
    status,
    paymentMethod: (formData.get("paymentMethod") as string) || null,
    paymentDate: (formData.get("paymentDate") as string) || null,
    accountId: (formData.get("accountId") as string) || null,
  })
  revalidatePath("/colaboradores")
  return { ok: true as const }
}

export async function markCollaboratorPaymentPaidAction(
  paymentId: string,
  formData?: FormData,
) {
  const session = await requireStudioAuth()
  await markCollaboratorPaymentPaid(session.studioId, paymentId, {
    accountId: (formData?.get("accountId") as string) || null,
    paymentMethod: (formData?.get("paymentMethod") as string) || null,
    paymentDate: (formData?.get("paymentDate") as string) || null,
  })
  revalidatePath("/colaboradores")
  return { ok: true as const }
}

export async function cancelCollaboratorPaymentAction(paymentId: string) {
  const session = await requireStudioAuth()
  await cancelCollaboratorPayment(session.studioId, paymentId)
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
  const row = await assignCollaborator(session.studioId, projectId, parsed.data)
  // Invitación automática por correo al asignar (se puede omitir con sendInvite=false).
  const sendInvite = formData.get("sendInvite") !== "false"
  if (sendInvite) {
    try {
      await sendCollaboratorInvite(session.studioId, row.id)
    } catch (err) {
      console.error("[collab] invite on assign failed", err)
    }
  }
  resyncCalendar(session.studioId, projectId)
  revalidatePath(`/projects/${projectId}`)
  return { ok: true as const }
}

/** Reenvía (o envía) la invitación por correo a un colaborador asignado. */
export async function resendCollaboratorInviteAction(
  assignmentId: string,
  projectId: string,
) {
  const session = await requireStudioAuth()
  const res = await sendCollaboratorInvite(session.studioId, assignmentId)
  revalidatePath(`/projects/${projectId}`)
  if (!res.ok) {
    throw new Error(
      res.reason === "no_email"
        ? "El colaborador no tiene correo registrado"
        : "No se pudo enviar la invitación",
    )
  }
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
  resyncCalendar(session.studioId, projectId)
  revalidatePath(`/projects/${projectId}`)
  return { ok: true as const }
}

export async function removeAssignmentAction(
  assignmentId: string,
  projectId: string,
) {
  const session = await requireStudioAuth()
  await removeAssignment(session.studioId, assignmentId)
  resyncCalendar(session.studioId, projectId)
  revalidatePath(`/projects/${projectId}`)
  return { ok: true as const }
}
