import { NextResponse, type NextRequest } from "next/server"

import { runRetentionSweep } from "@/server/services/retention.service"
import { safeEqual } from "@/lib/utils/timing-safe"

/**
 * POST /api/internal/v1/retention-sweep
 *
 * Barrido de retención: borra los archivos LOCALES de sesiones cuyo plazo de
 * conservación venció (desde la entrega), SOLO si tienen respaldo Drive
 * confirmado, y las pasa a "Finalizado total". Google Drive y el CRM quedan
 * intactos. Auth: header `x-internal-key` == INTERNAL_API_KEY.
 *
 * SEGURIDAD: por defecto corre en DRY-RUN (reporta qué haría, NO borra). Para
 * borrar de verdad hay que pasar `?confirm=1`. El cron del VPS debe incluirlo.
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

  const confirm = req.nextUrl.searchParams.get("confirm") === "1"

  try {
    const result = await runRetentionSweep({ dryRun: !confirm })
    return NextResponse.json({ ok: true, dryRun: !confirm, ...result })
  } catch (err) {
    console.error("[retention-sweep] failed", err)
    return NextResponse.json({ error: "Sweep falló" }, { status: 500 })
  }
}
