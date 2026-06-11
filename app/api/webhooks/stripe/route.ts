import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"
import { createId } from "@paralleldrive/cuid2"
import { SUPABASE_URL } from "@/server/supabase/env"
import { recordIncomeToFinanzApp } from "@/server/services/finanzapp-bridge.service"
import { mirrorPaymentToFacturacion } from "@/server/services/facturacion-bridge.service"

// Stripe webhook necesita service role para bypass de RLS.
// El secret SUPABASE_SERVICE_ROLE_KEY NO se expone al cliente.
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-06-20",
})

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get("stripe-signature")

  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET ?? "")
  } catch (err) {
    console.error("[Stripe webhook] Signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  // Cliente admin (service role) — bypasses RLS para webhooks confiables.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent
        const invoiceId = pi.metadata?.invoiceId
        const studioId = pi.metadata?.studioId

        if (!invoiceId || !studioId) break

        const { data: invoice } = await admin
          .from("invoices")
          .select("id, total, currency, client_id, invoice_number, client:clients(name)")
          .eq("id", invoiceId)
          .eq("studio_id", studioId)
          .is("deleted_at", null)
          .maybeSingle()

        if (!invoice) break

        const amountPaid = pi.amount_received / 100 // Stripe usa centavos
        const paymentId = createId()

        // El trigger `apply_payment_to_invoice` recalcula amount_paid/status automáticamente.
        const { error: insertError } = await admin.from("payments").insert({
          id: paymentId,
          studio_id: studioId,
          invoice_id: invoiceId,
          amount: amountPaid,
          currency: pi.currency.toUpperCase(),
          method: "stripe",
          status: "completed",
          transaction_reference: pi.id,
          stripe_payment_intent_id: pi.id,
          received_at: new Date().toISOString(),
        })

        if (insertError) {
          console.error("[Stripe webhook] payment insert failed:", insertError)
          return NextResponse.json({ error: "DB error" }, { status: 500 })
        }

        console.log(`[Stripe] Payment recorded for invoice ${invoiceId}: $${amountPaid}`)

        // Wire-up CRM → FinanzApp (fi.abbypixel.com): registrar el ingreso en
        // la app de finanzas del usuario (cuenta default del studio).
        // Idempotente vía external_reference = crm-payment:<id>.
        // Non-fatal: si falla, el payment ya está registrado en el CRM.
        try {
          const inv = invoice as {
            client_id: string | null
            invoice_number: string | null
            client?: { name?: string | null } | Array<{ name?: string | null }> | null
          }
          const clientRel = Array.isArray(inv.client) ? inv.client[0] : inv.client
          const result = await recordIncomeToFinanzApp(studioId, "stripe-webhook", {
            paymentId,
            amount: amountPaid,
            paidAt: new Date().toISOString(),
            description: `Pago factura ${inv.invoice_number ?? invoiceId.slice(0, 8)} (Stripe)`,
            clientName: clientRel?.name ?? null,
            reference: pi.id,
            currency: pi.currency.toUpperCase(),
          })
          if (result.skipped) {
            console.log(`[Stripe→FinanzApp] skipped (${result.skipped}) for invoice ${invoiceId}`)
          } else if (result.alreadyExisted) {
            console.log(
              `[Stripe→FinanzApp] income already existed for invoice ${invoiceId} (idempotent retry)`,
            )
          } else {
            console.log(
              `[Stripe→FinanzApp] income created tx_id=${result.transactionId} for invoice ${invoiceId}`,
            )
          }
        } catch (finErr) {
          console.warn(
            `[Stripe→FinanzApp] recordIncomeToFinanzApp failed (non-fatal, payment registered):`,
            finErr,
          )
        }

        // Espejo del pago en la app de Facturación (best-effort)
        try {
          await mirrorPaymentToFacturacion(studioId, invoiceId, {
            id: paymentId,
            amount: amountPaid,
            method: "stripe",
            reference: pi.id,
            receivedAt: new Date().toISOString(),
          })
        } catch (factErr) {
          console.warn(
            `[Stripe→Facturacion] mirror failed (non-fatal):`,
            factErr,
          )
        }
        break
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent
        console.error(
          `[Stripe] Payment failed for PI ${pi.id}:`,
          pi.last_payment_error?.message,
        )
        break
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        const invoiceId = session.metadata?.invoiceId
        if (!invoiceId || !session.payment_intent) break
        console.log(`[Stripe] Checkout completed for invoice ${invoiceId}`)
        break
      }

      default:
        console.log(`[Stripe webhook] Unhandled event type: ${event.type}`)
    }
  } catch (error) {
    console.error("[Stripe webhook] Handler error:", error)
    return NextResponse.json({ error: "Handler error" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
