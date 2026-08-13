import { NextResponse, type NextRequest } from "next/server"

import { untypedService } from "@/server/supabase/untyped"
import { uploadSystemBackupsToDrive } from "@/server/services/system-backup-drive.service"
import { safeEqual } from "@/lib/utils/timing-safe"

/**
 * POST /api/internal/v1/system-backup-drive
 *
 * Sube el volcado diario de la base de datos a Google Drive, para que el
 * respaldo deje de vivir en el mismo disco que respalda.
 *
 * Lo llama el cron del VPS justo después del `pg_dump`. `?dryRun=1` dice qué
 * subiría sin subir nada.
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

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1"

  try {
    // El respaldo del sistema no es de un estudio en particular, pero la
    // conexión de Drive sí lo es: se usa la del estudio con Drive conectado.
    const sb = untypedService()
    const { data } = await sb
      .from("studio_integrations")
      .select("studio_id")
      .eq("service", "google_drive")
      .eq("is_enabled", true)
      .limit(1)
      .maybeSingle()
    const studioId = (data as { studio_id: string } | null)?.studio_id
    if (!studioId) {
      return NextResponse.json(
        { error: "Ningún estudio tiene Google Drive conectado" },
        { status: 400 },
      )
    }

    const res = await uploadSystemBackupsToDrive(studioId, { dryRun })
    return NextResponse.json({ ok: !res.error, dryRun, ...res })
  } catch (e) {
    console.error("[system-backup-drive]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    )
  }
}
