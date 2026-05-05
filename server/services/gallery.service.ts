// ─── Gallery service (Supabase Storage) ─────────────────────────────────────
// Originales en bucket privado `gallery-originals`.
// Renditions (thumb/web) en bucket público `gallery-renditions`, servidas
// directo por la CDN de Supabase Storage.
//
// Processing es inline (Sharp en Node runtime) post-upload. Para volúmenes
// grandes mover a una Edge Function de Supabase con la misma lógica.

import "server-only"

import { randomUUID } from "node:crypto"

import { createId } from "@paralleldrive/cuid2"
import slugify from "slugify"

import type { Database } from "@/types/supabase"

import { createSupabaseServerClient } from "@/server/supabase/server"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import {
  isLocalStorage,
  localPublicUrl,
  localRead,
  localRemove,
  localWrite,
} from "@/lib/storage/local-driver"

const srvc = createSupabaseServerClient
const svc = createSupabaseServiceClient

const ORIGINALS_BUCKET = "gallery-originals"
const RENDITIONS_BUCKET = "gallery-renditions"
const SIGNED_UPLOAD_TTL = 60 * 10 // 10 min

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
])

export type GalleryRow = {
  id: string
  studio_id: string
  project_id: string | null
  client_id: string | null
  name: string
  slug: string
  description: string | null
  cover_asset_id: string | null
  status: "draft" | "published" | "archived" | "expired"
  visibility: "public" | "private" | "password"
  password_hash: string | null
  require_email: boolean
  allow_download: boolean
  expires_at: string | null
  asset_count: number
  created_at: string
  updated_at: string
  // Marca de agua
  watermark_enabled: boolean
  watermark_text: string | null
  watermark_position: string
  watermark_opacity: number
  // Selección
  selection_enabled: boolean
  selection_submitted: boolean
  selection_submitted_at: string | null
  selection_locked: boolean
  // Diseño
  event_date: string | null
  tags: string[]
  accent_color: string
  layout_grid: string
  cover_design: string
  // Descarga
  download_pin_required: boolean
}

export type GalleryAssetRow = {
  id: string
  studio_id: string
  gallery_id: string
  filename: string
  original_name: string
  mime_type: string
  file_size: number
  width: number | null
  height: number | null
  status: "pending" | "processing" | "completed" | "failed"
  sort_order: number
  original_key: string | null
  thumb_key: string | null
  web_key: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function publicRenditionUrl(supabaseUrl: string, key: string | null): string | null {
  if (!key) return null
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${RENDITIONS_BUCKET}/${key}`
}

function uniqueSlug(name: string): string {
  const base = slugify(name, { lower: true, strict: true }).slice(0, 60) || "galeria"
  return `${base}-${createId().slice(0, 6)}`
}

function originalKey(studioId: string, galleryId: string, assetId: string, ext: string): string {
  return `${studioId}/${galleryId}/${assetId}/original.${ext}`
}

function thumbKey(studioId: string, galleryId: string, assetId: string): string {
  return `${studioId}/${galleryId}/${assetId}/thumb.webp`
}

function webKey(studioId: string, galleryId: string, assetId: string): string {
  return `${studioId}/${galleryId}/${assetId}/web.webp`
}

function extFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg"
    case "image/png":
      return "png"
    case "image/webp":
      return "webp"
    case "image/heic":
      return "heic"
    case "image/heif":
      return "heif"
    default:
      return "bin"
  }
}

// ─── Studio-side: galerías ──────────────────────────────────────────────────

export type ListGalleryOptions = {
  status?: GalleryRow["status"]
  projectId?: string
  clientId?: string
  search?: string
  limit?: number
  offset?: number
}

export async function getGalleries(
  studioId: string,
  opts: ListGalleryOptions = {},
): Promise<{ rows: GalleryRow[]; total: number }> {
  const supabase = srvc()

  let q = supabase
    .from("galleries")
    .select("*", { count: "exact" })
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (opts.status) q = q.eq("status", opts.status)
  if (opts.projectId) q = q.eq("project_id", opts.projectId)
  if (opts.clientId) q = q.eq("client_id", opts.clientId)
  if (opts.search) q = q.ilike("name", `%${opts.search}%`)

  const limit = Math.min(opts.limit ?? 50, 100)
  const offset = opts.offset ?? 0
  q = q.range(offset, offset + limit - 1)

  const { data, error, count } = await q
  if (error) throw error
  return { rows: (data ?? []) as GalleryRow[], total: count ?? 0 }
}

export async function getGalleryById(
  studioId: string,
  galleryId: string,
): Promise<GalleryRow | null> {
  const supabase = srvc()
  const { data, error } = await supabase
    .from("galleries")
    .select("*")
    .eq("id", galleryId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) throw error
  return (data as GalleryRow | null) ?? null
}

export type CreateGalleryInput = {
  name: string
  projectId?: string | null
  clientId?: string | null
  description?: string | null
  visibility?: "public" | "private" | "password"
  passwordHash?: string | null
  allowDownload?: boolean
  requireEmail?: boolean
  expiresAt?: string | null
}

export async function createGallery(
  studioId: string,
  actorId: string,
  data: CreateGalleryInput,
): Promise<GalleryRow> {
  const supabase = srvc()
  const slug = uniqueSlug(data.name)

  const { data: row, error } = await supabase
    .from("galleries")
    .insert({
      studio_id: studioId,
      project_id: data.projectId ?? null,
      client_id: data.clientId ?? null,
      name: data.name.trim(),
      slug,
      description: data.description?.trim() || null,
      visibility: data.visibility ?? "private",
      password_hash: data.passwordHash ?? null,
      allow_download: data.allowDownload ?? true,
      require_email: data.requireEmail ?? false,
      expires_at: data.expiresAt ?? null,
      created_by: actorId,
    })
    .select("*")
    .single()
  if (error) throw error
  return row as GalleryRow
}

export type UpdateGalleryInput = Partial<
  Omit<CreateGalleryInput, "projectId" | "clientId">
> & {
  status?: GalleryRow["status"]
  coverAssetId?: string | null
  // Marca de agua
  watermarkEnabled?: boolean
  watermarkText?: string | null
  watermarkPosition?: string
  watermarkOpacity?: number
  // Selección
  selectionEnabled?: boolean
  selectionLocked?: boolean
  // Descarga PIN
  downloadPinRequired?: boolean
  // Diseño
  eventDate?: string | null
  accentColor?: string
  layoutGrid?: string
  coverDesign?: string
}

export async function updateGallery(
  studioId: string,
  _actorId: string,
  galleryId: string,
  data: UpdateGalleryInput,
): Promise<GalleryRow> {
  const supabase = srvc()
  type GalleriesUpdate = Database["public"]["Tables"]["galleries"]["Update"]
  const patch: GalleriesUpdate = {}

  if (data.name !== undefined) patch.name = data.name.trim()
  if (data.description !== undefined) patch.description = data.description?.trim() || null
  if (data.visibility !== undefined) patch.visibility = data.visibility
  if (data.passwordHash !== undefined) patch.password_hash = data.passwordHash
  if (data.allowDownload !== undefined) patch.allow_download = data.allowDownload
  if (data.requireEmail !== undefined) patch.require_email = data.requireEmail
  if (data.expiresAt !== undefined) patch.expires_at = data.expiresAt
  if (data.status !== undefined) patch.status = data.status
  if (data.coverAssetId !== undefined) patch.cover_asset_id = data.coverAssetId

  if (data.watermarkEnabled !== undefined) patch.watermark_enabled = data.watermarkEnabled
  if (data.watermarkText !== undefined) patch.watermark_text = data.watermarkText
  if (data.watermarkPosition !== undefined) patch.watermark_position = data.watermarkPosition
  if (data.watermarkOpacity !== undefined) patch.watermark_opacity = data.watermarkOpacity

  if (data.selectionEnabled !== undefined) patch.selection_enabled = data.selectionEnabled
  if (data.selectionLocked !== undefined) patch.selection_locked = data.selectionLocked

  if (data.downloadPinRequired !== undefined)
    patch.download_pin_required = data.downloadPinRequired
  if (data.eventDate !== undefined) patch.event_date = data.eventDate
  if (data.accentColor !== undefined) patch.accent_color = data.accentColor
  if (data.layoutGrid !== undefined) patch.layout_grid = data.layoutGrid
  if (data.coverDesign !== undefined) patch.cover_design = data.coverDesign

  const { data: row, error } = await supabase
    .from("galleries")
    .update(patch)
    .eq("id", galleryId)
    .eq("studio_id", studioId)
    .select("*")
    .single()
  if (error) throw error
  return row as GalleryRow
}

export async function publishGallery(
  studioId: string,
  actorId: string,
  galleryId: string,
): Promise<GalleryRow> {
  return updateGallery(studioId, actorId, galleryId, { status: "published" })
}

export async function deleteGallery(
  studioId: string,
  _actorId: string,
  galleryId: string,
): Promise<void> {
  const supabase = srvc()
  // Soft delete a nivel app + cascade real para storage en background.
  const { error } = await supabase
    .from("galleries")
    .update({ deleted_at: new Date().toISOString(), status: "archived" })
    .eq("id", galleryId)
    .eq("studio_id", studioId)
  if (error) throw error
}

// ─── Assets: upload flow ────────────────────────────────────────────────────

export type PrepareUploadParams = {
  galleryId: string
  filename: string
  mimeType: string
  fileSize: number
}

export type PreparedUpload = {
  assetId: string
  originalKey: string
  signedUrl: string
  token: string // necesario por @supabase/storage-js para `uploadToSignedUrl`
}

export async function prepareAssetUpload(
  studioId: string,
  _galleryId: string,
  params: PrepareUploadParams,
): Promise<PreparedUpload> {
  if (!ALLOWED_MIME.has(params.mimeType)) {
    throw new Error(`MIME no permitido: ${params.mimeType}`)
  }
  if (params.fileSize > 200 * 1024 * 1024) {
    throw new Error("Archivo excede 200MB")
  }

  const supabase = svc()

  // Verificar pertenencia a studio (la RLS no aplica con service client)
  const { data: gallery } = await supabase
    .from("galleries")
    .select("id, studio_id, status")
    .eq("id", params.galleryId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!gallery) throw new Error("Galería no encontrada")
  if ((gallery as { status: string }).status === "archived") {
    throw new Error("No se puede subir a una galería archivada")
  }

  // gallery_assets.id es uuid en Postgres — usar randomUUID, no cuid.
  const assetId = randomUUID()
  const ext = extFromMime(params.mimeType)
  const key = originalKey(studioId, params.galleryId, assetId, ext)

  // Crear row pre-upload con status=pending
  const { error: insertError } = await supabase.from("gallery_assets").insert({
    id: assetId,
    studio_id: studioId,
    gallery_id: params.galleryId,
    filename: `${assetId}.${ext}`,
    original_name: params.filename,
    mime_type: params.mimeType,
    file_size: params.fileSize,
    status: "pending",
    original_key: key,
  })
  if (insertError) throw insertError

  // Local mode: el cliente sube directo a un endpoint Next.js que escribe al
  // filesystem en `public/dev-uploads/`. Sin nube, sin presigned URL.
  if (isLocalStorage()) {
    const params = new URLSearchParams({ assetId, key })
    return {
      assetId,
      originalKey: key,
      signedUrl: `/api/galleries/upload/local-direct?${params.toString()}`,
      token: "local",
    }
  }

  // Crear signed upload URL
  const { data: signed, error: signError } = await supabase.storage
    .from(ORIGINALS_BUCKET)
    .createSignedUploadUrl(key)
  if (signError) throw signError

  return {
    assetId,
    originalKey: key,
    signedUrl: signed.signedUrl,
    token: signed.token,
  }
}

/**
 * Llamado por el cliente después de subir el archivo al signed URL.
 * Marca el asset como `processing` y dispara la generación de renditions
 * con Sharp en este mismo proceso (inline).
 */
export async function confirmAssetUpload(
  studioId: string,
  assetId: string,
  galleryId: string,
): Promise<GalleryAssetRow> {
  const supabase = svc()

  const { data: asset, error } = await supabase
    .from("gallery_assets")
    .update({ status: "processing" })
    .eq("id", assetId)
    .eq("studio_id", studioId)
    .eq("gallery_id", galleryId)
    .select("*")
    .single()
  if (error) throw error

  // Procesamiento inline. Si falla, actualizamos status='failed' pero no
  // lanzamos al caller — la UI puede reintentar.
  void processAssetSafely(assetId, studioId, galleryId)

  return asset as GalleryAssetRow
}

async function processAssetSafely(
  assetId: string,
  studioId: string,
  galleryId: string,
): Promise<void> {
  const supabase = svc()
  try {
    const { data: asset } = await supabase
      .from("gallery_assets")
      .select("original_key, mime_type")
      .eq("id", assetId)
      .single()
    if (!asset?.original_key) throw new Error("asset sin original_key")

    // Lazy import — sharp es nativo, evitar cargarlo en hot path innecesarios
    const sharp = (await import("sharp")).default

    // Descargar original (local fs o Supabase Storage según driver)
    let buffer: Buffer
    if (isLocalStorage()) {
      buffer = await localRead(ORIGINALS_BUCKET, asset.original_key)
    } else {
      const { data: blob, error: dlError } = await supabase.storage
        .from(ORIGINALS_BUCKET)
        .download(asset.original_key)
      if (dlError || !blob) throw dlError ?? new Error("download failed")
      buffer = Buffer.from(await blob.arrayBuffer())
    }

    const meta = await sharp(buffer).metadata()

    const thumbBuf = await sharp(buffer)
      .rotate()
      .resize({ width: 400, height: 400, fit: "cover", withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer()

    let webBuf = await sharp(buffer)
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer()

    // Watermark si la galería lo tiene activo. Solo afecta el web rendition;
    // thumb queda limpio (no vale la pena en 400px) y el original también.
    const { getWatermarkConfig, applyWatermark } = await import(
      "./gallery-watermark.service"
    )
    const watermarkCfg = await getWatermarkConfig(galleryId)
    if (watermarkCfg) {
      webBuf = await applyWatermark(webBuf, watermarkCfg)
    }

    const tKey = thumbKey(studioId, galleryId, assetId)
    const wKey = webKey(studioId, galleryId, assetId)

    if (isLocalStorage()) {
      await localWrite(RENDITIONS_BUCKET, tKey, thumbBuf)
      await localWrite(RENDITIONS_BUCKET, wKey, webBuf)
    } else {
      const upThumb = await supabase.storage
        .from(RENDITIONS_BUCKET)
        .upload(tKey, thumbBuf, { contentType: "image/webp", upsert: true })
      if (upThumb.error) throw upThumb.error

      const upWeb = await supabase.storage
        .from(RENDITIONS_BUCKET)
        .upload(wKey, webBuf, { contentType: "image/webp", upsert: true })
      if (upWeb.error) throw upWeb.error
    }

    await supabase
      .from("gallery_assets")
      .update({
        status: "completed",
        width: meta.width ?? null,
        height: meta.height ?? null,
        thumb_key: tKey,
        web_key: wKey,
        metadata: {
          format: meta.format,
          orientation: meta.orientation,
          space: meta.space,
        },
      })
      .eq("id", assetId)
  } catch (err) {
    console.error("[processAsset] failed", assetId, err)
    await supabase
      .from("gallery_assets")
      .update({
        status: "failed",
        metadata: {
          error: err instanceof Error ? err.message : String(err),
        },
      })
      .eq("id", assetId)
  }
}

export async function reprocessAsset(
  studioId: string,
  galleryId: string,
  assetId: string,
): Promise<void> {
  const supabase = svc()
  await supabase
    .from("gallery_assets")
    .update({ status: "processing" })
    .eq("id", assetId)
    .eq("studio_id", studioId)
    .eq("gallery_id", galleryId)
  void processAssetSafely(assetId, studioId, galleryId)
}

export async function deleteAsset(
  studioId: string,
  galleryId: string,
  assetId: string,
): Promise<void> {
  const supabase = svc()

  const { data: asset } = await supabase
    .from("gallery_assets")
    .select("original_key, thumb_key, web_key")
    .eq("id", assetId)
    .eq("studio_id", studioId)
    .eq("gallery_id", galleryId)
    .maybeSingle()

  await supabase
    .from("gallery_assets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", assetId)
    .eq("studio_id", studioId)

  // Cleanup en cascada — eliminar referencias huérfanas que quedarían
  // visibles en la vista del cliente:
  // - favoritos del cliente
  // - items en colecciones (selecciones)
  await supabase.from("gallery_favorites").delete().eq("asset_id", assetId)
  await supabase.from("gallery_collection_items").delete().eq("asset_id", assetId)

  // Si esta foto era la portada, limpiarla
  await supabase
    .from("galleries")
    .update({ cover_asset_id: null })
    .eq("id", galleryId)
    .eq("cover_asset_id", assetId)

  // Decrementar asset_count (no negativo)
  const { data: countRow } = await supabase
    .from("gallery_assets")
    .select("id", { count: "exact", head: true })
    .eq("gallery_id", galleryId)
    .is("deleted_at", null)
  void countRow
  // Recalcular vía count separado para confiabilidad
  const { count: liveCount } = await supabase
    .from("gallery_assets")
    .select("id", { count: "exact", head: true })
    .eq("gallery_id", galleryId)
    .is("deleted_at", null)
  await supabase
    .from("galleries")
    .update({ asset_count: liveCount ?? 0 })
    .eq("id", galleryId)

  if (asset) {
    const a = asset as { original_key: string | null; thumb_key: string | null; web_key: string | null }
    const originals = a.original_key ? [a.original_key] : []
    const renditions = [a.thumb_key, a.web_key].filter(Boolean) as string[]
    if (isLocalStorage()) {
      if (originals.length) await localRemove(ORIGINALS_BUCKET, originals)
      if (renditions.length) await localRemove(RENDITIONS_BUCKET, renditions)
    } else {
      if (originals.length) {
        await supabase.storage.from(ORIGINALS_BUCKET).remove(originals).catch(() => {})
      }
      if (renditions.length) {
        await supabase.storage.from(RENDITIONS_BUCKET).remove(renditions).catch(() => {})
      }
    }
  }
}

export async function bulkDeleteAssets(
  studioId: string,
  galleryId: string,
  assetIds: string[],
): Promise<{ deleted: number }> {
  let n = 0
  for (const id of assetIds) {
    try {
      await deleteAsset(studioId, galleryId, id)
      n++
    } catch (e) {
      console.error("[bulkDeleteAssets]", id, e)
    }
  }
  return { deleted: n }
}

export async function getGalleryAssets(
  studioId: string,
  galleryId: string,
): Promise<GalleryAssetRow[]> {
  const supabase = srvc()
  const { data, error } = await supabase
    .from("gallery_assets")
    .select("*")
    .eq("studio_id", studioId)
    .eq("gallery_id", galleryId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
  if (error) throw error
  return (data ?? []) as GalleryAssetRow[]
}

export function getAssetThumbUrl(thumbKey: string | null): string | null {
  if (!thumbKey) return null
  if (isLocalStorage()) return localPublicUrl(RENDITIONS_BUCKET, thumbKey)
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]
  if (!url) return null
  return publicRenditionUrl(url, thumbKey)
}

export function getAssetWebUrl(webKey: string | null): string | null {
  if (!webKey) return null
  if (isLocalStorage()) return localPublicUrl(RENDITIONS_BUCKET, webKey)
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]
  if (!url) return null
  return publicRenditionUrl(url, webKey)
}

// ─── Share tokens (acceso público) ──────────────────────────────────────────

export type ShareTokenOptions = {
  expiresAt?: string | null
}

export async function createGalleryShareToken(
  studioId: string,
  galleryId: string,
  opts: ShareTokenOptions = {},
): Promise<{ token: string; url: string }> {
  const supabase = srvc()
  const token = createId() + createId() // 48 chars

  const { error } = await supabase.from("gallery_share_tokens").insert({
    studio_id: studioId,
    gallery_id: galleryId,
    token,
    expires_at: opts.expiresAt ?? null,
  })
  if (error) throw error

  const base = process.env["NEXT_PUBLIC_APP_URL"] ?? ""
  return { token, url: `${base}/g/${token}` }
}

export async function shareGalleryWithClient(
  studioId: string,
  galleryId: string,
  opts: { clientEmail?: string; expiresAt?: string | null } = {},
): Promise<{ token: string; url: string }> {
  // Por ahora un alias del token genérico; el envío de email lo hace
  // el caller (server action) usando email.service.
  return createGalleryShareToken(studioId, galleryId, { expiresAt: opts.expiresAt ?? null })
}

export type PublicGalleryView = {
  gallery: Pick<
    GalleryRow,
    "id" | "name" | "description" | "visibility" | "allow_download" | "require_email"
  > & { coverThumbUrl: string | null }
  assets: Array<{
    id: string
    width: number | null
    height: number | null
    thumbUrl: string | null
    webUrl: string | null
  }>
  tokenInfo: { id: string; expiresAt: string | null }
}

/**
 * Resuelve el token público y devuelve la galería + assets para
 * `/g/[token]`. NO incrementa view_count (eso lo hace el endpoint).
 */
export async function validateGalleryToken(
  token: string,
): Promise<PublicGalleryView | null> {
  const supabase = svc()

  const { data: tk } = await supabase
    .from("gallery_share_tokens")
    .select("id, gallery_id, studio_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle()
  if (!tk || tk.revoked_at) return null
  if (tk.expires_at && new Date(tk.expires_at).getTime() < Date.now()) return null

  const { data: gallery } = await supabase
    .from("galleries")
    .select(
      "id, name, description, visibility, allow_download, require_email, status, cover_asset_id",
    )
    .eq("id", tk.gallery_id)
    .is("deleted_at", null)
    .maybeSingle()
  if (!gallery || gallery.status !== "published") return null

  const { data: assets } = await supabase
    .from("gallery_assets")
    .select("id, width, height, thumb_key, web_key, status")
    .eq("gallery_id", tk.gallery_id)
    .is("deleted_at", null)
    .eq("status", "completed")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assetList = (assets ?? []) as any[]
  let coverThumb: string | null = null
  if (gallery.cover_asset_id && assetList.length) {
    const cover = assetList.find((a) => a.id === gallery.cover_asset_id)
    coverThumb = getAssetThumbUrl((cover?.thumb_key as string | null) ?? null)
  }

  return {
    gallery: {
      id: gallery.id as string,
      name: gallery.name as string,
      description: gallery.description as string | null,
      visibility: gallery.visibility as GalleryRow["visibility"],
      allow_download: gallery.allow_download as boolean,
      require_email: gallery.require_email as boolean,
      coverThumbUrl: coverThumb,
    },
    assets: assetList.map((a) => ({
      id: a.id as string,
      width: a.width as number | null,
      height: a.height as number | null,
      thumbUrl: getAssetThumbUrl(a.thumb_key as string | null),
      webUrl: getAssetWebUrl(a.web_key as string | null),
    })),
    tokenInfo: { id: tk.id as string, expiresAt: tk.expires_at as string | null },
  }
}

export async function trackGalleryView(tokenId: string): Promise<void> {
  const supabase = svc()
  const now = new Date().toISOString()
  // Increment via RPC sería ideal; mientras tanto un select+update simple.
  const { data } = await supabase
    .from("gallery_share_tokens")
    .select("view_count")
    .eq("id", tokenId)
    .maybeSingle()
  if (!data) return
  await supabase
    .from("gallery_share_tokens")
    .update({
      view_count: ((data as { view_count: number }).view_count ?? 0) + 1,
      last_viewed_at: now,
    })
    .eq("id", tokenId)
}

/** Lista los asset_ids favoriteados por un cliente (por email). */
export async function getClientFavorites(
  galleryId: string,
  clientEmail: string | null,
): Promise<string[]> {
  const supabase = svc()
  const email = (clientEmail ?? "").trim().toLowerCase() || "anon@guest"
  const { data, error } = await supabase
    .from("gallery_favorites")
    .select("asset_id")
    .eq("gallery_id", galleryId)
    .eq("client_email", email)
  if (error) throw error
  return ((data ?? []) as Array<{ asset_id: string }>).map((r) => r.asset_id)
}

/**
 * Marca la selección del cliente como enviada y notifica al fotógrafo.
 * No borra los favoritos — quedan como evidencia de la selección.
 */
export async function submitClientSelection(
  galleryId: string,
  clientEmail: string | null,
): Promise<{ ok: true; count: number }> {
  const supabase = svc()
  const email = (clientEmail ?? "").trim().toLowerCase() || "anon@guest"

  const favIds = await getClientFavorites(galleryId, email)
  if (favIds.length === 0) {
    throw new Error("No hay fotos seleccionadas")
  }

  // Cargar contexto de la galería (studio + nombre)
  const { data: g } = await supabase
    .from("galleries")
    .select("id, studio_id, name")
    .eq("id", galleryId)
    .maybeSingle()
  const gallery = g as { id: string; studio_id: string; name: string } | null
  if (!gallery) throw new Error("Galería no encontrada")

  // Marcar la galería como con selección enviada (NO bloquear — cliente puede modificar)
  await supabase
    .from("galleries")
    .update({
      selection_submitted: true,
      selection_submitted_at: new Date().toISOString(),
      selection_submitted_by: email,
      selection_locked: false,
    })
    .eq("id", galleryId)

  // Notificar al studio (best-effort)
  try {
    await supabase.from("notifications").insert({
      studio_id: gallery.studio_id,
      type: "gallery_selection_submitted",
      title: "Cliente envió su selección",
      body: `${email} eligió ${favIds.length} foto${favIds.length === 1 ? "" : "s"} en "${gallery.name}".`,
      action_url: `/galleries/${galleryId}`,
      related_entity_type: "gallery",
      related_entity_id: galleryId,
    })
  } catch (err) {
    console.error("[submitClientSelection] notification falló:", err)
  }

  // Notificar overage de cuota si aplica (best-effort)
  try {
    const { notifyOverLimitIfNeeded } = await import(
      "./selection-quota.service"
    )
    await notifyOverLimitIfNeeded(gallery.studio_id, galleryId, email)
  } catch (err) {
    console.error("[submitClientSelection] over-limit check failed", err)
  }

  return { ok: true, count: favIds.length }
}

export async function toggleFavorite(
  galleryId: string,
  assetId: string,
  clientEmail: string | null,
  clientName: string | null,
): Promise<{ favorited: boolean }> {
  const supabase = svc()
  const email = (clientEmail ?? "").trim().toLowerCase() || "anon@guest"
  const { data: existing } = await supabase
    .from("gallery_favorites")
    .select("id")
    .eq("asset_id", assetId)
    .eq("client_email", email)
    .maybeSingle()
  if (existing) {
    const { error: delErr } = await supabase
      .from("gallery_favorites")
      .delete()
      .eq("id", existing.id as string)
    if (delErr) throw delErr
    return { favorited: false }
  }
  const { error: insErr } = await supabase.from("gallery_favorites").insert({
    gallery_id: galleryId,
    asset_id: assetId,
    client_email: email,
    client_name: clientName,
  })
  if (insErr) throw insErr

  // Automatización: al primer favorite de la galería, mover el proyecto a
  // "En edición" (idempotente — si ya está ahí, transitionTo es no-op).
  // Resolvemos studio_id desde la galería; lazy import para evitar ciclos.
  try {
    const { data: g } = await supabase
      .from("galleries")
      .select("studio_id")
      .eq("id", galleryId)
      .maybeSingle()
    const studioId = (g as { studio_id: string } | null)?.studio_id
    if (studioId) {
      const { onFavoriteReceived } = await import(
        "./project-automation.service"
      )
      await onFavoriteReceived(studioId, galleryId)
    }
  } catch (err) {
    console.error("[toggleFavorite] automation onFavoriteReceived falló:", err)
  }

  return { favorited: true }
}

export async function trackDownload(
  galleryId: string,
  assetId: string | null,
  scope: "single" | "gallery",
  resolution: "web" | "original",
  ip: string | null,
  ua: string | null,
  clientEmail: string | null,
): Promise<void> {
  const supabase = svc()
  await supabase.from("gallery_downloads").insert({
    gallery_id: galleryId,
    asset_id: assetId,
    scope,
    resolution,
    client_ip: ip,
    user_agent: ua,
    client_email: clientEmail,
  })
}

export async function getOriginalDownloadUrl(
  studioId: string,
  galleryId: string,
  assetId: string,
): Promise<string | null> {
  const supabase = svc()
  const { data } = await supabase
    .from("gallery_assets")
    .select("original_key")
    .eq("id", assetId)
    .eq("gallery_id", galleryId)
    .eq("studio_id", studioId)
    .maybeSingle()
  const key = (data as { original_key: string | null } | null)?.original_key
  if (!key) return null
  const { data: signed } = await supabase.storage
    .from(ORIGINALS_BUCKET)
    .createSignedUrl(key, SIGNED_UPLOAD_TTL)
  return signed?.signedUrl ?? null
}
