import { NextResponse, type NextRequest } from "next/server"

import { runPrintSelectionReminders } from "@/server/services/print-reminder.service"
import { safeEqual } from "@/lib/utils/timing-safe"

/**
 * POST /api/internal/v1/print-reminders
 *
 * Recordatorio DIARIO a quien ya recibió su galería final y todavía no ha
 * elegido sus impresiones. Sin esa selección el estudio no puede imprimir nada.
 *
 * Lo llama el cron del VPS una vez al día. Idempotente: si ya salió el
 * recordatorio hoy para esa galería, no manda otro.
 *
 * Auth: header `x-internal-key` == INTERNAL_API_KEY.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const expected = process.env.INTERNAL_API_KEY ?? null
  if (!expected) {
    return NextResponse.json(
      { error: "INTERNAL_API_KEY no configurada" },
      { status: 500 },
    )
  }
  const provided =
    req.headers.get("x-internal-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // `?dryRun=1` calcula a quién le tocaría SIN mandar nada. Sirve para
    // verificar el barrido contra los datos reales sin escribirle a nadie.
    const dryRun = new URL(req.url).searchParams.get("dryRun") === "1"
    const result = await runPrintSelectionReminders({ dryRun })
    return NextResponse.json({ ok: true, dryRun, ...result })
  } catch (e) {
    console.error("[print-reminders]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    )
  }
}
