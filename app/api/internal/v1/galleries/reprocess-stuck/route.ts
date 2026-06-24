import { NextResponse, type NextRequest } from "next/server"

import {
  reprocessStuckAssets,
  getGalleryStudioId,
} from "@/server/services/gallery.service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/internal/v1/galleries/reprocess-stuck?galleryId=<id>&statuses=pending,processing
 *
 * Reprocesa por lote los assets atascados (pending/processing/failed) de una
 * galería. Pensado para correr un backfill llamándolo en loop hasta remaining=0.
 *
 * Auth: cabecera `x-internal-key` (o Bearer) == INTERNAL_API_KEY. La ruta vive
 * bajo /api/internal, exenta del middleware de sesión (igual que el resto de
 * tareas server-to-server); la autorización la hace este handler.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.INTERNAL_API_KEY ?? null
  if (!expected) {
    return NextResponse.json({ error: "INTERNAL_API_KEY no configurado" }, { status: 500 })
  }
  const provided =
    req.headers.get("x-internal-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const galleryId = url.searchParams.get("galleryId")
  if (!galleryId) {
    return NextResponse.json({ error: "falta ?galleryId" }, { status: 400 })
  }

  const studioId = await getGalleryStudioId(galleryId)
  if (!studioId) {
    return NextResponse.json({ error: "galería no existe" }, { status: 404 })
  }

  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "12", 10) || 12, 1),
    50,
  )
  const concurrency = Math.min(
    Math.max(parseInt(url.searchParams.get("concurrency") ?? "3", 10) || 3, 1),
    6,
  )
  const allowed = ["pending", "processing", "failed"] as const
  const statusesParam = (url.searchParams.get("statuses") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is (typeof allowed)[number] =>
      (allowed as readonly string[]).includes(s),
    )
  const statuses = statusesParam.length > 0 ? statusesParam : allowed

  try {
    const result = await reprocessStuckAssets(
      studioId,
      galleryId,
      limit,
      concurrency,
      statuses,
    )
    return NextResponse.json(result)
  } catch (e) {
    console.error("[reprocess-stuck]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 },
    )
  }
}
