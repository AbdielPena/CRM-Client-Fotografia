import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"
import { createId } from "@paralleldrive/cuid2"
import { SUPABASE_URL } from "@/server/supabase/env"
import { recordIncomeFromInvoice } from "@/server/services/fin-transaction.service"

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
          .select("id, total, currency, client_id")
          .eq("id", invoiceId)
          .eq("studio_id", studioId)
          .is("deleted_at", null)
          .maybeSingle()

        if (!invoice) break

        const amountPaid = pi.amount_received / 100 // Stripe usa centavos

        // El trigger `apply_payment_to_invoice` recalcula amount_paid/status automáticamente.
        const { error: insertError } = await admin.from("payments").insert({
          id: createId(),
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

        // Cross-módulo F5 wire-up: crear fin_transactions.income idempotente
        // (external_reference UNIQUE garantiza no duplicados en webhook retries).
        // Non-fatal: si falla, el payment ya está registrado y el income se
        // puede recrear manualmente desde /finance/transactions.
        try {
          const result = await recordIncomeFromInvoice(studioId, "stripe-webhook", {
            invoiceId,
            amount: amountPaid,
            currency: pi.currency.toUpperCase(),
            paidAt: new Date().toISOString(),
            paymentReference: pi.id,
            clientId: (invoice as { client_id: string | null }).client_id ?? undefined,
          })
          if (result.alreadyExisted) {
            console.log(
              `[Stripe→Finance] income already existed for invoice ${invoiceId} (idempotent retry)`,
            )
          } else {
            console.log(
              `[Stripe→Finance] income created tx_id=${result.transactionId} for invoice ${invoiceId}`,
            )
          }
        } catch (finErr) {
          console.warn(
            `[Stripe→Finance] recordIncomeFromInvoice failed (non-fatal, payment registered):`,
            finErr,
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
