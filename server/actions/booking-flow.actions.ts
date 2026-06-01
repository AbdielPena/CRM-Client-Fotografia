"use server"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { untypedService } from "@/server/supabase/untyped"

export type NotifyPaymentResult =
  | { ok: true }
  | { ok: false; message: string }

/**
 * El cliente notifica que pagó por transferencia (paso del wizard de booking).
 * Crea un payment PENDING (vía RPC notify_payment_intent) y avisa al studio.
 * NO confirma el booking — eso lo hace el admin al confirmar el pago.
 *
 * Pública: se llama desde el wizard /b/[token] sin sesión. La RPC valida el
 * token del contrato (SECURITY DEFINER) — el token es la prueba de identidad.
 */
export async function notifyPaymentIntentAction(params: {
  token: string
  amount: number
  message?: string
  voucherUrl?: string
}): Promise<NotifyPaymentResult> {
  if (!params.token) return { ok: false, message: "Enlace inválido" }

  const rpc = untypedService()
  const { data: paymentId, error } = await rpc.rpc("notify_payment_intent", {
    p_signing_token: params.token,
    p_amount: params.amount,
    p_voucher_url: params.voucherUrl ?? null,
    p_message: params.message ?? null,
  })

  if (error) {
    console.error("[notifyPaymentIntentAction] rpc failed", error)
    const msg = String(error.message ?? "")
    if (msg.includes("CONTRACT_NOT_SIGNED"))
      return { ok: false, message: "Primero debes firmar el contrato." }
    if (msg.includes("NO_INVOICE"))
      return { ok: false, message: "Aún no hay factura generada." }
    if (msg.includes("INVALID_AMOUNT"))
      return { ok: false, message: "El monto no es válido." }
    return { ok: false, message: "No se pudo registrar el aviso de pago." }
  }

  // Avisar al studio (notificación in-app + email best-effort)
  try {
    await notifyStudioOfPayment(String(paymentId))
  } catch (err) {
    console.error("[notifyPaymentIntentAction] notify studio failed", err)
  }

  return { ok: true }
}

async function notifyStudioOfPayment(paymentId: string): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { data: pay } = await supabase
    .from("payments")
    .select(
      "id, studio_id, amount, currency, project_id, client:clients ( name ), studio:studios ( name, email )",
    )
    .eq("id", paymentId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = pay as any
  if (!p) return

  const client = Array.isArray(p.client) ? p.client[0] : p.client
  const studio = Array.isArray(p.studio) ? p.studio[0] : p.studio
  const clientName = client?.name ?? "Un cliente"

  // Notificación in-app al studio
  try {
    const { notify } = await import("@/server/services/notification.service")
    await notify({
      studioId: p.studio_id,
      type: "payment_received",
      title: "Aviso de pago recibido",
      body: `${clientName} notificó un pago de ${p.currency} ${Number(p.amount).toLocaleString()}. Verifica el voucher y confirma el pago para agendar la sesión.`,
      actionUrl: p.project_id ? `/projects/${p.project_id}` : null,
      relatedEntityType: "payment",
      relatedEntityId: p.id,
    })
  } catch (err) {
    console.error("[notifyStudioOfPayment] in-app notif failed", err)
  }
}
