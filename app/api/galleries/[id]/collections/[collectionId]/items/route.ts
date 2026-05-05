import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import { setCollectionItems } from "@/server/services/gallery-collections.service"
import { getCollectionItemsWithAssets } from "@/server/services/gallery-collection.service"
import { getAssetThumbUrl } from "@/server/services/gallery.service"
import { apiError } from "@/lib/utils/api-error"

const schema = z.object({
  assetIds: z.array(z.string().uuid()).max(2000),
})

// GET — listar items de la collection con thumbnails (usado por gallery-detail-tabs)
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; collectionId: string } },
) {
  try {
    const session = await requireStudioAuth()
    const items = await getCollectionItemsWithAssets(
      session.studioId,
      params.collectionId,
    )

    const hydrated = items.map((it) => ({
      id: it.id,
      asset_id: it.asset_id,
      sort_order: it.sort_order,
      original_name: it.asset.original_name,
      thumbUrl: getAssetThumbUrl(it.asset.thumb_key),
    }))

    return NextResponse.json({ items: hydrated })
  } catch (e) {
    return apiError(e)
  }
}

// PUT — bulk set items
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; collectionId: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    const body = schema.parse(await req.json())
    const result = await setCollectionItems(
      ctx.studioId,
      params.collectionId,
      body.assetIds,
    )
    return NextResponse.json(result)
  } catch (e) {
    return apiError(e)
  }
}
