import { NextResponse, type NextRequest } from "next/server"

import { processTaskReminders } from "@/server/services/task.service"

/**
 * Cron job: procesa recordatorios de tasks pendientes cada 5 minutos.
 *
 * Auth: `Authorization: Bearer <TASK_REMINDERS_CRON_TOKEN>` env var.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const expected = process.env.TASK_REMINDERS_CRON_TOKEN
  if (!expected) {
    return NextResponse.json(
      { error: "TASK_REMINDERS_CRON_TOKEN no configurado" },
      { status: 500 },
    )
  }
  if (token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await processTaskReminders()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      {
        error: "TASK_REMINDERS_FAILED",
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
