import { NextResponse, type NextRequest } from "next/server"

import { drainEmailQueue } from "@/server/services/email-drain.service"
import { safeEqual } from "@/lib/utils/timing-safe"

/**
 * POST /api/internal/v1/email-drain
 *
 * Drena la cola `email_queue` y envía por mailcow (SMTP propio). Lo dispara un
 * cron del VPS cada minuto. Auth: header `x-internal-key` (o Bearer) ==
 * INTERNAL_API_KEY. Sustituye al worker edge de Resend.
 *
 * Body opcional: { "limit": <n> } (default 25).
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

  let limit = 10
  try {
    const body = (await req.json()) as { limit?: number }
    if (typeof body?.limit === "number" && body.limit > 0 && body.limit <= 100) {
      limit = Math.floor(body.limit)
    }
  } catch {
    // sin body → default
  }

  try {
    const result = await drainEmailQueue(limit)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    // No filtrar internos (DB/SMTP) al caller; log server-side.
    console.error("[email-drain] error:", e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, error: "drain failed" }, { status: 500 })
  }
}
