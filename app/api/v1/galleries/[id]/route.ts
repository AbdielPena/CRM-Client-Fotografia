import { NextResponse, type NextRequest } from "next/server"

import { requireApiToken } from "@/server/middleware/api-auth"
import { getGalleryById } from "@/server/services/gallery.service"
import { getSetsByGallery } from "@/server/services/gallery-set.service"
import { getWatermarkConfig } from "@/server/services/gallery-watermark.service"

export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiToken(req, "read")
  if (auth instanceof NextResponse) return auth

  const gallery = await getGalleryById(auth.studioId, params.id, true)
  if (!gallery) return NextResponse.json({ error: "Galería no encontrada" }, { status: 404 })

  const [sets, watermark] = await Promise.all([
    getSetsByGallery(auth.studioId, params.id),
    getWatermarkConfig(params.id),
  ])

  return NextResponse.json({
    gallery: {
      id: gallery.id,
      name: gallery.name,
      slug: gallery.slug,
      status: gallery.status,
      galleryType: gallery.gallery_type,
      assetCount: gallery.asset_count,
      clientId: gallery.client_id,
      projectId: gallery.project_id,
      deliveryReadyAt: (gallery as { delivery_ready_at?: string | null }).delivery_ready_at ?? null,
      coverAssetId: gallery.cover_asset_id,
    },
    sets: sets.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      assetCount: s.asset_count,
      isPrivate: s.is_private,
      sortOrder: s.sort_order,
    })),
    // Config de marca de agua para que el desktop replique la rendition `web`.
    watermark,
  })
}
