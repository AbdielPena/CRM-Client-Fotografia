import "server-only"

import { createHmac, randomBytes } from "crypto"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"

/**
 * Service de webhooks salientes para que studios reciban eventos en sus
 * propios endpoints (Zapier, n8n, custom integrations).
 *
 * Patrón:
 *   1. CRUD de outbound_webhooks en /settings/webhooks
 *   2. Eventos del sistema (CRM/Finance/...) llaman dispatchOutboundWebhook
 *   3. Dispatcher: para cada webhook matching, POST con payload + HMAC
 *   4. Log en outbound_webhook_deliveries
 *   5. Retry exponencial via cron (next_retry_at)
 *   6. Auto-disable después de N failures consecutivos
 */

export type WebhookEventType =
  | "client.created"
  | "client.updated"
  | "client.deleted"
  | "lead.created"
  | "project.created"
  | "project.status_changed"
  | "project.completed"
  | "invoice.created"
  | "invoice.sent"
  | "invoice.paid"
  | "invoice.cancelled"
  | "payment.received"
  | "booking.received"
  | "booking.confirmed"
  | "gallery.created"
  | "gallery.published"
  | "gallery.viewed"
  | "task.created"
  | "task.completed"
  | "custom"

export type OutboundWebhookRow = {
  id: string
  studio_id: string
  name: string
  url: string
  events: WebhookEventType[]
  secret: string
  custom_headers: Record<string, string> | null
  is_active: boolean
  last_delivered_at: string | null
  last_status_code: number | null
  last_error: string | null
  total_deliveries: number
  total_failures: number
  consecutive_failures: number
  auto_disable_threshold: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

function generateSecret(): string {
  return "whsec_" + randomBytes(32).toString("hex")
}

function signPayload(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex")
}

// ============================================================================
// CRUD
// ============================================================================

export async function listOutboundWebhooks(
  studioId: string,
): Promise<OutboundWebhookRow[]> {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("outbound_webhooks")
    .select("*")
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (error) throwServiceError("WEBHOOK_LIST_FAILED", error, { studioId })
  return (data ?? []) as OutboundWebhookRow[]
}

export async function getOutboundWebhookById(
  studioId: string,
  webhookId: string,
): Promise<OutboundWebhookRow | null> {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("outbound_webhooks")
    .select("*")
    .eq("id", webhookId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) throwServiceError("WEBHOOK_GET_FAILED", error)
  return (data as OutboundWebhookRow) ?? null
}

export async function createOutboundWebhook(
  studioId: string,
  actorId: string,
  data: {
    name: string
    url: string
    events: WebhookEventType[]
    customHeaders?: Record<string, string>
  },
): Promise<{ webhook: OutboundWebhookRow; secret: string }> {
  const sb = untypedService()
  const secret = generateSecret()

  if (!data.name.trim()) throw new Error("WEBHOOK_NAME_REQUIRED")
  if (!data.url.trim()) throw new Error("WEBHOOK_URL_REQUIRED")
  if (!data.url.startsWith("https://")) {
    throw new Error("WEBHOOK_URL_MUST_BE_HTTPS")
  }

  const { data: row, error } = await sb
    .from("outbound_webhooks")
    .insert({
      studio_id: studioId,
      name: data.name.trim(),
      url: data.url.trim(),
      events: data.events,
      secret,
      custom_headers: data.customHeaders ?? null,
      is_active: true,
      created_by: actorId,
    })
    .select("*")
    .single()

  if (error) throwServiceError("WEBHOOK_CREATE_FAILED", error, { studioId })

  const webhook = row as OutboundWebhookRow
  await logActivity({
    studioId,
    actorId,
    entityType: "outbound_webhook",
    entityId: webhook.id,
    action: "outbound_webhook.created",
    metadata: { name: webhook.name, url: webhook.url, events: webhook.events },
  })

  return { webhook, secret }
}

export async function updateOutboundWebhook(
  studioId: string,
  actorId: string,
  webhookId: string,
  data: Partial<{
    name: string
    url: string
    events: WebhookEventType[]
    customHeaders: Record<string, string> | null
    isActive: boolean
  }>,
): Promise<void> {
  const sb = untypedService()
  const patch: Record<string, unknown> = {}
  if (data.name !== undefined) patch.name = data.name
  if (data.url !== undefined) patch.url = data.url
  if (data.events !== undefined) patch.events = data.events
  if (data.customHeaders !== undefined)
    patch.custom_headers = data.customHeaders
  if (data.isActive !== undefined) {
    patch.is_active = data.isActive
    if (data.isActive) {
      patch.consecutive_failures = 0 // reset al re-activar
    }
  }

  const { error } = await sb
    .from("outbound_webhooks")
    .update(patch)
    .eq("id", webhookId)
    .eq("studio_id", studioId)

  if (error) throwServiceError("WEBHOOK_UPDATE_FAILED", error)

  await logActivity({
    studioId,
    actorId,
    entityType: "outbound_webhook",
    entityId: webhookId,
    action: "outbound_webhook.updated",
    metadata: { keys: Object.keys(patch) },
  })
}

export async function deleteOutboundWebhook(
  studioId: string,
  actorId: string,
  webhookId: string,
): Promise<void> {
  const sb = untypedService()
  const { error } = await sb
    .from("outbound_webhooks")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", webhookId)
    .eq("studio_id", studioId)
  if (error) throwServiceError("WEBHOOK_DELETE_FAILED", error)

  await logActivity({
    studioId,
    actorId,
    entityType: "outbound_webhook",
    entityId: webhookId,
    action: "outbound_webhook.deleted",
  })
}

// ============================================================================
// Dispatcher
// ============================================================================

/**
 * Despacha un evento a TODOS los webhooks suscritos del studio.
 * Best-effort: errores se loguean en outbound_webhook_deliveries, no fallan
 * la operación principal.
 *
 * Si el webhook falla muchas veces consecutivas, se auto-desactiva.
 */
export async function dispatchOutboundWebhook(opts: {
  studioId: string
  eventType: WebhookEventType
  payload: Record<string, unknown>
  entityType?: string
  entityId?: string
}): Promise<{ dispatched: number; succeeded: number; failed: number }> {
  const sb = untypedService()

  const { data: webhooks, error } = await sb
    .from("outbound_webhooks")
    .select("*")
    .eq("studio_id", opts.studioId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .contains("events", [opts.eventType])

  if (error) {
    console.error("[outbound-webhook] list failed:", error)
    return { dispatched: 0, succeeded: 0, failed: 0 }
  }

  const matchingWebhooks = (webhooks ?? []) as OutboundWebhookRow[]
  if (matchingWebhooks.length === 0) {
    return { dispatched: 0, succeeded: 0, failed: 0 }
  }

  const results = await Promise.allSettled(
    matchingWebhooks.map((wh) => deliverWebhook(wh, opts)),
  )

  const succeeded = results.filter(
    (r) => r.status === "fulfilled" && (r.value as { success: boolean }).success,
  ).length

  return {
    dispatched: matchingWebhooks.length,
    succeeded,
    failed: matchingWebhooks.length - succeeded,
  }
}

async function deliverWebhook(
  webhook: OutboundWebhookRow,
  ctx: {
    studioId: string
    eventType: WebhookEventType
    payload: Record<string, unknown>
    entityType?: string
    entityId?: string
  },
): Promise<{ success: boolean; deliveryId?: string }> {
  const sb = untypedService()

  const envelope = {
    id: crypto.randomUUID(),
    event: ctx.eventType,
    created_at: new Date().toISOString(),
    studio_id: ctx.studioId,
    entity_type: ctx.entityType ?? null,
    entity_id: ctx.entityId ?? null,
    data: ctx.payload,
  }

  const bodyString = JSON.stringify(envelope)
  const signature = signPayload(webhook.secret, bodyString)

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-PixelOS-Event": ctx.eventType,
    "X-PixelOS-Delivery-Id": envelope.id,
    "X-PixelOS-Signature": `sha256=${signature}`,
    "User-Agent": "PixelOS-Webhook/1.0",
  }
  if (webhook.custom_headers) {
    Object.assign(headers, webhook.custom_headers)
  }

  const startedAt = Date.now()
  let success = false
  let responseStatus: number | undefined
  let responseBody: string | undefined
  let errorMessage: string | undefined

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15_000)

    const res = await fetch(webhook.url, {
      method: "POST",
      headers,
      body: bodyString,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId))

    responseStatus = res.status
    responseBody = await res.text().catch(() => "")
    success = res.status >= 200 && res.status < 300
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Unknown"
    success = false
  }

  const durationMs = Date.now() - startedAt

  // Log delivery
  const { data: deliveryRow } = await sb
    .from("outbound_webhook_deliveries")
    .insert({
      studio_id: webhook.studio_id,
      webhook_id: webhook.id,
      event_type: ctx.eventType,
      event_payload: envelope,
      request_method: "POST",
      request_url: webhook.url,
      request_headers: headers,
      request_body: bodyString,
      response_status: responseStatus ?? null,
      response_body: responseBody?.slice(0, 5000) ?? null,
      response_time_ms: durationMs,
      success,
      error_message: errorMessage ?? null,
      attempt_number: 1,
      next_retry_at: success
        ? null
        : new Date(Date.now() + 60_000).toISOString(), // 1 min retry
    })
    .select("id")
    .maybeSingle()

  // Update webhook stats
  const newConsecutiveFailures = success
    ? 0
    : webhook.consecutive_failures + 1
  const shouldAutoDisable =
    newConsecutiveFailures >= webhook.auto_disable_threshold

  await sb
    .from("outbound_webhooks")
    .update({
      last_delivered_at: new Date().toISOString(),
      last_status_code: responseStatus ?? null,
      last_error: errorMessage ?? null,
      total_deliveries: webhook.total_deliveries + 1,
      total_failures: success
        ? webhook.total_failures
        : webhook.total_failures + 1,
      consecutive_failures: newConsecutiveFailures,
      is_active: shouldAutoDisable ? false : webhook.is_active,
    })
    .eq("id", webhook.id)

  return {
    success,
    deliveryId: (deliveryRow as { id: string } | null)?.id,
  }
}

/**
 * Cron job: re-intenta deliveries fallidos con next_retry_at <= now.
 * Backoff exponencial: attempt 1 → 1min, 2 → 5min, 3 → 30min, 4 → 4h, 5 → 24h.
 */
export async function retryFailedWebhookDeliveries(): Promise<{
  retried: number
  succeeded: number
}> {
  const sb = untypedService()
  const now = new Date().toISOString()

  const { data, error } = await sb
    .from("outbound_webhook_deliveries")
    .select(
      `*,
       webhook:outbound_webhooks(*)`,
    )
    .eq("success", false)
    .lte("next_retry_at", now)
    .lte("attempt_number", 5)
    .limit(50)

  if (error) {
    console.error("[webhook-retry] list failed:", error)
    return { retried: 0, succeeded: 0 }
  }

  type DeliveryWithWebhook = {
    id: string
    studio_id: string
    event_type: WebhookEventType
    event_payload: Record<string, unknown>
    attempt_number: number
    webhook: OutboundWebhookRow | null
  }
  const deliveries = (data ?? []) as DeliveryWithWebhook[]

  let retried = 0
  let succeeded = 0

  for (const d of deliveries) {
    if (!d.webhook || !d.webhook.is_active || d.webhook.deleted_at) continue
    retried++

    const result = await deliverWebhook(d.webhook, {
      studioId: d.studio_id,
      eventType: d.event_type,
      payload:
        (d.event_payload?.data as Record<string, unknown>) ?? d.event_payload,
    })

    // Marcar el delivery viejo como retried y actualizar next_retry_at del nuevo
    const nextAttempt = d.attempt_number + 1
    const backoffMs =
      nextAttempt === 2
        ? 5 * 60_000
        : nextAttempt === 3
          ? 30 * 60_000
          : nextAttempt === 4
            ? 4 * 60 * 60_000
            : 24 * 60 * 60_000

    await sb
      .from("outbound_webhook_deliveries")
      .update({
        success: result.success,
        attempt_number: nextAttempt,
        next_retry_at: result.success
          ? null
          : new Date(Date.now() + backoffMs).toISOString(),
      })
      .eq("id", d.id)

    if (result.success) succeeded++
  }

  return { retried, succeeded }
}
