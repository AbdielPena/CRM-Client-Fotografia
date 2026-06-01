/**
 * Hook post-firma — dispara los emails correctos según quién firmó, y en el
 * flujo de booking nuevo: genera la factura + avanza el booking a
 * awaiting_payment + notifica al cliente.
 *
 * Lógica de emails:
 *   - Solo cliente firmó       → emailContractSignedByClient (notif al studio)
 *   - Solo studio firmó        → emailContractSignedByStudio (al cliente)
 *   - Ambos firmaron           → además emailContractFinalCopy (a ambos)
 *
 * Lógica de booking (solo cuando el CLIENTE acaba de firmar):
 *   - generate_booking_invoice(project) → 1 factura del total (idempotente)
 *   - booking_request: approved → awaiting_payment
 *   - email al cliente con la factura ("paga para confirmar")
 */

import "server-only"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import {
  emailContractFinalCopy,
  emailContractSignedByClient,
  emailContractSignedByStudio,
} from "@/server/services/contract-emails.service"
import { enqueueEmail } from "@/server/services/email.service"
import { formatCurrency } from "@/lib/utils/currency"

function appBaseUrl(): string {
  return (process.env["NEXT_PUBLIC_APP_URL"] ?? "").replace(/\/$/, "")
}

export async function onContractSigned(contractId: string): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { data: contract } = await supabase
    .from("contracts")
    .select(
      "id, signed_at, studio_signed_at, studio_id, project_id, booking_request_id",
    )
    .eq("id", contractId)
    .maybeSingle()
  if (!contract) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = contract as any

  const clientSigned = !!c.signed_at
  const studioSigned = !!c.studio_signed_at

  // Emails de contrato (igual que antes)
  if (clientSigned && !studioSigned) {
    await emailContractSignedByClient(contractId)
  } else if (studioSigned && !clientSigned) {
    await emailContractSignedByStudio(contractId)
  } else if (clientSigned && studioSigned) {
    const clientTs = c.signed_at ? new Date(c.signed_at).getTime() : 0
    const studioTs = c.studio_signed_at ? new Date(c.studio_signed_at).getTime() : 0
    if (clientTs > studioTs) {
      await emailContractSignedByClient(contractId)
    } else {
      await emailContractSignedByStudio(contractId)
    }
    await emailContractFinalCopy(contractId)
  }

  // Flujo de booking: cuando el CLIENTE firmó, generar factura + avanzar estado.
  // Best-effort: si algo falla, el contrato ya quedó firmado; el operador
  // puede generar la factura manualmente.
  if (clientSigned && c.project_id) {
    try {
      await generateInvoiceAndAdvanceBooking({
        studioId: c.studio_id,
        projectId: c.project_id,
        bookingRequestId: c.booking_request_id ?? null,
      })
    } catch (err) {
      console.error("[onContractSigned] generate invoice / advance booking failed", err)
    }
  }
}

async function generateInvoiceAndAdvanceBooking(params: {
  studioId: string
  projectId: string
  bookingRequestId: string | null
}): Promise<void> {
  const supabase = createSupabaseServiceClient()

  // 1. Generar (o recuperar) la factura única del proyecto — idempotente
  const { data: invoiceId, error: rpcErr } = await supabase.rpc(
    "generate_booking_invoice",
    { p_studio_id: params.studioId, p_project_id: params.projectId },
  )
  if (rpcErr) {
    console.error("[generateInvoiceAndAdvanceBooking] rpc failed", rpcErr)
    return
  }

  // 2. Avanzar el booking_request: approved → awaiting_payment (idempotente,
  //    solo si está en 'approved')
  if (params.bookingRequestId) {
    await supabase
      .from("booking_requests")
      .update({ status: "awaiting_payment" })
      .eq("id", params.bookingRequestId)
      .eq("status", "approved")
  }

  // 3. Email al cliente con la factura ("paga para confirmar")
  try {
    const { data: inv } = await supabase
      .from("invoices")
      .select(
        "id, total, currency, client:clients ( name, email ), studio:studios ( name, primary_color, email )",
      )
      .eq("id", invoiceId as string)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const i = inv as any
    const client = Array.isArray(i?.client) ? i.client[0] : i?.client
    const studio = Array.isArray(i?.studio) ? i.studio[0] : i?.studio
    if (i && client?.email && studio) {
      const color = studio.primary_color ?? "#7C3AED"
      const payUrl = `${appBaseUrl()}/i/${invoiceId}`
      const amount = formatCurrency(Number(i.total ?? 0), i.currency ?? "DOP")
      const html = `
        <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
          <h1 style="font-size: 20px; margin: 0 0 8px;">¡Gracias por firmar, ${escapeHtml(client.name ?? "")}!</h1>
          <p style="color: #4b5563; margin: 0 0 16px;">
            Tu contrato quedó firmado. El último paso para <strong>confirmar tu sesión</strong>
            es realizar el pago de tu factura por <strong>${escapeHtml(amount)}</strong>.
          </p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${escapeHtml(payUrl)}" style="display: inline-block; background: ${escapeHtml(color)}; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">Ver factura y pagar</a>
          </p>
          <p style="color: #6b7280; font-size: 13px; margin: 0;">
            Tu sesión quedará confirmada en cuanto recibamos el pago.
          </p>
        </div>`
      await enqueueEmail({
        studioId: params.studioId,
        toEmail: client.email,
        toName: client.name ?? null,
        subject: `Tu factura está lista — ${amount}`,
        bodyHtml: html,
        replyTo: studio.email ?? null,
        templateSlug: "booking_invoice_ready",
        relatedEntityType: "invoice",
        relatedEntityId: invoiceId as string,
      })
    }
  } catch (err) {
    console.error("[generateInvoiceAndAdvanceBooking] email failed", err)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
