import { NextResponse, type NextRequest } from "next/server"

import { requireApiToken } from "@/server/middleware/api-auth"
import {
  getGalleryById,
  getGalleryAssets,
  renditionUrl,
} from "@/server/services/gallery.service"

export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiToken(req, "read")
  if (auth instanceof NextResponse) return auth

  const gallery = await getGalleryById(auth.studioId, params.id, true)
  if (!gallery) return NextResponse.json({ error: "Galería no encontrada" }, { status: 404 })

  const assets = await getGalleryAssets(auth.studioId, params.id, true)
  const items = assets.map((a) => ({
    id: a.id,
    originalName: a.original_name,
    status: a.status,
    setId: (a as { set_id?: string | null }).set_id ?? null,
    deliveryTrack: a.delivery_track,
    width: a.width,
    height: a.height,
    thumbUrl: renditionUrl(a.thumb_key),
    webUrl: renditionUrl(a.web_key),
  }))
  return NextResponse.json({ items, total: items.length })
}
