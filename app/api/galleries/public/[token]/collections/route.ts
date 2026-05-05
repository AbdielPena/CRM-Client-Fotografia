import { NextResponse } from "next/server"

import { validateGalleryToken } from "@/server/services/gallery.service"
import {
  createCollectionAsClient,
  getCollectionsForClient,
} from "@/server/services/gallery-collection.service"
import { createSupabaseServiceClient } from "@/server/supabase/service"

// GET — listar collections visibles para el cliente
export async function GET(
  req: Request,
  { params }: { params: { token: string } },
) {
  const view = await validateGalleryToken(params.token)
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const url = new URL(req.url)
  const email = url.searchParams.get("email")

  const collections = await getCollectionsForClient(view.gallery.id, email)

  // Para cada collection traer ids de assets (para que el cliente sepa qué está
  // ya agregado en cada lista — habilita "agregar/quitar" idempotente).
  const supabase = createSupabaseServiceClient()
  const ids = collections.map((c) => c.id)
  let itemsByColl = new Map<string, string[]>()
  if (ids.length) {
    const { data } = await supabase
      .from("gallery_collection_items")
      .select("collection_id, asset_id")
      .in("collection_id", ids)
    for (const r of (data ?? []) as Array<{ collection_id: string; asset_id: string }>) {
      const arr = itemsByColl.get(r.collection_id) ?? []
      arr.push(r.asset_id)
      itemsByColl.set(r.collection_id, arr)
    }
  }

  return NextResponse.json({
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      asset_count: c.asset_count,
      is_locked: c.is_locked,
      submitted_at: c.submitted_at,
      client_email: c.client_email,
      asset_ids: itemsByColl.get(c.id) ?? [],
    })),
  })
}

// POST — crear nueva collection
export async function POST(
  req: Request,
  { params }: { params: { token: string } },
) {
  const view = await validateGalleryToken(params.token)
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const body = (await req.json()) as {
    name?: string
    clientEmail?: string
    clientName?: string | null
  }
  if (!body.clientEmail) {
    return NextResponse.json({ error: "email_required" }, { status: 400 })
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name_required" }, { status: 400 })
  }

  try {
    const row = await createCollectionAsClient(view.gallery.id, {
      name: body.name,
      clientEmail: body.clientEmail,
      clientName: body.clientName ?? null,
    })
    return NextResponse.json({ id: row.id })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 400 },
    )
  }
}
