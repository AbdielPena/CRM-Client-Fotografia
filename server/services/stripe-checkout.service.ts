import "server-only"

import Stripe from "stripe"

import { getPlanById, getStudioSubscription, updateStudioSubscription } from "./billing.service"

/**
 * Service Stripe Checkout / Customer Portal para SaaS subscriptions.
 *
 * Env vars requeridas:
 *   STRIPE_SECRET_KEY                  - sk_test_XX o sk_live_XX
 *   STRIPE_WEBHOOK_SECRET_BILLING      - whsec_XX para webhook signature
 *   NEXT_PUBLIC_APP_URL                - https://my.abbypixel.com (return_url)
 *
 * Patrón:
 *   1. createCheckoutSession(studioId, planId, interval) — para upgrades
 *   2. createPortalSession(studioId) — para cancel/update payment method
 *   3. handleWebhook(rawBody, signature) — procesa eventos de Stripe
 */

let stripeClient: Stripe | null = null

function getStripe(): Stripe {
  if (stripeClient) return stripeClient
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error("STRIPE_SECRET_KEY no configurado")
  stripeClient = new Stripe(key, { apiVersion: "2024-06-20" })
  return stripeClient
}

const APP_URL = () =>
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

// ============================================================================
// Checkout
// ============================================================================

export async function createCheckoutSession(opts: {
  studioId: string
  studioEmail: string
  studioName?: string
  planId: string
  interval: "month" | "year"
  successUrl?: string
  cancelUrl?: string
}): Promise<{ sessionId: string; url: string | null }> {
  const stripe = getStripe()

  const plan = await getPlanById(opts.planId)
  if (!plan) throw new Error("BILLING_PLAN_NOT_FOUND")

  const priceId =
    opts.interval === "year"
      ? plan.stripe_price_id_yearly
      : plan.stripe_price_id_monthly

  if (!priceId) {
    throw new Error(
      `BILLING_PRICE_NOT_CONFIGURED: plan "${plan.slug}" no tiene stripe_price_id para interval ${opts.interval}. Configurar en /admin/billing/plans.`,
    )
  }

  // Obtener customer_id existente si la suscripción ya está creada
  const subResult = await getStudioSubscription(opts.studioId)
  const existingCustomerId = subResult?.subscription.stripe_customer_id

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: existingCustomerId ?? undefined,
    customer_email: existingCustomerId ? undefined : opts.studioEmail,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: plan.trial_days ?? undefined,
      metadata: {
        studio_id: opts.studioId,
        plan_id: opts.planId,
        plan_slug: plan.slug,
      },
    },
    metadata: {
      studio_id: opts.studioId,
      plan_id: opts.planId,
      plan_slug: plan.slug,
    },
    success_url:
      opts.successUrl ??
      `${APP_URL()}/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: opts.cancelUrl ?? `${APP_URL()}/settings/billing?checkout=cancel`,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    locale: "es",
  })

  return { sessionId: session.id, url: session.url }
}

// ============================================================================
// Customer Portal
// ============================================================================

export async function createCustomerPortalSession(
  studioId: string,
): Promise<{ url: string }> {
  const stripe = getStripe()
  const subResult = await getStudioSubscription(studioId)
  const customerId = subResult?.subscription.stripe_customer_id

  if (!customerId) {
    throw new Error(
      "BILLING_NO_STRIPE_CUSTOMER: el studio no tiene customer en Stripe. Hacer checkout primero.",
    )
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${APP_URL()}/settings/billing`,
  })

  return { url: session.url }
}

// ============================================================================
// Webhook handler
// ============================================================================

/**
 * Procesa un evento del webhook de Stripe.
 *
 * Eventos manejados:
 *   - checkout.session.completed         → sub created (initial)
 *   - customer.subscription.created      → idem (idempotente)
 *   - customer.subscription.updated      → plan change / period renewal
 *   - customer.subscription.deleted      → cancelación
 *   - customer.subscription.trial_will_end → notify (no implementado V1)
 *   - invoice.paid                       → cache invoice
 *   - invoice.payment_failed             → status='past_due'
 */
export async function handleBillingWebhook(
  rawBody: string,
  signature: string,
): Promise<{ received: boolean; event: string; processed: boolean }> {
  const stripe = getStripe()
  const secret = process.env.STRIPE_WEBHOOK_SECRET_BILLING
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET_BILLING no configurado")
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret)
  } catch (err) {
    throw new Error(
      `WEBHOOK_SIGNATURE_INVALID: ${err instanceof Error ? err.message : "Unknown"}`,
    )
  }

  let processed = false

  switch (event.type) {
    case "checkout.session.completed":
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub =
        event.type === "checkout.session.completed"
          ? await stripe.subscriptions.retrieve(
              (event.data.object as Stripe.Checkout.Session)
                .subscription as string,
            )
          : (event.data.object as Stripe.Subscription)

      const studioId = (sub.metadata?.studio_id ?? null) as string | null
      const planId = (sub.metadata?.plan_id ?? null) as string | null
      if (!studioId || !planId) {
        console.error("[billing webhook] subscription sin metadata studio_id/plan_id")
        break
      }

      const status = sub.status as
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "incomplete"
        | "incomplete_expired"
        | "paused"

      await updateStudioSubscription("stripe-webhook", studioId, {
        planId,
        status,
        interval:
          sub.items.data[0]?.price.recurring?.interval === "year"
            ? "year"
            : "month",
        stripeCustomerId:
          typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        stripeSubscriptionId: sub.id,
        currentPeriodStart: new Date(
          sub.current_period_start * 1000,
        ).toISOString(),
        currentPeriodEnd: new Date(
          sub.current_period_end * 1000,
        ).toISOString(),
        trialEndsAt: sub.trial_end
          ? new Date(sub.trial_end * 1000).toISOString()
          : undefined,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        canceledAt: sub.canceled_at
          ? new Date(sub.canceled_at * 1000).toISOString()
          : undefined,
      })

      processed = true
      break
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription
      const studioId = (sub.metadata?.studio_id ?? null) as string | null
      if (!studioId) break

      await updateStudioSubscription("stripe-webhook", studioId, {
        status: "canceled",
        canceledAt: new Date().toISOString(),
      })

      processed = true
      break
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice
      const studioId = (inv.metadata?.studio_id ??
        inv.subscription_details?.metadata?.studio_id ??
        null) as string | null
      if (!studioId) break

      // Cache invoice
      const { untypedService } = await import("@/server/supabase/untyped")
      const sb = untypedService()

      const subscriptionId =
        typeof inv.subscription === "string"
          ? inv.subscription
          : inv.subscription?.id
      let dbSubId: string | null = null
      if (subscriptionId) {
        const { data: subRow } = await sb
          .from("billing_subscriptions")
          .select("id")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle()
        dbSubId = (subRow as { id: string } | null)?.id ?? null
      }

      await sb.from("billing_invoices").upsert(
        {
          studio_id: studioId,
          subscription_id: dbSubId,
          stripe_invoice_id: inv.id,
          amount_due: inv.amount_due / 100,
          amount_paid: inv.amount_paid / 100,
          currency: inv.currency.toUpperCase(),
          status: inv.status as
            | "draft"
            | "open"
            | "paid"
            | "uncollectible"
            | "void",
          period_start: inv.period_start
            ? new Date(inv.period_start * 1000).toISOString()
            : null,
          period_end: inv.period_end
            ? new Date(inv.period_end * 1000).toISOString()
            : null,
          hosted_invoice_url: inv.hosted_invoice_url ?? null,
          invoice_pdf_url: inv.invoice_pdf ?? null,
          issued_at: new Date(inv.created * 1000).toISOString(),
          paid_at:
            inv.status === "paid" && inv.status_transitions?.paid_at
              ? new Date(inv.status_transitions.paid_at * 1000).toISOString()
              : null,
          due_at: inv.due_date
            ? new Date(inv.due_date * 1000).toISOString()
            : null,
        },
        { onConflict: "stripe_invoice_id" },
      )

      // Si payment_failed, marcar sub como past_due
      if (event.type === "invoice.payment_failed") {
        await updateStudioSubscription("stripe-webhook", studioId, {
          status: "past_due",
        })
      }

      processed = true
      break
    }

    default:
      // Eventos no manejados — ACK pero no procesa
      processed = false
  }

  return { received: true, event: event.type, processed }
}
