"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireStudioAuth } from "@/server/middleware/auth"
import { createFinDebt } from "@/server/services/fin-debt.service"
import { createFinLoan } from "@/server/services/fin-loan.service"
import { createFinGoal } from "@/server/services/fin-goal.service"

/**
 * Server Actions agrupadas para debt/loan/goal — 3 entities con CRUD muy
 * simple comparten un archivo para evitar 3 archivos casi-idénticos.
 */

export type FinActionState = {
  ok?: boolean
  message?: string
  fieldErrors?: Record<string, string[]>
  values?: Record<string, string>
}

function collectValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  formData.forEach((v, k) => {
    if (typeof v === "string") out[k] = v
  })
  return out
}

// ---------------------------------------------------------------------------
// Debt
// ---------------------------------------------------------------------------

export async function createFinDebtAction(
  _prev: FinActionState,
  formData: FormData,
): Promise<FinActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)
  const acreedor = formData.get("acreedor") as string
  const monto = Number(formData.get("montoOriginal"))
  if (!acreedor || acreedor.length < 2) {
    return { ok: false, message: "Acreedor requerido.", values }
  }
  if (!monto || monto <= 0) {
    return { ok: false, message: "Monto debe ser mayor a 0.", values }
  }

  let id: string
  try {
    const d = await createFinDebt(session.studioId, session.userId, {
      acreedor,
      montoOriginal: monto,
      currency: (formData.get("currency") as string) || "DOP",
      cuotasTotal: formData.get("cuotasTotal")
        ? Number(formData.get("cuotasTotal"))
        : undefined,
      montoCuota: formData.get("montoCuota")
        ? Number(formData.get("montoCuota"))
        : undefined,
      tasaInteres: formData.get("tasaInteres")
        ? Number(formData.get("tasaInteres"))
        : undefined,
      fechaInicio: (formData.get("fechaInicio") as string) || undefined,
      fechaProximoPago: (formData.get("fechaProximoPago") as string) || undefined,
    })
    id = d.id
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido.",
      values,
    }
  }

  revalidatePath("/finance/debts")
  redirect(`/finance/debts/${id}`)
}

// ---------------------------------------------------------------------------
// Loan otorgado
// ---------------------------------------------------------------------------

export async function createFinLoanAction(
  _prev: FinActionState,
  formData: FormData,
): Promise<FinActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)
  const deudor = formData.get("deudor") as string
  const monto = Number(formData.get("montoOriginal"))
  if (!deudor || deudor.length < 2) {
    return { ok: false, message: "Deudor requerido.", values }
  }
  if (!monto || monto <= 0) {
    return { ok: false, message: "Monto debe ser mayor a 0.", values }
  }

  let id: string
  try {
    const l = await createFinLoan(session.studioId, session.userId, {
      deudor,
      montoOriginal: monto,
      currency: (formData.get("currency") as string) || "DOP",
      fechaInicio: (formData.get("fechaInicio") as string) || undefined,
      cuentaSalida: (formData.get("cuentaSalida") as string) || undefined,
    })
    id = l.id
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido.",
      values,
    }
  }

  revalidatePath("/finance/loans")
  redirect(`/finance/loans/${id}`)
}

// ---------------------------------------------------------------------------
// Goal
// ---------------------------------------------------------------------------

export async function createFinGoalAction(
  _prev: FinActionState,
  formData: FormData,
): Promise<FinActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)
  const nombre = formData.get("nombre") as string
  const monto = Number(formData.get("montoObjetivo"))
  if (!nombre || nombre.length < 2) {
    return { ok: false, message: "Nombre requerido.", values }
  }
  if (!monto || monto <= 0) {
    return { ok: false, message: "Monto objetivo debe ser mayor a 0.", values }
  }

  let id: string
  try {
    const g = await createFinGoal(session.studioId, session.userId, {
      nombre,
      montoObjetivo: monto,
      currency: (formData.get("currency") as string) || "DOP",
      fechaObjetivo: (formData.get("fechaObjetivo") as string) || null,
      cuentaId: (formData.get("cuentaId") as string) || null,
    })
    id = g.id
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido.",
      values,
    }
  }

  revalidatePath("/finance/goals")
  redirect(`/finance/goals/${id}`)
}
