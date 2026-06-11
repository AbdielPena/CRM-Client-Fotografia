"use server"

import { revalidatePath } from "next/cache"
import { requireStudioAuth } from "@/server/middleware/auth"
import { untypedService } from "@/server/supabase/untyped"
import {
  assignAccountToFinanzAppPayment,
  setDefaultFinanzAppAccount,
} from "@/server/services/finanzapp-bridge.service"

/**
 * Asigna una cuenta de FinanzApp a un pago del CRM que estaba pendiente
 * (o cambia la cuenta de uno que ya tenía). Actualiza:
 *   - payments.finanzapp_account_id (CRM)
 *   - finanzapp.transactions.cuenta_id de la tx con ref crm-payment:<id>
 * Las dos pasos se hacen best-effort independientes: si una falla,
 * registramos el error pero el otro se intenta.
 */
export async function assignAccountToPaymentAction(
  paymentId: string,
  accountId: string,
) {
  const session = await requireStudioAuth()

  if (!paymentId || !accountId) {
    return { success: false as const, error: "Falta paymentId o accountId" }
  }

  // 1) Actualizar payments del CRM (validando ownership)
  const sb = untypedService()
  const { error: updErr } = await sb
    .from("payments")
    .update({ finanzapp_account_id: accountId })
    .eq("id", paymentId)
    .eq("studio_id", session.studioId)

  if (updErr) {
    return { success: false as const, error: "No se pudo actualizar el pago" }
  }

  // 2) Reflejar en FinanzApp (best-effort: el dato ya quedó en payments,
  //    pero queremos mantener consistencia con la app del usuario)
  try {
    await assignAccountToFinanzAppPayment(session.studioId, paymentId, accountId)
  } catch (err) {
    console.error("[assignAccountToPaymentAction] finanzapp sync failed:", err)
    // No fallamos el action: el dato del CRM ya quedó bien, y la sync
    // se puede re-disparar después; lo notamos pero el usuario ve éxito.
  }

  revalidatePath("/finance")
  return { success: true as const }
}

/** Cambia la cuenta default desde /finance (alias del de settings). */
export async function setDefaultAccountFromFinanceAction(
  accountId: string | null,
) {
  const session = await requireStudioAuth()
  try {
    await setDefaultFinanzAppAccount(session.studioId, session.userId, accountId)
    revalidatePath("/finance")
    revalidatePath("/settings")
    return { success: true as const }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo actualizar la cuenta"
    return { success: false as const, error: message }
  }
}
