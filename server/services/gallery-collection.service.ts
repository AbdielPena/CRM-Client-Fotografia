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

  // RPC atómica: el cálculo de sort_order y el INSERT viven en la misma
  // transacción Postgres, eliminando la race condition de SELECT-then-INSERT
  // que causaba sort_order duplicados bajo carga concurrente.
  // La función es idempotente: si el asset ya está en la colección,
  // devuelve el ID existente sin error.
  const { data: itemId, error } = await supabase.rpc(
    "add_asset_to_collection_atomic",
    {
      p_collection_id: collectionId,
      p_asset_id: assetId,
    },
  )
  if (error) throw error

  // Para detectar si fue idempotente, verificamos la cantidad de items
  // (alternativa: cambiar la signature de la RPC para devolver added bool).
  // Por ahora, asumimos que si la RPC no falló, el asset está en la colección.
  return { added: itemId !== null }
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

  // Contar ítems de la colección + obtener datos del gallery para la notificación
  const { count: itemCount } = await supabase
    .from("gallery_collection_items")
    .select("id", { count: "exact", head: true })
    .eq("collection_id", collectionId)
  const { data: gRow } = await supabase
    .from("galleries")
    .select("name")
    .eq("id", c.gallery_id)
    .maybeSingle()
  const galleryName = (gRow as { name: string } | null)?.name ?? "Galería"
  const photoCount = itemCount ?? 0

  // Notificación in-app (best-effort)
  try {
    await supabase.from("notifications").insert({
      studio_id: c.studio_id,
      type: "gallery_selection_submitted",
      title: "Cliente envió su selección",
      body: `Eligió ${photoCount} foto${photoCount === 1 ? "" : "s"} en "${galleryName}".`,
      action_url: `/galleries/${c.gallery_id}`,
      related_entity_type: "gallery",
      related_entity_id: c.gallery_id,
    })
  } catch (err) {
    console.error("[submitCollection] notification falló:", err)
  }

  // Email al fotógrafo (best-effort)
  try {
    const { data: studio } = await supabase
      .from("studios")
      .select("name, email, primary_color")
      .eq("id", c.studio_id)
      .maybeSingle()
    const s = studio as { name: string; email: string | null; primary_color: string | null } | null
    if (s?.email) {
      const { enqueueEmail, renderSelectionSubmittedForStudio } = await import("./email.service")
      const { getEmailBranding } = await import("./email-template.service")
      const branding = await getEmailBranding(c.studio_id)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
      const { subject, html } = renderSelectionSubmittedForStudio({
        studioName: s.name,
        primaryColor: s.primary_color ?? undefined,
        branding,
        galleryName,
        clientEmail: "anon@guest",
        photoCount,
        adminLink: `${appUrl}/galleries/${c.gallery_id}`,
      })
      await enqueueEmail({
        studioId: c.studio_id,
        toEmail: s.email,
        toName: s.name,
        subject,
        bodyHtml: html,
        relatedEntityType: "gallery",
        relatedEntityId: c.gallery_id,
        templateSlug: "selection_submitted_studio",
      })
    }
  } catch (err) {
    console.error("[submitCollection] email al studio falló:", err)
  }

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: gallery } = await (supabase as any)
    .from("galleries")
    .select("id, studio_id, selection_locked, gallery_type")
    .eq("id", galleryId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!gallery) throw new Error("Galería no encontrada")
  const g = gallery as { studio_id: string; selection_locked: boolean; gallery_type: string | null }
  if (g.gallery_type === "final_delivery") throw new Error("La entrega final no permite selección")
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
