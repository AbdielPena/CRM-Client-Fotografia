import { NextResponse, type NextRequest } from "next/server"

import { runDriveBackupSweep } from "@/server/services/drive-backup-sweep.service"
import { drainPendingDriveBackups } from "@/server/services/gallery-drive.service"
import { safeEqual } from "@/lib/utils/timing-safe"

/**
 * POST /api/internal/v1/drive-sweep
 *
 * Respaldo automático de galerías a Google Drive: encola las que no tienen
 * respaldo (o tienen fotos nuevas) y sube las que están en cola.
 *
 * Antes de esto, el respaldo solo se disparaba al publicar una entrega final y
 * el trabajador que sube los encolados no lo llamaba ningún cron. Resultado: 29
 * de 41 galerías existían en un solo disco.
 *
 * Lo llama el cron del VPS de madrugada. Parámetros:
 *   `?dryRun=1`      calcula qué se encolaría sin subir nada
 *   `?max=N`         galerías a encolar en esta corrida (defecto 5)
 *   `?drain=N`       respaldos a subir en esta corrida (defecto 3)
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

  const url = new URL(req.url)
  const dryRun = url.searchParams.get("dryRun") === "1"
  const max = Number(url.searchParams.get("max") ?? 5)
  const drain = Number(url.searchParams.get("drain") ?? 3)

  try {
    const sweep = await runDriveBackupSweep({
      dryRun,
      maxGalerias: Number.isFinite(max) && max > 0 ? max : 5,
    })

    // En seco no se sube nada: solo se informa qué haría.
    let subidos = 0
    if (!dryRun && drain > 0) {
      const r = await drainPendingDriveBackups(drain)
      subidos = r.processed
    }

    return NextResponse.json({ ok: true, dryRun, ...sweep, subidos })
  } catch (e) {
    console.error("[drive-sweep]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    )
  }
}
