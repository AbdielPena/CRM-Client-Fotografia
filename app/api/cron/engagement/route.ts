import { NextResponse, type NextRequest } from "next/server"

import { runEngagementCron } from "@/server/services/engagement.service"

/**
 * Cron del Client Engagement Hub: escanea triggers por fecha (cumpleaños /
 * inactividad) creando inscripciones, y avanza las inscripciones listas
 * ejecutando sus pasos (espera / enviar email). Correr cada 15-60 min.
 *
 * Auth: `Authorization: Bearer <ENGAGEMENT_CRON_TOKEN>` (fallback TASK_REMINDERS_CRON_TOKEN).
 */
export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const expected = process.env.ENGAGEMENT_CRON_TOKEN || process.env.TASK_REMINDERS_CRON_TOKEN
  if (!expected) {
    return NextResponse.json({ error: "ENGAGEMENT_CRON_TOKEN no configurado" }, { status: 500 })
  }
  if (token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await runEngagementCron()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: "ENGAGEMENT_CRON_FAILED", message: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json({ error: "Use POST con Authorization header" }, { status: 405 })
}
