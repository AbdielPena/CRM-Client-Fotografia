import { NextResponse, type NextRequest } from "next/server"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import {
  getOriginalDownloadUrl,
  trackDownload,
  validateGalleryToken,
} from "@/server/services/gallery.service"

/**
 * Sirve la descarga de un asset:
 *   - Si la galería permite original → signed URL al bucket privado
 *   - Si no → redirige a la web rendition pública
 * Y registra el evento en gallery_downloads.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string; assetId: string } },
) {
  const view = await validateGalleryToken(params.token)
  if (!view) return NextResponse.json({ error: "not found" }, { status: 404 })

  const asset = view.assets.find((a) => a.id === params.assetId)
  if (!asset) return NextResponse.json({ error: "not found" }, { status: 404 })

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  const ua = req.headers.get("user-agent")
  const clientEmail = req.nextUrl.searchParams.get("email")

  const allowOriginal = view.gallery.allow_download

  if (allowOriginal) {
    const supabase = createSupabaseServiceClient()
    const { data: g } = await supabase
      .from("galleries")
      .select("studio_id")
      .eq("id", view.gallery.id)
      .maybeSingle()
    const studioId = g?.studio_id ?? null
    if (studioId) {
      const url = await getOriginalDownloadUrl(studioId, view.gallery.id, params.assetId)
      if (url) {
        await trackDownload(
          view.gallery.id,
          params.assetId,
          "single",
          "original",
          ip,
          ua,
          clientEmail,
        )
        return NextResponse.redirect(url, 302)
      }
    }
  }

  // Fallback: web rendition pública
  if (!asset.webUrl) return NextResponse.json({ error: "not ready" }, { status: 425 })
  await trackDownload(
    view.gallery.id,
    params.assetId,
    "single",
    "web",
    ip,
    ua,
    clientEmail,
  )
  return NextResponse.redirect(asset.webUrl, 302)
}
