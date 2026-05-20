import { NextResponse, type NextRequest } from "next/server"

import { retryFailedWebhookDeliveries } from "@/server/services/outbound-webhook.service"

/**
 * Cron job: re-intenta deliveries fallidos con backoff exponencial.
 * Sugerencia: cada 5 minutos.
 *
 * Auth: Authorization: Bearer <WEBHOOK_RETRY_CRON_TOKEN>
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const expected = process.env.WEBHOOK_RETRY_CRON_TOKEN
  if (!expected) {
    return NextResponse.json(
      { error: "WEBHOOK_RETRY_CRON_TOKEN no configurado" },
      { status: 500 },
    )
  }
  if (token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await retryFailedWebhookDeliveries()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      {
        error: "RETRY_FAILED",
        message: err instanceof Error ? err.message : "Unknown",
      },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Use POST con Authorization header" },
    { status: 405 },
  )
}
