// ─── Gallery sets (carpetas dentro de una galería) ─────────────────────────
// Estructura tipo Pixieset: la galería se subdivide en sets (Destacados,
// Ceremonia, Recepción, etc.). gallery_assets.set_id apunta al set; null = root.

import "server-only"

import type { Database } from "@/types/supabase"
import { createSupabaseServiceClient } from "@/server/supabase/service"

type GallerySetUpdate = Database["public"]["Tables"]["gallery_sets"]["Update"]

const svc = createSupabaseServiceClient

export type GallerySetRow = {
  id: string
  studio_id: string
  gallery_id: string
  name: string
  description: string | null
  sort_order: number
  cover_asset_id: string | null
  is_private: boolean
  asset_count: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export async function getSetsByGallery(
  studioId: string,
  galleryId: string,
): Promise<GallerySetRow[]> {
  const supabase = svc()
  const { data, error } = await supabase
    .from("gallery_sets")
    .select("*")
    .eq("studio_id", studioId)
    .eq("gallery_id", galleryId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
  if (error) throw error
  return (data ?? []) as GallerySetRow[]
}

export async function createSet(
  studioId: string,
  galleryId: string,
  data: { name: string; description?: string | null; isPrivate?: boolean },
): Promise<GallerySetRow> {
  const supabase = svc()

  // Verificar gallery pertenece al studio
  const { data: gallery } = await supabase
    .from("galleries")
    .select("id, studio_id")
    .eq("id", galleryId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!gallery) throw new Error("Galería no encontrada")

  // sort_order = max + 1
  const { data: maxRow } = await supabase
    .from("gallery_sets")
    .select("sort_order")
    .eq("gallery_id", galleryId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrder =
    ((maxRow as { sort_order: number } | null)?.sort_order ?? -1) + 1

  const { data: row, error } = await supabase
    .from("gallery_sets")
    .insert({
      studio_id: studioId,
      gallery_id: galleryId,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      sort_order: nextOrder,
      is_private: data.isPrivate ?? false,
    })
    .select("*")
    .single()
  if (error) throw error
  return row as GallerySetRow
}

export async function updateSet(
  studioId: string,
  setId: string,
  data: {
    name?: string
    description?: string | null
    sortOrder?: number
    coverAssetId?: string | null
    isPrivate?: boolean
  },
): Promise<void> {
  const supabase = svc()
  const patch: GallerySetUpdate = { updated_at: new Date().toISOString() }
  if (data.name !== undefined) patch.name = data.name.trim()
  if (data.description !== undefined)
    patch.description = data.description?.trim() || null
  if (data.sortOrder !== undefined) patch.sort_order = data.sortOrder
  if (data.coverAssetId !== undefined) patch.cover_asset_id = data.coverAssetId
  if (data.isPrivate !== undefined) patch.is_private = data.isPrivate

  const { error } = await supabase
    .from("gallery_sets")
    .update(patch)
    .eq("id", setId)
    .eq("studio_id", studioId)
  if (error) throw error
}

export async function deleteSet(
  studioId: string,
  setId: string,
  opts: { keepAssets?: boolean } = {},
): Promise<void> {
  const supabase = svc()
  const { keepAssets = true } = opts

  if (keepAssets) {
    // Mover los assets al root (set_id = null)
    await supabase
      .from("gallery_assets")
      .update({ set_id: null, updated_at: new Date().toISOString() })
      .eq("set_id", setId)
      .eq("studio_id", studioId)
  } else {
    // Soft-delete los assets del set
    await supabase
      .from("gallery_assets")
      .update({ deleted_at: new Date().toISOString() })
      .eq("set_id", setId)
      .eq("studio_id", studioId)
  }

  const { error } = await supabase
    .from("gallery_sets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", setId)
    .eq("studio_id", studioId)
  if (error) throw error
}

/** Mover N assets a un set (null = mover al root). */
export async function moveAssetsToSet(
  studioId: string,
  galleryId: string,
  assetIds: string[],
  setId: string | null,
): Promise<{ moved: number }> {
  if (assetIds.length === 0) return { moved: 0 }
  const supabase = svc()

  // Validar set si no es null
  if (setId) {
    const { data: set } = await supabase
      .from("gallery_sets")
      .select("id, gallery_id, studio_id")
      .eq("id", setId)
      .eq("studio_id", studioId)
      .is("deleted_at", null)
      .maybeSingle()
    if (!set) throw new Error("Set no encontrado")
    if ((set as { gallery_id: string }).gallery_id !== galleryId) {
      throw new Error("Set no pertenece a esta galería")
    }
  }

  const { error, count } = await supabase
    .from("gallery_assets")
    .update({ set_id: setId, updated_at: new Date().toISOString() }, { count: "exact" })
    .in("id", assetIds)
    .eq("studio_id", studioId)
    .eq("gallery_id", galleryId)
    .is("deleted_at", null)
  if (error) throw error
  return { moved: count ?? 0 }
}

/** Reordenar sets en bulk. Aplica `sort_order` según el orden del array. */
export async function reorderSets(
  studioId: string,
  galleryId: string,
  orderedIds: string[],
): Promise<void> {
  const supabase = svc()
  // Hacemos N updates pequeños — no hay un bulk update con valores por fila en Supabase.
  await Promise.all(
    orderedIds.map((id, idx) =>
      supabase
        .from("gallery_sets")
        .update({ sort_order: idx, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("studio_id", studioId)
        .eq("gallery_id", galleryId),
    ),
  )
}
