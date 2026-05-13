/**
 * Cliente del Studio Business Hub para emitir eventos federados.
 *
 * Uso:
 *   import { emitToHub } from "@/lib/hub-client"
 *   await emitToHub("client.created", { externalReference: `studioflow:${client.id}`, payload: {...} })
 *
 * El llamado es fire-and-forget: si el hub está caído, NO bloquea la operación local.
 * El hub deduplica por `external_reference`, así que retries son seguros.
 */

import { createHmac } from "node:crypto"

const HUB_URL = process.env.HUB_URL ?? "http://localhost:3100"
const HMAC_SECRET = process.env.HUB_HMAC_SECRET // misma key configurada en HMAC_SECRET_STUDIOFLOW del hub
const SYSTEM_ID = "studioflow"

export type HubEventPayload = {
  externalReference: string
  payload: Record<string, unknown>
  eventType: string
}

function signBody(secret: string, body: string, ts: number): string {
  const mac = createHmac("sha256", secret)
  mac.update(`${ts}.${body}`)
  return `t=${ts},sha256=${mac.digest("hex")}`
}

/**
 * Emite un evento al hub. No throwea si falla — log + continúa.
 * Para integridad fuerte, persiste en outbox table y reintenta vía worker.
 */
export async function emitToHub(
  eventType: string,
  args: { externalReference: string; payload: Record<string, unknown> }
): Promise<{ ok: boolean; error?: string }> {
  if (!HMAC_SECRET) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[hub-client] HUB_HMAC_SECRET no configurado; evento ignorado:", eventType)
    }
    return { ok: false, error: "secret_missing" }
  }

  const body = JSON.stringify({
    event_type: eventType,
    external_reference: args.externalReference,
    payload: args.payload,
    occurred_at: new Date().toISOString(),
  })
  const ts = Math.floor(Date.now() / 1000)
  const signature = signBody(HMAC_SECRET, body, ts)

  try {
    const res = await fetch(`${HUB_URL}/api/ingest/${SYSTEM_ID}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature": signature,
      },
      body,
      // Evitar que requests largos al hub bloqueen la respuesta al cliente.
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      console.error("[hub-client] emit failed", res.status, eventType, text)
      return { ok: false, error: `${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    console.error("[hub-client] emit threw", eventType, err)
    return { ok: false, error: err instanceof Error ? err.message : "unknown" }
  }
}

/**
 * Helper: emite y olvida (no awaita). Útil dentro de transacciones DB donde no
 * queremos bloquear si el hub está caído.
 */
export function emitToHubAsync(
  eventType: string,
  args: { externalReference: string; payload: Record<string, unknown> }
): void {
  void emitToHub(eventType, args)
}
