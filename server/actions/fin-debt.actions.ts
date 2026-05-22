"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import { recordDebtPayment } from "@/server/services/fin-debt.service"
import { recordLoanPayment } from "@/server/services/fin-loan.service"
import { addGoalContribution } from "@/server/services/fin-goal.service"

/**
 * Server Actions agrupadas para record payment de debt/loan/goal.
 * Tres entities con flujos paralelos comparten archivo.
 */

export type RecordActionState = {
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
// Debt — record payment
// ---------------------------------------------------------------------------

export async function recordDebtPaymentAction(
  _prev: RecordActionState,
  formData: FormData,
): Promise<RecordActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const debtId = formData.get("debtId") as string
  const monto = Number(formData.get("monto"))
  const fecha = formData.get("fecha") as string

  if (!debtId || !monto || !fecha) {
    return { ok: false, message: "Datos incompletos." }
  }

  const values = collectValues(formData)

  try {
    const result = await recordDebtPayment(session.studioId, session.userId, {
      debtId,
      monto,
      fecha,
      cuentaId: (formData.get("cuentaId") as string) || undefined,
      notas: (formData.get("notas") as string) || undefined,
    })
    revalidatePath(`/finance/debts/${debtId}`)
    revalidatePath("/finance/debts")
    return {
      ok: true,
      message: `Pago registrado. Saldo restante: ${result.saldoRemaining} · Estado: ${result.estado}.`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido."
    const messages: Record<string, string> = {
      FIN_DEBT_NOT_FOUND: "Deuda no encontrada.",
      FIN_DEBT_ALREADY_PAID: "Esta deuda ya está pagada.",
      FIN_DEBT_CANCELLED: "Esta deuda está cancelada.",
      FIN_DEBT_PAYMENT_EXCEEDS: "El monto excede el saldo pendiente.",
    }
    return { ok: false, message: messages[msg] ?? msg, values }
  }
}

// ---------------------------------------------------------------------------
// Loan — record payment (cobro)
// ---------------------------------------------------------------------------

export async function recordLoanPaymentAction(
  _prev: RecordActionState,
  formData: FormData,
): Promise<RecordActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const loanId = formData.get("loanId") as string
  const monto = Number(formData.get("monto"))
  const fecha = formData.get("fecha") as string

  if (!loanId || !monto || !fecha) {
    return { ok: false, message: "Datos incompletos." }
  }

  const values = collectValues(formData)

  try {
    const result = await recordLoanPayment(session.studioId, session.userId, {
      loanId,
      monto,
      fecha,
      cuentaEntrada: (formData.get("cuentaEntrada") as string) || undefined,
      notas: (formData.get("notas") as string) || undefined,
    })
    revalidatePath(`/finance/loans/${loanId}`)
    revalidatePath("/finance/loans")
    return {
      ok: true,
      message: `Cobro registrado. Saldo restante: ${result.saldoRemaining}.`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido."
    const messages: Record<string, string> = {
      FIN_LOAN_NOT_FOUND: "Préstamo no encontrado.",
      FIN_LOAN_ALREADY_COLLECTED: "Este préstamo ya fue cobrado.",
      FIN_LOAN_CANCELLED: "Este préstamo está cancelado.",
      FIN_LOAN_PAYMENT_EXCEEDS: "El monto excede el saldo pendiente.",
    }
    return { ok: false, message: messages[msg] ?? msg, values }
  }
}

// ---------------------------------------------------------------------------
// Goal — add contribution
// ---------------------------------------------------------------------------

export async function addGoalContributionAction(
  _prev: RecordActionState,
  formData: FormData,
): Promise<RecordActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const goalId = formData.get("goalId") as string
  const monto = Number(formData.get("monto"))
  const fecha = formData.get("fecha") as string

  if (!goalId || !monto || !fecha) {
    return { ok: false, message: "Datos incompletos." }
  }

  const values = collectValues(formData)

  try {
    const result = await addGoalContribution(session.studioId, session.userId, {
      goalId,
      monto,
      fecha,
      transactionId: (formData.get("transactionId") as string) || undefined,
      notas: (formData.get("notas") as string) || undefined,
    })
    revalidatePath(`/finance/goals/${goalId}`)
    revalidatePath("/finance/goals")
    return {
      ok: true,
      message: result.reached
        ? `¡Meta alcanzada! Total acumulado: ${result.montoActual}`
        : `Aporte registrado. Acumulado: ${result.montoActual}.`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido."
    const messages: Record<string, string> = {
      FIN_GOAL_NOT_FOUND: "Meta no encontrada.",
      FIN_GOAL_CANCELLED: "Esta meta está cancelada.",
    }
    return { ok: false, message: messages[msg] ?? msg, values }
  }
}
