"use server"

import { revalidatePath } from "next/cache"
import { requireStudioAuth } from "@/server/middleware/auth"
import { untypedService } from "@/server/supabase/untyped"
import {
  assignAccountToFinanzAppPayment,
  recordIncomeToFinanzApp,
  setDefaultFinanzAppAccount,
} from "@/server/services/finanzapp-bridge.service"

/**
 * Asigna una cuenta de FinanzApp a un pago del CRM. Garantiza que después
 * del action, la transacción EXISTE en FinanzApp con la cuenta elegida:
 *
 *   1. Actualiza payments.finanzapp_account_id (fuente de verdad del CRM).
 *   2. Intenta reasignar `cuenta_id` en la tx ya registrada de FinanzApp.
 *   3. Si la tx no existe (caso: pago creado antes del wire-up), la CREA
 *      retroactivamente con la cuenta elegida vía recordIncomeToFinanzApp
 *      — idempotente por external_reference, así re-clicks no duplican.
 */
export async function assignAccountToPaymentAction(
  paymentId: string,
  accountId: string,
) {
  const session = await requireStudioAuth()

  if (!paymentId || !accountId) {
    return { success: false as const, error: "Falta paymentId o accountId" }
  }

  // 1) Cargar el pago para validar ownership y tener los datos para el
  //    posible insert retroactivo en FinanzApp.
  const sb = untypedService()
  const { data: payment, error: loadErr } = await sb
    .from("payments")
    .select(
      `id, amount, currency, received_at, transaction_reference,
       invoice:invoices(invoice_number),
       client:clients(name)`,
    )
    .eq("id", paymentId)
    .eq("studio_id", session.studioId)
    .is("deleted_at", null)
    .maybeSingle()

  if (loadErr || !payment) {
    return { success: false as const, error: "Pago no encontrado" }
  }

  // 2) Persistir la cuenta en el CRM
  const { error: updErr } = await sb
    .from("payments")
    .update({ finanzapp_account_id: accountId })
    .eq("id", paymentId)
    .eq("studio_id", session.studioId)

  if (updErr) {
    return { success: false as const, error: "No se pudo actualizar el pago" }
  }

  // 3) Reasignar en FinanzApp. Si no existe la tx (updated=0), la creamos
  //    retroactivamente — cubre pagos viejos de antes del wire-up.
  try {
    const result = await assignAccountToFinanzAppPayment(
      session.studioId,
      paymentId,
      accountId,
    )

    if (result.ok && result.updated === 0) {
      // No había tx en FinanzApp → crearla con esta cuenta
      type Rec = Record<string, unknown>
      const p = payment as Rec
      const invRel = p.invoice as { invoice_number?: string | null } | Array<{ invoice_number?: string | null }> | null
      const inv = Array.isArray(invRel) ? invRel[0] : invRel
      const clientRel = p.client as { name?: string | null } | Array<{ name?: string | null }> | null
      const client = Array.isArray(clientRel) ? clientRel[0] : clientRel

      await recordIncomeToFinanzApp(session.studioId, session.userId, {
        paymentId,
        amount: Number(p.amount ?? 0),
        paidAt: (p.received_at as string | null) ?? undefined,
        accountId,
        preResolved: true,
        description: `Pago factura ${inv?.invoice_number ?? paymentId.slice(0, 8)}`,
        clientName: client?.name ?? null,
        reference: (p.transaction_reference as string | null) ?? null,
        currency: (p.currency as string | null) ?? "DOP",
      })
    }
  } catch (err) {
    console.error("[assignAccountToPaymentAction] finanzapp sync failed:", err)
    // El dato del CRM ya quedó bien; informamos pero no rompemos
    return {
      success: true as const,
      warning:
        "Cuenta asignada en el CRM pero no se pudo sincronizar con FinanzApp. Reintenta más tarde.",
    }
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
