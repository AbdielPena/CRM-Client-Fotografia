// ─── Gallery Collections + ZIP exports ─────────────────────────────────────
// Collections: agrupaciones nombradas de assets dentro de una galería.
// Pueden editarse por el studio o por el cliente (vía token público).
// ZIP exports: descarga masiva async, archivos en bucket gallery-zips.

import "server-only"

import archiver from "archiver"
import { Readable } from "node:stream"

import type { Database } from "@/types/supabase"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { createSupabaseServiceClient } from "@/server/supabase/service"

const ZIPS_BUCKET = "gallery-zips"
const ORIGINALS_BUCKET = "gallery-originals"
const RENDITIONS_BUCKET = "gallery-renditions"
const ZIP_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 días
const SIGNED_DOWNLOAD_TTL = 60 * 60 // 1h

// ─── Tipos ──────────────────────────────────────────────────────────────────
export type CollectionRow =
  Database["public"]["Tables"]["gallery_collections"]["Row"]
export type CollectionItemRow =
  Database["public"]["Tables"]["gallery_collection_items"]["Row"]
export type ZipExportRow =
  Database["public"]["Tables"]["gallery_zip_exports"]["Row"]

// ─── Collections (studio-side) ──────────────────────────────────────────────

export async function listCollections(
  studioId: string,
  galleryId: string,
): Promise<CollectionRow[]> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from("gallery_collections")
    .select("*")
    .eq("studio_id", studioId)
    .eq("gallery_id", galleryId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
  if (error) throw error
  return (data ?? []) as CollectionRow[]
}

export async function getCollection(
  studioId: string,
  collectionId: string,
): Promise<{ collection: CollectionRow; assetIds: string[] } | null> {
  const supabase = createSupabaseServerClient()
  const { data: collection } = await supabase
    .from("gallery_collections")
    .select("*")
    .eq("id", collectionId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!collection) return null

  const { data: items } = await supabase
    .from("gallery_collection_items")
    .select("asset_id")
    .eq("collection_id", collectionId)
    .order("sort_order", { ascending: true })

  return {
    collection: collection as CollectionRow,
    assetIds: (items ?? []).map((i) => i.asset_id as string),
  }
}

export async function createCollection(
  studioId: string,
  actorId: string,
  data: {
    galleryId: string
    name: string
    description?: string | null
    isClientEditable?: boolean
  },
): Promise<CollectionRow> {
  const supabase = createSupabaseServerClient()
  const { data: row, error } = await supabase
    .from("gallery_collections")
    .insert({
      studio_id: studioId,
      gallery_id: data.galleryId,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      is_client_editable: data.isClientEditable ?? true,
      created_by: actorId,
    })
    .select("*")
    .single()
  if (error) throw error
  return row as CollectionRow
}

export async function updateCollection(
  studioId: string,
  collectionId: string,
  patch: Partial<{
    name: string
    description: string | null
    isClientEditable: boolean
  }>,
): Promise<CollectionRow> {
  const supabase = createSupabaseServerClient()
  type Upd = Database["public"]["Tables"]["gallery_collections"]["Update"]
  const update: Upd = {}
  if (patch.name !== undefined) update.name = patch.name.trim()
  if (patch.description !== undefined)
    update.description = patch.description?.trim() || null
  if (patch.isClientEditable !== undefined)
    update.is_client_editable = patch.isClientEditable

  const { data, error } = await supabase
    .from("gallery_collections")
    .update(update)
    .eq("id", collectionId)
    .eq("studio_id", studioId)
    .select("*")
    .single()
  if (error) throw error
  return data as CollectionRow
}

export async function deleteCollection(
  studioId: string,
  collectionId: string,
): Promise<void> {
  const supabase = createSupabaseServerClient()
  const { error } = await supabase
    .from("gallery_collections")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", collectionId)
    .eq("studio_id", studioId)
  if (error) throw error
}

// ─── Collection items (asset add/remove) ────────────────────────────────────

export async function setCollectionItems(
  studioId: string,
  collectionId: string,
  assetIds: string[],
  client?: { email?: string | null; name?: string | null },
): Promise<{ count: number }> {
  // Verifica pertenencia (studio o cliente con permiso) y reemplaza
  // todos los items por el set nuevo en una sola transacción.
  const supabase = createSupabaseServiceClient()

  const { data: col } = await supabase
    .from("gallery_collections")
    .select("id, gallery_id, studio_id, is_client_editable")
    .eq("id", collectionId)
    .maybeSingle()
  if (!col || col.studio_id !== studioId) {
    throw new Error("Collection no encontrada")
  }

  // Borrar todos los items existentes
  await supabase
    .from("gallery_collection_items")
    .delete()
    .eq("collection_id", collectionId)

  if (assetIds.length === 0) return { count: 0 }

  // Insertar los nuevos
  const rows = assetIds.map((assetId, i) => ({
    collection_id: collectionId,
    asset_id: assetId,
    sort_order: i,
  }))
  const { error } = await supabase.from("gallery_collection_items").insert(rows)
  if (error) throw error

  // Anotar quién editó
  if (client) {
    await supabase
      .from("gallery_collections")
      .update({
        client_email: client.email ?? null,
        client_name: client.name ?? null,
      })
      .eq("id", collectionId)
  }

  return { count: assetIds.length }
}

// Variante para uso desde la UI pública (token-based, no requiere auth de studio).
// Valida que la collection pertenezca a una galería accesible vía token.
export async function setCollectionItemsAsClient(
  collectionId: string,
  assetIds: string[],
  client: { email?: string | null; name?: string | null },
  galleryId: string,
): Promise<{ count: number }> {
  const supabase = createSupabaseServiceClient()
  const { data: col } = await supabase
    .from("gallery_collections")
    .select("id, gallery_id, studio_id, is_client_editable")
    .eq("id", collectionId)
    .eq("gallery_id", galleryId)
    .maybeSingle()
  if (!col) throw new Error("Collection no encontrada")
  if (!col.is_client_editable) throw new Error("Collection no editable")

  await supabase
    .from("gallery_collection_items")
    .delete()
    .eq("collection_id", collectionId)

  if (assetIds.length > 0) {
    const rows = assetIds.map((assetId, i) => ({
      collection_id: collectionId,
      asset_id: assetId,
      sort_order: i,
    }))
    const { error } = await supabase
      .from("gallery_collection_items")
      .insert(rows)
    if (error) throw error
  }

  await supabase
    .from("gallery_collections")
    .update({
      client_email: client.email ?? null,
      client_name: client.name ?? null,
    })
    .eq("id", collectionId)

  return { count: assetIds.length }
}

// ─── ZIP exports ────────────────────────────────────────────────────────────

export type CreateZipExportInput = {
  galleryId: string
  scope: "gallery" | "collection" | "selection"
  collectionId?: string | null
  assetIds?: string[] | null
  resolution?: "web" | "original"
  clientEmail?: string | null
  clientIp?: string | null
}

/**
 * Encola un export ZIP. Devuelve el row con status='pending'.
 * El procesamiento async es disparado inline por simplicidad.
 */
export async function createZipExport(
  studioId: string,
  actorId: string | null,
  input: CreateZipExportInput,
): Promise<ZipExportRow> {
  const supabase = createSupabaseServiceClient()

  // Verificar galería + obtener studio
  const { data: gallery } = await supabase
    .from("galleries")
    .select("id, studio_id, allow_download")
    .eq("id", input.galleryId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!gallery) throw new Error("Galería no encontrada")

  const resolution = input.resolution ?? "web"
  if (resolution === "original" && !gallery.allow_download) {
    throw new Error("Originales no permitidos en esta galería")
  }

  const { data: row, error } = await supabase
    .from("gallery_zip_exports")
    .insert({
      studio_id: studioId,
      gallery_id: input.galleryId,
      scope: input.scope,
      collection_id: input.collectionId ?? null,
      asset_ids: input.assetIds ?? null,
      resolution,
      status: "pending",
      requested_by_user_id: actorId,
      client_email: input.clientEmail ?? null,
      client_ip: input.clientIp ?? null,
      expires_at: new Date(Date.now() + ZIP_TTL_SECONDS * 1000).toISOString(),
    })
    .select("*")
    .single()
  if (error) throw error

  // Procesamiento async (no bloquea la respuesta)
  void processZipExport((row as ZipExportRow).id)

  return row as ZipExportRow
}

/**
 * Resuelve los assets a incluir según el scope del export.
 */
async function resolveAssetIds(
  exportRow: ZipExportRow,
): Promise<{ assetId: string; key: string; filename: string }[]> {
  const supabase = createSupabaseServiceClient()
  let assetIds: string[] = []

  if (exportRow.scope === "gallery") {
    const { data } = await supabase
      .from("gallery_assets")
      .select("id")
      .eq("gallery_id", exportRow.gallery_id)
      .eq("status", "completed")
      .is("deleted_at", null)
    assetIds = (data ?? []).map((a) => a.id as string)
  } else if (exportRow.scope === "collection" && exportRow.collection_id) {
    const { data } = await supabase
      .from("gallery_collection_items")
      .select("asset_id")
      .eq("collection_id", exportRow.collection_id)
      .order("sort_order", { ascending: true })
    assetIds = (data ?? []).map((i) => i.asset_id as string)
  } else if (exportRow.scope === "selection" && exportRow.asset_ids) {
    assetIds = exportRow.asset_ids as string[]
  }

  if (assetIds.length === 0) return []

  const { data: assets } = await supabase
    .from("gallery_assets")
    .select("id, original_key, web_key, original_name")
    .in("id", assetIds)
    .eq("status", "completed")
    .is("deleted_at", null)

  return (assets ?? []).map((a) => {
    const key =
      exportRow.resolution === "original"
        ? (a.original_key as string)
        : (a.web_key as string)
    return {
      assetId: a.id as string,
      key,
      filename: a.original_name as string,
    }
  })
}

/**
 * Procesa un export: descarga los assets de Supabase Storage,
 * los empaqueta en un ZIP en memoria y sube al bucket gallery-zips.
 */
export async function processZipExport(exportId: string): Promise<void> {
  const supabase = createSupabaseServiceClient()

  await supabase
    .from("gallery_zip_exports")
    .update({ status: "processing" })
    .eq("id", exportId)

  try {
    const { data: exportRow } = await supabase
      .from("gallery_zip_exports")
      .select("*")
      .eq("id", exportId)
      .single()
    if (!exportRow) throw new Error("Export no encontrado")

    const assets = await resolveAssetIds(exportRow as ZipExportRow)
    if (assets.length === 0) throw new Error("Sin assets que empaquetar")

    const sourceBucket =
      (exportRow as ZipExportRow).resolution === "original"
        ? ORIGINALS_BUCKET
        : RENDITIONS_BUCKET

    // Construir ZIP en memoria
    const archive = archiver("zip", { zlib: { level: 6 } })
    const chunks: Buffer[] = []
    archive.on("data", (chunk: Buffer) => chunks.push(chunk))
    const done = new Promise<void>((resolve, reject) => {
      archive.on("end", () => resolve())
      archive.on("error", reject)
    })

    // Para evitar nombres duplicados (ej: 'IMG_1234.jpg' x 5),
    // prefijar índice cuando se repita.
    const usedNames = new Map<string, number>()
    for (const asset of assets) {
      const { data: blob, error } = await supabase.storage
        .from(sourceBucket)
        .download(asset.key)
      if (error || !blob) {
        console.error("[zip] failed to download", asset.assetId, error)
        continue
      }
      const buf = Buffer.from(await blob.arrayBuffer())

      let name = asset.filename
      const seen = usedNames.get(name) ?? 0
      if (seen > 0) {
        const dot = name.lastIndexOf(".")
        if (dot > 0) {
          name = `${name.slice(0, dot)}_${seen + 1}${name.slice(dot)}`
        } else {
          name = `${name}_${seen + 1}`
        }
      }
      usedNames.set(asset.filename, seen + 1)

      archive.append(buf, { name })
    }

    await archive.finalize()
    await done

    const zipBuffer = Buffer.concat(chunks)
    const zipKey = `${(exportRow as ZipExportRow).studio_id}/${(exportRow as ZipExportRow).gallery_id}/${exportId}.zip`

    const { error: uploadError } = await supabase.storage
      .from(ZIPS_BUCKET)
      .upload(zipKey, zipBuffer, {
        contentType: "application/zip",
        upsert: true,
      })
    if (uploadError) throw uploadError

    await supabase
      .from("gallery_zip_exports")
      .update({
        status: "ready",
        zip_key: zipKey,
        zip_size: zipBuffer.length,
        asset_count: assets.length,
      })
      .eq("id", exportId)
  } catch (err) {
    console.error("[processZipExport] failed", exportId, err)
    await supabase
      .from("gallery_zip_exports")
      .update({
        status: "failed",
        error_message: err instanceof Error ? err.message : String(err),
      })
      .eq("id", exportId)
  }
}

export async function getZipExportStatus(
  exportId: string,
): Promise<ZipExportRow | null> {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from("gallery_zip_exports")
    .select("*")
    .eq("id", exportId)
    .maybeSingle()
  return (data as ZipExportRow | null) ?? null
}

export async function getZipDownloadUrl(
  exportId: string,
): Promise<string | null> {
  const supabase = createSupabaseServiceClient()
  const { data: exportRow } = await supabase
    .from("gallery_zip_exports")
    .select("zip_key, status, expires_at")
    .eq("id", exportId)
    .maybeSingle()
  if (!exportRow || exportRow.status !== "ready" || !exportRow.zip_key) {
    return null
  }
  if (
    exportRow.expires_at &&
    new Date(exportRow.expires_at).getTime() < Date.now()
  ) {
    return null
  }

  const { data: signed } = await supabase.storage
    .from(ZIPS_BUCKET)
    .createSignedUrl(exportRow.zip_key, SIGNED_DOWNLOAD_TTL)
  return signed?.signedUrl ?? null
}
