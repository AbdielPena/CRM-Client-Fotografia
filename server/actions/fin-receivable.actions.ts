"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createFinReceivable,
  recordReceivablePayment,
  cancelFinReceivable,
  deleteFinReceivable,
} from "@/server/services/fin-receivable.service"
import {
  createFinReceivableSchema,
  recordReceivablePaymentSchema,
  type CreateFinReceivableInput,
  type RecordReceivablePaymentInput,
} from "@/lib/validations/fin-receivable.schema"

export type FinReceivableActionState = {
  ok?: boolean
  message?: string
  fieldErrors?: Record<string, string[]>
  receivableId?: string
  values?: Record<string, string>
}

function collectValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  formData.forEach((v, k) => {
    if (typeof v === "string") out[k] = v
  })
  return out
}

export async function createFinReceivableAction(
  _prev: FinReceivableActionState,
  formData: FormData,
): Promise<FinReceivableActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)
  const raw = {
    clientId: formData.get("clientId") || undefined,
    cliente: formData.get("cliente"),
    invoiceId: formData.get("invoiceId") || undefined,
    monto: formData.get("monto"),
    currency: formData.get("currency") || "DOP",
    fechaEmision: formData.get("fechaEmision") || undefined,
    fechaVenc: formData.get("fechaVenc") || undefined,
    notas: formData.get("notas") || undefined,
  }

  const parsed = createFinReceivableSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      message: "Validación falló.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      values,
    }
  }

  let receivableId: string
  try {
    const recv = await createFinReceivable(
      session.studioId,
      session.userId,
      parsed.data as CreateFinReceivableInput,
    )
    receivableId = recv.id
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error al crear CxC.",
      values,
    }
  }

  revalidatePath("/finance/receivables")
  redirect(`/finance/receivables/${receivableId}`)
}

export async function recordReceivablePaymentAction(
  _prev: FinReceivableActionState,
  formData: FormData,
): Promise<FinReceivableActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)
  const raw = {
    receivableId: formData.get("receivableId"),
    monto: formData.get("monto"),
    fecha: formData.get("fecha"),
    cuentaId: formData.get("cuentaId") || undefined,
    notas: formData.get("notas") || undefined,
  }

  const parsed = recordReceivablePaymentSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      message: "Validación falló.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      values,
    }
  }

  try {
    const result = await recordReceivablePayment(
      session.studioId,
      session.userId,
      parsed.data as RecordReceivablePaymentInput,
    )
    revalidatePath(`/finance/receivables/${parsed.data.receivableId}`)
    revalidatePath("/finance/receivables")
    return {
      ok: true,
      message: `Pago de ${parsed.data.monto} registrado. Estado: ${result.receivable.estado}.`,
      receivableId: parsed.data.receivableId,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido."
    const messages: Record<string, string> = {
      FIN_RECV_NOT_FOUND: "CxC no encontrada.",
      FIN_RECV_ALREADY_PAID: "Esta CxC ya está cobrada por completo.",
      FIN_RECV_CANCELLED: "Esta CxC está cancelada.",
      FIN_RECV_PAYMENT_EXCEEDS: "El monto excede el balance pendiente.",
    }
    return { ok: false, message: messages[msg] ?? msg, values }
  }
}

export async function cancelFinReceivableAction(
  receivableId: string,
  reason?: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }
  try {
    await cancelFinReceivable(
      session.studioId,
      session.userId,
      receivableId,
      reason ?? null,
    )
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido.",
    }
  }
  revalidatePath("/finance/receivables")
  return { ok: true, message: "CxC cancelada." }
}

export async function deleteFinReceivableAction(
  receivableId: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }
  try {
    await deleteFinReceivable(session.studioId, session.userId, receivableId)
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido.",
    }
  }
  revalidatePath("/finance/receivables")
  return { ok: true, message: "CxC movida a papelera." }
}
