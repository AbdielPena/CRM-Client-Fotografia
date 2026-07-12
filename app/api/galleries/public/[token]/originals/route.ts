import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { validateGalleryToken } from "@/server/services/gallery.service"
import { apiError } from "@/lib/utils/api-error"

/**
 * POST /api/galleries/public/[token]/originals
 *
 * Devuelve URLs FIRMADAS temporales de las fotos pedidas (por assetIds), para que
 * el cliente pueda "Guardar en Fotos" en iPhone (fetch → File → navigator.share →
 * carrete). `resolution:"original"` (máxima calidad) solo en entregas finales.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ORIGINALS_BUCKET = "gallery-originals"
const RENDITIONS_BUCKET = "gallery-renditions"
const TTL = 60 * 30 // 30 min

const schema = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(500),
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
      return NextResponse.json({ error: "Descargas no permitidas" }, { status: 403 })
    }

    const body = schema.parse(await req.json())

    const isFinalDelivery =
      view.gallery.galleryType === "final_delivery" ||
      view.assets.some(
        (a) => a.deliveryTrack === "social" || a.deliveryTrack === "high_quality",
      )
    const resolution =
      body.resolution === "original" && isFinalDelivery ? "original" : "web"
    const bucket = resolution === "original" ? ORIGINALS_BUCKET : RENDITIONS_BUCKET

    const supabase = createSupabaseServiceClient()
    // Scoping a ESTA galería: el cliente solo puede firmar fotos de su galería.
    const { data: assets } = await supabase
      .from("gallery_assets")
      .select("id, original_key, web_key, original_name")
      .eq("gallery_id", view.gallery.id)
      .in("id", body.assetIds)
      .eq("status", "completed")
      .is("deleted_at", null)

    const photos: { id: string; url: string; filename: string }[] = []
    for (const a of (assets ?? []) as Array<{
      id: string
      original_key: string | null
      web_key: string | null
      original_name: string | null
    }>) {
      const key = resolution === "original" ? a.original_key : a.web_key
      if (!key) continue
      const { data: signed } = await supabase.storage
        .from(bucket)
        .createSignedUrl(key, TTL)
      if (signed?.signedUrl) {
        photos.push({
          id: a.id,
          url: signed.signedUrl,
          filename: a.original_name || `${a.id}.jpg`,
        })
      }
    }

    return NextResponse.json({ photos })
  } catch (e) {
    return apiError(e)
  }
}
