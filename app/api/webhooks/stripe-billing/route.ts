import { NextResponse, type NextRequest } from "next/server"

import { handleBillingWebhook } from "@/server/services/stripe-checkout.service"

/**
 * Webhook de Stripe Billing (suscripciones SaaS).
 *
 * Distinto del webhook de invoices del CRM (`/api/webhooks/stripe`) — este
 * maneja solo los eventos de billing_subscriptions del SaaS.
 *
 * Setup en Stripe Dashboard:
 *   1. Crea un Endpoint webhook apuntando a:
 *      https://my.abbypixel.com/api/webhooks/stripe-billing
 *   2. Selecciona eventos: customer.subscription.* + checkout.session.completed
 *      + invoice.paid + invoice.payment_failed
 *   3. Copia el Signing secret a env STRIPE_WEBHOOK_SECRET_BILLING
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature")
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    )
  }

  const rawBody = await req.text()

  try {
    const result = await handleBillingWebhook(rawBody, signature)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[stripe-billing webhook] error:", message)

    // 400 si signature inválida (Stripe re-intenta solo en 5xx)
    if (message.includes("SIGNATURE_INVALID")) {
      return NextResponse.json({ error: message }, { status: 400 })
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Bloquear GET (Stripe usa POST)
export async function GET() {
  return NextResponse.json(
    { error: "Use POST con Stripe signature" },
    { status: 405 },
  )
}
