import { NextResponse, type NextRequest } from "next/server"

import { drainPendingDriveBackups } from "@/server/services/gallery-drive.service"

/**
 * Cron job: drena los respaldos de galería a Google Drive en estado 'pending'.
 * Sube bytes a Drive (necesita runtime Node). Correr cada 5-10 min.
 *
 * Auth: `Authorization: Bearer <DRIVE_CRON_TOKEN>` (fallback TASK_REMINDERS_CRON_TOKEN).
 */
export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const expected = process.env.DRIVE_CRON_TOKEN || process.env.TASK_REMINDERS_CRON_TOKEN
  if (!expected) {
    return NextResponse.json({ error: "DRIVE_CRON_TOKEN no configurado" }, { status: 500 })
  }
  if (token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await drainPendingDriveBackups(3)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: "DRIVE_BACKUP_FAILED", message: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json({ error: "Use POST con Authorization header" }, { status: 405 })
}
