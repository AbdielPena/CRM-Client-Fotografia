import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { validateGalleryToken } from "@/server/services/gallery.service"
import { setCollectionItemsAsClient } from "@/server/services/gallery-collections.service"
import {
  addAssetToCollection,
  removeAssetFromCollection,
} from "@/server/services/gallery-collection.service"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { apiError } from "@/lib/utils/api-error"
import { optionalClientEmail } from "@/lib/validations/gallery.schema"

const schema = z.object({
  assetIds: z.array(z.string().uuid()).max(2000),
  clientEmail: optionalClientEmail,
  clientName: z.string().max(120).optional().or(z.literal("")),
})

async function resolveCollection(galleryId: string, collectionId: string) {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from("gallery_collections")
    .select("studio_id, gallery_id, is_client_editable, is_locked")
    .eq("id", collectionId)
    .is("deleted_at", null)
    .maybeSingle()
  const c = data as {
    studio_id: string
    gallery_id: string
    is_client_editable: boolean
    is_locked: boolean
  } | null
  if (!c) return null
  if (c.gallery_id !== galleryId) return null
  return c
}

// PUT — bulk set items as client
export async function PUT(
  req: NextRequest,
  { params }: { params: { token: string; collectionId: string } },
) {
  try {
    const view = await validateGalleryToken(params.token)
    if (!view) return NextResponse.json({ error: "token inválido" }, { status: 404 })

    const body = schema.parse(await req.json())
    const result = await setCollectionItemsAsClient(
      params.collectionId,
      body.assetIds,
      { email: body.clientEmail || null, name: body.clientName || null },
      view.gallery.id,
    )
    return NextResponse.json(result)
  } catch (e) {
    return apiError(e)
  }
}

// POST — agregar asset a la collection (granular, usado por public-gallery-view)
export async function POST(
  req: Request,
  { params }: { params: { token: string; collectionId: string } },
) {
  const view = await validateGalleryToken(params.token)
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const c = await resolveCollection(view.gallery.id, params.collectionId)
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (!c.is_client_editable)
    return NextResponse.json({ error: "not_editable" }, { status: 403 })
  if (c.is_locked) return NextResponse.json({ error: "locked" }, { status: 423 })

  const body = (await req.json()) as { assetId?: string }
  if (!body.assetId)
    return NextResponse.json({ error: "asset_required" }, { status: 400 })

  try {
    const result = await addAssetToCollection(
      c.studio_id,
      params.collectionId,
      body.assetId,
    )
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 400 },
    )
  }
}

// DELETE — quitar asset
export async function DELETE(
  req: Request,
  { params }: { params: { token: string; collectionId: string } },
) {
  const view = await validateGalleryToken(params.token)
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const c = await resolveCollection(view.gallery.id, params.collectionId)
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (!c.is_client_editable)
    return NextResponse.json({ error: "not_editable" }, { status: 403 })
  if (c.is_locked) return NextResponse.json({ error: "locked" }, { status: 423 })

  const url = new URL(req.url)
  const assetId = url.searchParams.get("assetId")
  if (!assetId)
    return NextResponse.json({ error: "asset_required" }, { status: 400 })

  await removeAssetFromCollection(c.studio_id, params.collectionId, assetId)
  return NextResponse.json({ ok: true })
}
