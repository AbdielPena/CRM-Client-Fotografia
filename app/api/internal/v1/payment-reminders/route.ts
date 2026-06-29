import { NextResponse, type NextRequest } from "next/server"

import { runSessionPaymentReminders } from "@/server/services/payment-reminder.service"
import { safeEqual } from "@/lib/utils/timing-safe"

/**
 * POST /api/internal/v1/payment-reminders
 *
 * Recordatorios de saldo por sesión (día antes + día de). Lo dispara un cron del
 * VPS cada mañana (8 AM RD). Auth: header `x-internal-key` == INTERNAL_API_KEY.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const expected = process.env.INTERNAL_API_KEY ?? null
  if (!expected) {
    return NextResponse.json({ error: "INTERNAL_API_KEY no configurada" }, { status: 500 })
  }
  const provided =
    req.headers.get("x-internal-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await runSessionPaymentReminders()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error("[payment-reminders] error:", e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, error: "reminders failed" }, { status: 500 })
  }
}
