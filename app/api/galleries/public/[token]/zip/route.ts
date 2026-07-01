import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { validateGalleryToken } from "@/server/services/gallery.service"
import { createZipExport } from "@/server/services/gallery-collections.service"
import { apiError } from "@/lib/utils/api-error"
import { optionalClientEmail } from "@/lib/validations/gallery.schema"

const schema = z.object({
  scope: z.enum(["gallery", "collection", "selection"]),
  collectionId: z.string().uuid().optional(),
  assetIds: z.array(z.string().uuid()).max(2000).optional(),
  clientEmail: optionalClientEmail,
  // "original" solo se honra en galerías de entrega final (fotos ya pagadas).
  resolution: z.enum(["web", "original"]).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const view = await validateGalleryToken(params.token)
    if (!view) return NextResponse.json({ error: "token inválido" }, { status: 404 })
    if (!view.gallery.allow_download) {
      return NextResponse.json(
        { error: "Descargas no permitidas en esta galería" },
        { status: 403 },
      )
    }

    const body = schema.parse(await req.json())
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null

    // Necesitamos studio_id de la galería
    const supabase = createSupabaseServiceClient()
    const { data: gallery } = await supabase
      .from("galleries")
      .select("studio_id")
      .eq("id", view.gallery.id)
      .single()
    if (!gallery) {
      return NextResponse.json({ error: "galería no encontrada" }, { status: 404 })
    }

    // Originales: solo para entregas finales (fotos editadas que el cliente ya
    // pagó). En galerías de selección el público sigue limitado a "web".
    const isFinalDelivery =
      view.gallery.galleryType === "final_delivery" ||
      view.assets.some(
        (a) => a.deliveryTrack === "social" || a.deliveryTrack === "high_quality",
      )
    const resolution =
      body.resolution === "original" && isFinalDelivery ? "original" : "web"

    const exportRow = await createZipExport(gallery.studio_id, null, {
      galleryId: view.gallery.id,
      scope: body.scope,
      collectionId: body.collectionId,
      assetIds: body.assetIds,
      resolution,
      clientEmail: body.clientEmail || null,
      clientIp: ip,
    })

    return NextResponse.json({
      exportId: exportRow.id,
      status: exportRow.status,
    })
  } catch (e) {
    return apiError(e)
  }
}
