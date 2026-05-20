import { NextResponse, type NextRequest } from "next/server"

import { renewExpiringCalendarWatches } from "@/server/services/google-calendar.service"

/**
 * Cron diario que renueva los watches de Google Calendar que están a punto
 * de expirar (<24h).
 *
 * Google watches expiran cada ~7 días, así que ejecutar diariamente garantiza
 * que ninguno caduque silenciosamente.
 *
 * Auth: `Authorization: Bearer <GOOGLE_WATCH_CRON_TOKEN>` env var.
 *
 * Llamado desde:
 *   - Supabase pg_cron via http extension (recomendado)
 *   - Vercel cron en vercel.json: { "path": "/api/cron/google-watches", "schedule": "0 4 * * *" }
 *   - cron de VPS via curl
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const expected = process.env.GOOGLE_WATCH_CRON_TOKEN
  if (!expected) {
    return NextResponse.json(
      { error: "GOOGLE_WATCH_CRON_TOKEN no configurado" },
      { status: 500 },
    )
  }
  if (token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await renewExpiringCalendarWatches()
    return NextResponse.json({
      renewed: result.renewed,
      failed: result.failed,
      errors: result.errors,
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: "RENEW_FAILED",
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
