import { NextResponse } from "next/server"

import { validateGalleryToken } from "@/server/services/gallery.service"
import { submitCollection } from "@/server/services/gallery-collection.service"
import { createSupabaseServiceClient } from "@/server/supabase/service"

export async function POST(
  _req: Request,
  { params }: { params: { token: string; collectionId: string } },
) {
  const view = await validateGalleryToken(params.token)
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 })

  // Verificar que la collection pertenece a la galería del token
  const supabase = createSupabaseServiceClient()
  const { data: coll } = await supabase
    .from("gallery_collections")
    .select("gallery_id")
    .eq("id", params.collectionId)
    .is("deleted_at", null)
    .maybeSingle()
  const c = coll as { gallery_id: string } | null
  if (!c || c.gallery_id !== view.gallery.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  try {
    const result = await submitCollection(params.collectionId)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 400 },
    )
  }
}
