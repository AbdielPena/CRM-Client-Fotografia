"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createFinPayable,
  recordPayablePayment,
} from "@/server/services/fin-payable.service"

export type FinPayableActionState = {
  ok?: boolean
  message?: string
  fieldErrors?: Record<string, string[]>
  payableId?: string
  values?: Record<string, string>
}

function collectValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  formData.forEach((v, k) => {
    if (typeof v === "string") out[k] = v
  })
  return out
}

export async function createFinPayableAction(
  _prev: FinPayableActionState,
  formData: FormData,
): Promise<FinPayableActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)
  const acreedor = formData.get("acreedor") as string | null
  const monto = Number(formData.get("monto"))
  if (!acreedor || acreedor.length < 2) {
    return {
      ok: false,
      message: "Acreedor requerido (mínimo 2 caracteres).",
      fieldErrors: { acreedor: ["Acreedor requerido"] },
      values,
    }
  }
  if (!monto || monto <= 0) {
    return {
      ok: false,
      message: "Monto debe ser mayor a 0.",
      fieldErrors: { monto: ["Monto inválido"] },
      values,
    }
  }

  let payableId: string
  try {
    const p = await createFinPayable(session.studioId, session.userId, {
      acreedor,
      monto,
      currency: (formData.get("currency") as string) || "DOP",
      fechaEmision: (formData.get("fechaEmision") as string) || undefined,
      fechaVenc: (formData.get("fechaVenc") as string) || undefined,
      beneficiaryId: (formData.get("beneficiaryId") as string) || undefined,
      notas: (formData.get("notas") as string) || undefined,
    })
    payableId = p.id
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido.",
      values,
    }
  }

  revalidatePath("/finance/payables")
  redirect(`/finance/payables/${payableId}`)
}

export async function recordPayablePaymentAction(
  _prev: FinPayableActionState,
  formData: FormData,
): Promise<FinPayableActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const payableId = formData.get("payableId") as string
  const monto = Number(formData.get("monto"))
  const fecha = formData.get("fecha") as string

  if (!payableId || !monto || !fecha) {
    return { ok: false, message: "Datos incompletos." }
  }

  try {
    const result = await recordPayablePayment(
      session.studioId,
      session.userId,
      {
        payableId,
        monto,
        fecha,
        cuentaId: (formData.get("cuentaId") as string) || undefined,
        notas: (formData.get("notas") as string) || undefined,
      },
    )
    revalidatePath(`/finance/payables/${payableId}`)
    revalidatePath("/finance/payables")
    return {
      ok: true,
      message: `Pago registrado. Acumulado: ${result.montoPagado}.`,
      payableId,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error."
    const messages: Record<string, string> = {
      FIN_PAYABLE_NOT_FOUND: "CxP no encontrada.",
      FIN_PAYABLE_ALREADY_PAID: "Esta CxP ya está pagada.",
      FIN_PAYABLE_CANCELLED: "Esta CxP está cancelada.",
      FIN_PAYABLE_PAYMENT_EXCEEDS: "Monto excede balance pendiente.",
    }
    return { ok: false, message: messages[msg] ?? msg }
  }
}
