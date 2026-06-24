import { NextResponse, type NextRequest } from "next/server"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import {
  reprocessStuckAssets,
  getGalleryStudioId,
} from "@/server/services/gallery.service"
import { apiError } from "@/lib/utils/api-error"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Reprocesa por lote los assets atascados (pending/processing/failed) de una
 * galería. Pensado para llamarse en loop hasta remaining=0.
 *
 * Auth: sesión de estudio, o cabecera `x-internal-key` == INTERNAL_API_KEY
 * (para correr el backfill desde el servidor sin sesión).
 */
async function handle(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const internalKey = process.env["INTERNAL_API_KEY"] ?? null
    const provided = req.headers.get("x-internal-key")

    let studioId: string
    if (internalKey && provided && provided === internalKey) {
      const sid = await getGalleryStudioId(params.id)
      if (!sid) return NextResponse.json({ error: "not_found" }, { status: 404 })
      studioId = sid
    } else {
      const ctx = await requireStudioAuth()
      studioId = ctx.studioId
    }

    const url = new URL(req.url)
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") ?? "12", 10) || 12, 1),
      50,
    )
    const concurrency = Math.min(
      Math.max(parseInt(url.searchParams.get("concurrency") ?? "3", 10) || 3, 1),
      6,
    )

    const result = await reprocessStuckAssets(
      studioId,
      params.id,
      limit,
      concurrency,
    )
    return NextResponse.json(result)
  } catch (e) {
    return apiError(e)
  }
}

export const POST = handle
