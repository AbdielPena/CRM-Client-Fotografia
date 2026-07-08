import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import {
  recordCollaboratorExtraPayable,
  settleCollaboratorExtraPayable,
  cancelCollaboratorExtraPayable,
} from "./finanzapp-bridge.service"

/**
 * Pagos ADICIONALES a un colaborador — no ligados a un proyecto
 * (bono / ajuste / reembolso / extraordinario / otro). Los registra SOLO el
 * estudio; el colaborador únicamente los consulta en su portal.
 * Se espejan a FinanzApp como payable→gasto (best-effort). Ref propia por id.
 */

export const COLLAB_PAYMENT_CONCEPTS = [
  "bono",
  "ajuste",
  "reembolso",
  "extraordinario",
  "otro",
] as const
export type CollabPaymentConcept = (typeof COLLAB_PAYMENT_CONCEPTS)[number]

const CONCEPT_LABEL: Record<string, string> = {
  bono: "Bono",
  ajuste: "Ajuste",
  reembolso: "Reembolso",
  extraordinario: "Pago extraordinario",
  otro: "Otro",
}

export type CreateCollabPaymentInput = {
  concept: CollabPaymentConcept
  description?: string | null
  amount: number
  status: "pending" | "paid"
  paymentMethod?: string | null
  paymentDate?: string | null // YYYY-MM-DD
  accountId?: string | null // cuenta FinanzApp si ya se paga
}

export type AdminCollabPayment = {
  id: string
  concept: string
  description: string | null
  amount: number
  status: string
  paymentMethod: string | null
  paymentDate: string | null
  paidAt: string | null
}

async function collaboratorName(studioId: string, collaboratorId: string): Promise<string> {
  const { data } = await untypedService()
    .from("collaborators")
    .select("name")
    .eq("id", collaboratorId)
    .eq("studio_id", studioId)
    .maybeSingle()
  return (data as { name?: string } | null)?.name ?? "Colaborador"
}

/** Registra un pago adicional (+ espejo a FinanzApp). */
export async function createCollaboratorPayment(
  studioId: string,
  actorId: string,
  collaboratorId: string,
  input: CreateCollabPaymentInput,
): Promise<{ id: string }> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("El monto debe ser mayor que cero")
  }
  // El colaborador debe existir y ser de este estudio.
  const { data: exists } = await untypedService()
    .from("collaborators")
    .select("id")
    .eq("id", collaboratorId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!exists) throw new Error("Colaborador no encontrado")

  const sb = untypedService()
  const now = new Date().toISOString()
  const isPaid = input.status === "paid"

  const { data, error } = await sb
    .from("collaborator_payments")
    .insert({
      studio_id: studioId,
      collaborator_id: collaboratorId,
      concept: input.concept,
      description: input.description?.trim() || null,
      amount: input.amount,
      status: input.status,
      payment_method: input.paymentMethod?.trim() || null,
      payment_date: input.paymentDate || (isPaid ? now.slice(0, 10) : null),
      paid_at: isPaid ? now : null,
      created_by: actorId,
    })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  const paymentId = (data as { id: string }).id

  // Espejo a FinanzApp (best-effort: no bloquea el registro).
  const name = await collaboratorName(studioId, collaboratorId)
  const label = CONCEPT_LABEL[input.concept] ?? "Pago"
  const notas = `${label}${input.description ? ` — ${input.description}` : ""} · a ${name}`
  try {
    await recordCollaboratorExtraPayable(studioId, {
      paymentId,
      acreedor: name,
      monto: input.amount,
      dueDate: input.paymentDate ?? null,
      notas,
    })
    if (isPaid) {
      await settleCollaboratorExtraPayable(studioId, {
        paymentId,
        accountId: input.accountId ?? null,
        paidAt: input.paymentDate ?? now,
        descripcion: `${label} a ${name}`,
      })
    }
    await sb
      .from("collaborator_payments")
      .update({ finanzapp_payable_ref: `crm-collab-extra:${paymentId}` })
      .eq("id", paymentId)
  } catch (e) {
    console.error("[collab-extra] espejo FinanzApp falló", e)
  }

  return { id: paymentId }
}

/** Marca un pago adicional pendiente como pagado (+ gasto en FinanzApp). */
export async function markCollaboratorPaymentPaid(
  studioId: string,
  paymentId: string,
  opts: { accountId?: string | null; paymentMethod?: string | null; paymentDate?: string | null } = {},
): Promise<{ ok: true }> {
  const sb = untypedService()
  const { data } = await sb
    .from("collaborator_payments")
    .select("id, status")
    .eq("id", paymentId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!data) throw new Error("Pago no encontrado")
  if ((data as { status: string }).status !== "pending") {
    throw new Error("Este pago ya no está pendiente")
  }
  const now = new Date().toISOString()
  const { error } = await sb
    .from("collaborator_payments")
    .update({
      status: "paid",
      paid_at: now,
      payment_method: opts.paymentMethod?.trim() || null,
      payment_date: opts.paymentDate || now.slice(0, 10),
      updated_at: now,
    })
    .eq("id", paymentId)
    .eq("studio_id", studioId)
  if (error) throw new Error(error.message)

  try {
    await settleCollaboratorExtraPayable(studioId, {
      paymentId,
      accountId: opts.accountId ?? null,
      paidAt: opts.paymentDate ?? now,
    })
  } catch (e) {
    console.error("[collab-extra] settle FinanzApp falló", e)
  }
  return { ok: true }
}

/** Cancela (soft-delete) un pago adicional (+ anula el gasto/payable). */
export async function cancelCollaboratorPayment(
  studioId: string,
  paymentId: string,
): Promise<{ ok: true }> {
  const sb = untypedService()
  const now = new Date().toISOString()
  const { error } = await sb
    .from("collaborator_payments")
    .update({ status: "cancelled", deleted_at: now, updated_at: now })
    .eq("id", paymentId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
  if (error) throw new Error(error.message)
  try {
    await cancelCollaboratorExtraPayable(studioId, paymentId)
  } catch (e) {
    console.error("[collab-extra] cancel FinanzApp falló", e)
  }
  return { ok: true }
}

/** Lista los pagos adicionales de un colaborador (vista admin). */
export async function listCollaboratorPaymentsForAdmin(
  studioId: string,
  collaboratorId: string,
): Promise<AdminCollabPayment[]> {
  const { data } = await untypedService()
    .from("collaborator_payments")
    .select("id, concept, description, amount, status, payment_method, payment_date, paid_at")
    .eq("studio_id", studioId)
    .eq("collaborator_id", collaboratorId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    concept: (r.concept as string) ?? "otro",
    description: (r.description as string | null) ?? null,
    amount: Number(r.amount ?? 0),
    status: (r.status as string) ?? "pending",
    paymentMethod: (r.payment_method as string | null) ?? null,
    paymentDate: (r.payment_date as string | null) ?? null,
    paidAt: (r.paid_at as string | null) ?? null,
  }))
}
