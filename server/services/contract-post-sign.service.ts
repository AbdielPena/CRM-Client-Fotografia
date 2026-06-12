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
import { getEmailBranding } from "@/server/services/email-template.service"
import { wrapLuxuryEmail } from "@/lib/email/luxury-layout"
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

  // 1. Generar (o recuperar) la factura única del proyecto — idempotente.
  //    untypedService: la RPC generate_booking_invoice no está en los tipos
  //    generados (se creó por migración aparte). Mismo patrón que otras RPCs.
  const { untypedService } = await import("@/server/supabase/untyped")
  const rpcSvc = untypedService()
  const { data: invoiceId, error: rpcErr } = await rpcSvc.rpc(
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
      const payUrl = `${appBaseUrl()}/i/${invoiceId}`
      const amount = formatCurrency(Number(i.total ?? 0), i.currency ?? "DOP")
      const firstName = (client.name ?? "").trim().split(/\s+/)[0] || "¡Hola!"

      // Mismo marco luxury minimalista que el resto de los correos (header con
      // logo del estudio, tipografía, footer con redes/WhatsApp).
      const branding = await getEmailBranding(params.studioId)
      const inner = `
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#A1A1A6">Contrato firmado</p>
        <h1>¡Gracias por firmar, ${escapeHtml(firstName)}!</h1>
        <p>Tu contrato ya quedó firmado. Solo falta <strong>un último paso</strong> para dejar tu sesión <strong>100% confirmada</strong>: completar el pago de tu factura.</p>
        <div style="margin:26px 0;padding:22px 24px;background:#F7F7F9;border:1px solid #ECECEF;border-radius:16px;text-align:center">
          <p style="margin:0 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#A1A1A6">Total a pagar</p>
          <p style="margin:0;font-size:30px;font-weight:600;color:#1C1C1C;letter-spacing:-.02em">${escapeHtml(amount)}</p>
        </div>
        <p style="text-align:center;margin:24px 0 6px"><a class="btn" href="${escapeHtml(payUrl)}">Ver factura y pagar</a></p>
        <p style="font-size:13px;color:#6E6E73">Apartamos tu fecha en nuestra agenda apenas recibamos el pago. Si tienes cualquier duda, solo responde a este correo — estamos para ayudarte. ✨</p>`
      const html = wrapLuxuryEmail(inner, {
        studioName: studio.name ?? branding.studioName,
        logoUrl: branding.logoUrl,
        accent: branding.accent,
        footerHtml: branding.footerHtml,
        contactLine: branding.contactLine,
        whatsappUrl: branding.whatsappUrl,
        social: branding.social,
      })
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
