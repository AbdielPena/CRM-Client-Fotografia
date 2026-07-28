import { NextResponse, type NextRequest } from "next/server"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import { rebuildGalleryWatermarks } from "@/server/services/gallery-watermark-rebuild.service"
import { apiError } from "@/lib/utils/api-error"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/galleries/<id>/watermark/rebuild?limit=25
 *
 * Aplica la marca de agua a las fotos YA subidas de esa galería, por tandas.
 * Opcional: las fotos nuevas ya salen marcadas solas. La pantalla llama esto en
 * bucle hasta que `remaining` llega a 0.
 *
 * No toca originales ni enlaces: reescribe la miniatura y la foto grande en la
 * MISMA dirección de archivo.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    const limit = Number(new URL(req.url).searchParams.get("limit") ?? 25)

    const result = await rebuildGalleryWatermarks({
      studioId: ctx.studioId,
      galleryId: params.id,
      limit: Number.isFinite(limit) ? limit : 25,
    })

    return NextResponse.json(result)
  } catch (e) {
    return apiError(e)
  }
}
