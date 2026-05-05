// ─── Gallery collections (listas de selección nombradas) ───────────────────
// El cliente puede crear múltiples listas en una galería ("Para imprimir",
// "Álbum", "Familia", etc.) y mover/agregar fotos. Al hacer submit final,
// se marca submitted_at + is_locked, y el admin recibe la selección.

import "server-only"

import { createSupabaseServerClient } from "@/server/supabase/server"
import { createSupabaseServiceClient } from "@/server/supabase/service"

const srvc = createSupabaseServerClient
const svc = createSupabaseServiceClient

export type GalleryCollectionRow = {
  id: string
  studio_id: string
  gallery_id: string
  name: string
  description: string | null
  is_client_editable: boolean
  client_email: string | null
  client_name: string | null
  asset_count: number
  submitted_at: string | null
  is_locked: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type GalleryCollectionItemRow = {
  id: string
  collection_id: string
  asset_id: string
  sort_order: number
  created_at: string
}

// ─── Studio-side: listar/crear/borrar ───────────────────────────────────────

export async function getCollectionsByGallery(
  studioId: string,
  galleryId: string,
): Promise<GalleryCollectionRow[]> {
  const supabase = srvc()
  const { data, error } = await supabase
    .from("gallery_collections")
    .select("*")
    .eq("studio_id", studioId)
    .eq("gallery_id", galleryId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as GalleryCollectionRow[]
}

export async function getCollectionById(
  studioId: string,
  collectionId: string,
): Promise<GalleryCollectionRow | null> {
  const supabase = srvc()
  const { data, error } = await supabase
    .from("gallery_collections")
    .select("*")
    .eq("id", collectionId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) throw error
  return (data as GalleryCollectionRow | null) ?? null
}

/** Lista los assets que están en la colección (con info para preview). */
export async function getCollectionItemsWithAssets(
  studioId: string,
  collectionId: string,
): Promise<
  Array<{
    id: string
    asset_id: string
    sort_order: number
    asset: {
      id: string
      original_name: string
      filename: string
      thumb_key: string | null
      web_key: string | null
      width: number | null
      height: number | null
    }
  }>
> {
  const supabase = srvc()
  const { data, error } = await supabase
    .from("gallery_collection_items")
    .select(
      `
        id, asset_id, sort_order,
        asset:gallery_assets!gallery_collection_items_asset_id_fkey(
          id, original_name, filename, thumb_key, web_key, width, height, studio_id
        )
      `,
    )
    .eq("collection_id", collectionId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
  if (error) throw error

  type Row = {
    id: string
    asset_id: string
    sort_order: number
    asset: {
      id: string
      original_name: string
      filename: string
      thumb_key: string | null
      web_key: string | null
      width: number | null
      height: number | null
      studio_id: string
    } | null
  }
  return ((data ?? []) as Row[])
    .filter((r) => r.asset && r.asset.studio_id === studioId)
    .map((r) => ({
      id: r.id,
      asset_id: r.asset_id,
      sort_order: r.sort_order,
      asset: {
        id: r.asset!.id,
        original_name: r.asset!.original_name,
        filename: r.asset!.filename,
        thumb_key: r.asset!.thumb_key,
        web_key: r.asset!.web_key,
        width: r.asset!.width,
        height: r.asset!.height,
      },
    }))
}

export async function createCollection(
  studioId: string,
  galleryId: string,
  data: {
    name: string
    description?: string | null
    clientEmail?: string | null
    clientName?: string | null
    isClientEditable?: boolean
    createdBy?: string | null
  },
): Promise<GalleryCollectionRow> {
  const supabase = svc()
  const { data: row, error } = await supabase
    .from("gallery_collections")
    .insert({
      studio_id: studioId,
      gallery_id: galleryId,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      client_email: data.clientEmail?.toLowerCase() || null,
      client_name: data.clientName || null,
      is_client_editable: data.isClientEditable ?? true,
      created_by: data.createdBy ?? null,
    })
    .select("*")
    .single()
  if (error) throw error
  return row as GalleryCollectionRow
}

export async function renameCollection(
  studioId: string,
  collectionId: string,
  name: string,
): Promise<void> {
  const supabase = svc()
  const { error } = await supabase
    .from("gallery_collections")
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq("id", collectionId)
    .eq("studio_id", studioId)
  if (error) throw error
}

export async function deleteCollection(
  studioId: string,
  collectionId: string,
): Promise<void> {
  const supabase = svc()
  const { error } = await supabase
    .from("gallery_collections")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", collectionId)
    .eq("studio_id", studioId)
  if (error) throw error
}

// ─── Items: agregar / quitar asset de una colección ─────────────────────────

export async function addAssetToCollection(
  studioId: string,
  collectionId: string,
  assetId: string,
): Promise<{ added: boolean }> {
  const supabase = svc()

  // Verificar que la colección existe, no está locked, y el asset pertenece al studio
  const { data: coll } = await supabase
    .from("gallery_collections")
    .select("id, is_locked, gallery_id, studio_id")
    .eq("id", collectionId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!coll) throw new Error("Colección no encontrada")
  // Bloqueo eliminado: el cliente puede modificar la selección siempre.

  const { data: asset } = await supabase
    .from("gallery_assets")
    .select("id, gallery_id, studio_id")
    .eq("id", assetId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!asset) throw new Error("Foto no encontrada")
  if ((asset as { studio_id: string }).studio_id !== studioId) {
    throw new Error("Foto no pertenece al studio")
  }
  if ((asset as { gallery_id: string }).gallery_id !== (coll as { gallery_id: string }).gallery_id) {
    throw new Error("Foto no pertenece a la misma galería")
  }

  // Idempotente: si ya existe, no inserta
  const { data: existing } = await supabase
    .from("gallery_collection_items")
    .select("id")
    .eq("collection_id", collectionId)
    .eq("asset_id", assetId)
    .maybeSingle()
  if (existing) return { added: false }

  // sort_order = max + 1
  const { data: maxRow } = await supabase
    .from("gallery_collection_items")
    .select("sort_order")
    .eq("collection_id", collectionId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrder =
    ((maxRow as { sort_order: number } | null)?.sort_order ?? -1) + 1

  const { error } = await supabase.from("gallery_collection_items").insert({
    collection_id: collectionId,
    asset_id: assetId,
    sort_order: nextOrder,
  })
  if (error) throw error
  return { added: true }
}

export async function removeAssetFromCollection(
  studioId: string,
  collectionId: string,
  assetId: string,
): Promise<void> {
  const supabase = svc()

  // Validate ownership
  const { data: coll } = await supabase
    .from("gallery_collections")
    .select("id, is_locked")
    .eq("id", collectionId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!coll) return
  // Bloqueo eliminado: el cliente puede modificar la selección siempre.

  await supabase
    .from("gallery_collection_items")
    .delete()
    .eq("collection_id", collectionId)
    .eq("asset_id", assetId)
}

// ─── Submit selection (cliente) ─────────────────────────────────────────────

/**
 * El cliente envía la selección final. Marca la colección como locked +
 * la galería como selection_submitted. Dispara la automatización del
 * proyecto (onSelectionSubmitted → "En edición").
 */
export async function submitCollection(
  collectionId: string,
): Promise<{ studioId: string; galleryId: string }> {
  const supabase = svc()

  const { data: coll, error } = await supabase
    .from("gallery_collections")
    .select("id, studio_id, gallery_id, is_locked, deleted_at")
    .eq("id", collectionId)
    .maybeSingle()
  if (error) throw error
  if (!coll) throw new Error("Colección no encontrada")
  const c = coll as {
    id: string
    studio_id: string
    gallery_id: string
    is_locked: boolean
    deleted_at: string | null
  }
  if (c.deleted_at) throw new Error("Colección eliminada")

  const now = new Date().toISOString()

  // NO bloquear — el cliente puede seguir modificando.
  // Solo registramos el último submit_at para que el studio sepa cuándo fue.
  await supabase
    .from("gallery_collections")
    .update({ submitted_at: now, updated_at: now })
    .eq("id", collectionId)

  await supabase
    .from("galleries")
    .update({
      selection_submitted: true,
      selection_submitted_at: now,
      updated_at: now,
    })
    .eq("id", c.gallery_id)

  // Automation: mover proyecto a "En edición". Lazy import para evitar ciclos.
  try {
    const { onSelectionSubmitted } = await import(
      "./project-automation.service"
    )
    await onSelectionSubmitted(c.studio_id, c.gallery_id)
  } catch (err) {
    console.error("[submitCollection] automation onSelectionSubmitted falló:", err)
  }

  return { studioId: c.studio_id, galleryId: c.gallery_id }
}

// ─── Helper: lista de filenames seleccionados (admin) ───────────────────────

export async function getSelectedFilenames(
  studioId: string,
  collectionId: string,
): Promise<string[]> {
  const items = await getCollectionItemsWithAssets(studioId, collectionId)
  return items.map((i) => i.asset.original_name).sort((a, b) => a.localeCompare(b))
}

// ─── Public-side (token cliente) ────────────────────────────────────────────

/**
 * Listar colecciones visibles para el cliente en una galería pública.
 * Solo retorna las que el cliente creó (matching por client_email) o
 * las que el admin marcó como is_client_editable.
 */
export async function getCollectionsForClient(
  galleryId: string,
  clientEmail: string | null,
): Promise<GalleryCollectionRow[]> {
  const supabase = svc()
  const email = (clientEmail ?? "").trim().toLowerCase() || null

  let q = supabase
    .from("gallery_collections")
    .select("*")
    .eq("gallery_id", galleryId)
    .is("deleted_at", null)

  if (email) {
    q = q.or(`client_email.eq.${email},is_client_editable.eq.true`)
  } else {
    q = q.eq("is_client_editable", true)
  }

  const { data, error } = await q.order("created_at", { ascending: true })
  if (error) throw error
  return (data ?? []) as GalleryCollectionRow[]
}

export async function createCollectionAsClient(
  galleryId: string,
  data: { name: string; clientEmail: string; clientName?: string | null },
): Promise<GalleryCollectionRow> {
  const supabase = svc()

  const { data: gallery } = await supabase
    .from("galleries")
    .select("id, studio_id, selection_locked")
    .eq("id", galleryId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!gallery) throw new Error("Galería no encontrada")
  const g = gallery as { studio_id: string; selection_locked: boolean }
  if (g.selection_locked) throw new Error("La galería está bloqueada")

  const { data: row, error } = await supabase
    .from("gallery_collections")
    .insert({
      studio_id: g.studio_id,
      gallery_id: galleryId,
      name: data.name.trim() || "Mi selección",
      client_email: data.clientEmail.toLowerCase().trim(),
      client_name: data.clientName ?? null,
      is_client_editable: true,
    })
    .select("*")
    .single()
  if (error) throw error
  return row as GalleryCollectionRow
}
