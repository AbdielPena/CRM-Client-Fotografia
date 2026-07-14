import { NextResponse } from "next/server"

import { validateGalleryToken } from "@/server/services/gallery.service"
import { deleteCollectionAsClient } from "@/server/services/gallery-collection.service"
import { createSupabaseServiceClient } from "@/server/supabase/service"

// DELETE — el CLIENTE borra una lista de selección que él creó. Solo se quita la
// lista + sus ítems (marcas); las FOTOS de la galería no se tocan. Validado por
// token de la galería + correo dueño de la lista (dentro del servicio).
export async function DELETE(
  req: Request,
  { params }: { params: { token: string; collectionId: string } },
) {
  const view = await validateGalleryToken(params.token)
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const url = new URL(req.url)
  const email = url.searchParams.get("email") ?? ""
  if (!email) {
    return NextResponse.json({ error: "email_required" }, { status: 400 })
  }

  // La lista debe pertenecer a ESTA galería (evita borrar por un token ajeno).
  const supabase = createSupabaseServiceClient()
  const { data: coll } = await supabase
    .from("gallery_collections")
    .select("gallery_id")
    .eq("id", params.collectionId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!coll || (coll as { gallery_id: string }).gallery_id !== view.gallery.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  try {
    await deleteCollectionAsClient(params.collectionId, email)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 400 },
    )
  }
}
