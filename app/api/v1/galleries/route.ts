import { NextResponse, type NextRequest } from "next/server"

import { requireApiToken } from "@/server/middleware/api-auth"
import { getGalleries } from "@/server/services/gallery.service"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const auth = await requireApiToken(req, "read")
  if (auth instanceof NextResponse) return auth

  const { rows, total } = await getGalleries(auth.studioId, { limit: 500 }, true)
  const items = rows.map((g) => ({
    id: g.id,
    name: g.name,
    slug: g.slug,
    status: g.status,
    galleryType: g.gallery_type,
    assetCount: g.asset_count,
    clientId: g.client_id,
    projectId: g.project_id,
    deliveryReadyAt: (g as { delivery_ready_at?: string | null }).delivery_ready_at ?? null,
    createdAt: g.created_at,
  }))
  return NextResponse.json({ items, total })
}
