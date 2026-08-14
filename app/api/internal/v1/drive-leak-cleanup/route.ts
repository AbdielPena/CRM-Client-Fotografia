import { NextResponse, type NextRequest } from "next/server"

import { runDriveLeakCleanup } from "@/server/services/drive-leak-cleanup.service"
import { safeEqual } from "@/lib/utils/timing-safe"

/**
 * POST /api/internal/v1/drive-leak-cleanup
 *
 * Saca las fotos de SELECCIÓN de las carpetas de Drive compartidas con el
 * cliente. Ver `drive-leak-cleanup.service` para el porqué y las dos vías.
 *
 * `?dryRun=1` dice exactamente qué haría sin tocar Drive. **Correr siempre en
 * seco primero**: esto mueve archivos y quita permisos en el Drive real.
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

  // En seco por DEFECTO. Para ejecutar de verdad hay que pedirlo explícitamente
  // con `?apply=1`: esto toca archivos del Drive del estudio.
  const url = new URL(req.url)
  const aplicar = url.searchParams.get("apply") === "1"

  try {
    const res = await runDriveLeakCleanup({ dryRun: !aplicar })
    return NextResponse.json({ ok: true, aplicado: aplicar, ...res })
  } catch (e) {
    console.error("[drive-leak-cleanup]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    )
  }
}
