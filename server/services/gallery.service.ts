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
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/supabase"

import { createSupabaseServerClient } from "@/server/supabase/server"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { defaultTemplateForType } from "@/lib/galleries/templates"
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
  // Galerías 2.0
  gallery_type: "selection" | "final_delivery"
  template_id: string
  theme: Record<string, unknown>
  cover_config: Record<string, unknown>
  subtitle: string | null
  welcome_text: string | null
  availability_days: number | null
  package_id: string | null
  embed_enabled: boolean
  embed_token: string | null
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
  // Galerías 2.0: pista de entrega
  delivery_track: "social" | "high_quality" | null
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
  return { rows: (data ?? []) as unknown as GalleryRow[], total: count ?? 0 }
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
  return (data as unknown as GalleryRow | null) ?? null
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
  // Galerías 2.0
  galleryType?: "selection" | "final_delivery"
  templateId?: string | null
  availabilityDays?: number | null
  packageId?: string | null
}

/**
 * Valida que el cliente / proyecto referenciado exista y NO esté en trash.
 * No falla si ambos son null (galería sin cliente/proyecto es válida en el modelo).
 */
async function assertGalleryParentsActive(
  studioId: string,
  clientId: string | null | undefined,
  projectId: string | null | undefined,
): Promise<void> {
  const supabase = srvc()
  if (clientId) {
    const { data, error } = await supabase
      .from('clients')
      .select('id, deleted_at')
      .eq('id', clientId)
      .eq('studio_id', studioId)
      .maybeSingle()
    if (error) throw new Error(`[createGallery] ${error.message}`)
    if (!data) throw new Error('CLIENT_NOT_FOUND')
    if (data.deleted_at) throw new Error('CLIENT_TRASHED')
  }
  if (projectId) {
    const { data, error } = await supabase
      .from('projects')
      .select('id, deleted_at, client_id, client:clients(id, deleted_at)')
      .eq('id', projectId)
      .eq('studio_id', studioId)
      .maybeSingle()
    if (error) throw new Error(`[createGallery] ${error.message}`)
    if (!data) throw new Error('PROJECT_NOT_FOUND')
    if (data.deleted_at) throw new Error('PROJECT_TRASHED')
    const projClient = Array.isArray(data.client) ? data.client[0] : data.client
    if (projClient?.deleted_at) throw new Error('CLIENT_TRASHED')
  }
}

export async function createGallery(
  studioId: string,
  actorId: string,
  data: CreateGalleryInput,
): Promise<GalleryRow> {
  // Integridad: si la galería referencia cliente/proyecto, deben existir y estar activos.
  await assertGalleryParentsActive(studioId, data.clientId, data.projectId)

  const supabase = srvc()
  const db = supabase as unknown as SupabaseClient
  const slug = uniqueSlug(data.name)

  const galleryType: "selection" | "final_delivery" =
    data.galleryType === "final_delivery" ? "final_delivery" : "selection"

  // Heredar el paquete del proyecto vinculado si no se especificó explícitamente.
  // Es la única vía por la que una galería de entrega final obtiene su package_id,
  // necesario para resolver los entitlements de impresión (álbum/marcos/prints).
  let packageId = data.packageId ?? null
  if (!packageId && data.projectId) {
    const { data: proj } = await db
      .from("projects")
      .select("package_id")
      .eq("id", data.projectId)
      .eq("studio_id", studioId)
      .maybeSingle()
    if (proj?.package_id) packageId = proj.package_id as string
  }

  // Heredar defaults del plan (si la galería referencia un paquete).
  let availabilityDays = data.availabilityDays ?? null
  let templateId = data.templateId ?? null
  if (packageId) {
    const { data: pkg } = await db
      .from("packages")
      .select("gallery_availability_days, gallery_default_template")
      .eq("id", packageId)
      .eq("studio_id", studioId)
      .maybeSingle()
    if (pkg) {
      if (availabilityDays == null && pkg.gallery_availability_days != null)
        availabilityDays = pkg.gallery_availability_days as number
      if (!templateId && pkg.gallery_default_template)
        templateId = pkg.gallery_default_template as string
    }
  }
  if (!templateId) templateId = defaultTemplateForType(galleryType)

  const { data: row, error } = await db
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
      gallery_type: galleryType,
      template_id: templateId,
      availability_days: availabilityDays,
      package_id: packageId,
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
  // Galerías 2.0
  galleryType?: "selection" | "final_delivery"
  templateId?: string
  theme?: Record<string, unknown>
  coverConfig?: Record<string, unknown>
  subtitle?: string | null
  welcomeText?: string | null
  availabilityDays?: number | null
  packageId?: string | null
  embedEnabled?: boolean
  embedToken?: string | null
}

export async function updateGallery(
  studioId: string,
  _actorId: string,
  galleryId: string,
  data: UpdateGalleryInput,
): Promise<GalleryRow> {
  const db = srvc() as unknown as SupabaseClient
  const patch: Record<string, unknown> = {}

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

  // Galerías 2.0
  if (data.galleryType !== undefined) patch.gallery_type = data.galleryType
  if (data.templateId !== undefined) patch.template_id = data.templateId
  if (data.theme !== undefined) patch.theme = data.theme
  if (data.coverConfig !== undefined) patch.cover_config = data.coverConfig
  if (data.subtitle !== undefined) patch.subtitle = data.subtitle?.trim() || null
  if (data.welcomeText !== undefined) patch.welcome_text = data.welcomeText?.trim() || null
  if (data.availabilityDays !== undefined) patch.availability_days = data.availabilityDays
  if (data.packageId !== undefined) patch.package_id = data.packageId
  if (data.embedEnabled !== undefined) patch.embed_enabled = data.embedEnabled
  if (data.embedToken !== undefined) patch.embed_token = data.embedToken

  const { data: row, error } = await db
    .from("galleries")
    .update(patch)
    .eq("id", galleryId)
    .eq("studio_id", studioId)
    .select("*")
    .single()
  if (error) throw error
  return row as GalleryRow
}

export const DEFAULT_GALLERY_AVAILABILITY_DAYS = 30

export async function publishGallery(
  studioId: string,
  actorId: string,
  galleryId: string,
): Promise<GalleryRow> {
  const current = await getGalleryById(studioId, galleryId)
  const patch: UpdateGalleryInput = { status: "published" }

  // Calcular expiración al publicar si aún no tiene una fecha fija.
  if (current && !current.expires_at) {
    let days = current.availability_days ?? null
    if (days == null && current.package_id) {
      const db = srvc() as unknown as SupabaseClient
      const { data: pkg } = await db
        .from("packages")
        .select("gallery_availability_days")
        .eq("id", current.package_id)
        .eq("studio_id", studioId)
        .maybeSingle()
      if (pkg?.gallery_availability_days != null) days = pkg.gallery_availability_days as number
    }
    if (days == null) days = DEFAULT_GALLERY_AVAILABILITY_DAYS
    if (days > 0) {
      const exp = new Date()
      exp.setDate(exp.getDate() + days)
      patch.expiresAt = exp.toISOString()
    }
  }

  const updated = await updateGallery(studioId, actorId, galleryId, patch)

  // Pipeline por cliente: publicar una galería de ENTREGA FINAL cierra la etapa
  // de entrega → proyecto a "Entregado" + crea la tarea "Enviar impresiones".
  // Best-effort: nunca rompe la publicación.
  const gType = (current as { gallery_type?: string | null } | null)?.gallery_type
  const gProjectId = (current as { project_id?: string | null } | null)?.project_id
  if (gType === "final_delivery" && gProjectId) {
    void (async () => {
      try {
        const { onFinalDeliveryPublished } = await import(
          "./project-automation.service"
        )
        await onFinalDeliveryPublished(studioId, gProjectId)
      } catch (err) {
        console.error("[gallery] onFinalDeliveryPublished failed", err)
      }
    })()
  }

  // Si el plan incluye entregables impresos: habilita la selección de impresión
  // y avisa al cliente por email. Best-effort.
  if (gType === "final_delivery") {
    void (async () => {
      try {
        const { maybeEnablePrintSelection } = await import(
          "./print-selection.service"
        )
        await maybeEnablePrintSelection(galleryId)
      } catch (err) {
        console.error("[gallery] maybeEnablePrintSelection failed", err)
      }
    })()
  }

  // Engagement Hub: dispara automatizaciones de "entrega final" (gracias /
  // feedback / reseña post-entrega). Best-effort.
  if (gType === "final_delivery") {
    void (async () => {
      try {
        const { enrollByFinalDelivery } = await import("./engagement.service")
        await enrollByFinalDelivery(studioId, galleryId)
      } catch (err) {
        console.error("[gallery] engagement enrollByFinalDelivery failed", err)
      }
    })()
  }

  // Galería de SELECCIÓN recién publicada → avisar al cliente que ya puede
  // elegir sus fotos (con el enlace público). Solo en la PRIMERA publicación
  // (draft → published), nunca al re-guardar una ya publicada. Best-effort.
  if (gType !== "final_delivery" && current?.status !== "published") {
    void (async () => {
      try {
        const { onSelectionGalleryPublished } = await import("./selection-email.service")
        await onSelectionGalleryPublished(galleryId)
      } catch (err) {
        console.error("[gallery] onSelectionGalleryPublished failed", err)
      }
    })()
  }

  // Evento de automatización (best-effort). Solo en la PRIMERA publicación
  // (cualquier tipo de galería), no al re-guardar una ya publicada.
  if (current?.status !== "published") {
    void (async () => {
      try {
        const { dispatchAutomationEvent } = await import("./automation.service")
        await dispatchAutomationEvent({
          studioId,
          event: "gallery.published",
          entityType: "gallery",
          entityId: galleryId,
          payload: {
            gallery_id: galleryId,
            client_id: (current as { client_id?: string | null } | null)?.client_id ?? null,
            gallery_type: gType ?? null,
          },
        })
      } catch (err) {
        console.error("[gallery] dispatch gallery.published failed", err)
      }
    })()
  }

  return updated
}

/** Asigna la pista de entrega (Redes / Máxima Calidad) a varios assets. */
export async function setAssetsDeliveryTrack(
  studioId: string,
  galleryId: string,
  assetIds: string[],
  track: "social" | "high_quality" | null,
): Promise<void> {
  if (assetIds.length === 0) return
  const db = srvc() as unknown as SupabaseClient
  const { error } = await db
    .from("gallery_assets")
    .update({ delivery_track: track })
    .eq("studio_id", studioId)
    .eq("gallery_id", galleryId)
    .in("id", assetIds)
  if (error) throw error
}

/** Activa/desactiva el embed; genera el token la primera vez y lo preserva. */
export async function setGalleryEmbed(
  studioId: string,
  actorId: string,
  galleryId: string,
  enabled: boolean,
): Promise<{ embedEnabled: boolean; embedToken: string | null }> {
  const current = await getGalleryById(studioId, galleryId)
  const patch: UpdateGalleryInput = { embedEnabled: enabled }
  if (enabled && !current?.embed_token) {
    patch.embedToken = `emb_${randomUUID().replace(/-/g, "")}`
  }
  const row = await updateGallery(studioId, actorId, galleryId, patch)
  return { embedEnabled: row.embed_enabled, embedToken: row.embed_token }
}

export type FavoriteSelection = {
  clientEmail: string
  assetIds: string[]
}

/**
 * Selecciones hechas con FAVORITOS (❤️), agrupadas por email del cliente.
 * Es el flujo de "Avisar al fotógrafo" (submitClientSelection toma los
 * favoritos como la selección) — la pestaña Selecciones del estudio las
 * muestra junto a las listas nombradas (gallery_collections).
 */
export async function getFavoriteSelections(
  galleryId: string,
): Promise<FavoriteSelection[]> {
  const supabase = svc()
  const { data } = await supabase
    .from("gallery_favorites")
    .select("client_email, asset_id, created_at")
    .eq("gallery_id", galleryId)
    .order("created_at", { ascending: true })
  const map = new Map<string, string[]>()
  for (const r of (data ?? []) as Array<{ client_email: string; asset_id: string }>) {
    const arr = map.get(r.client_email) ?? []
    arr.push(r.asset_id)
    map.set(r.client_email, arr)
  }
  return Array.from(map.entries()).map(([clientEmail, assetIds]) => ({
    clientEmail,
    assetIds,
  }))
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

  return asset as unknown as GalleryAssetRow
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

    // Decompression bomb defense: rechazar imágenes con dimensiones absurdas
    // que podrían tumbar el servidor al descomprimir (ej: 50000x50000 px).
    // Cap: 100 megapixels (suficiente para fotos 100MP de cámara modernas).
    const MAX_PIXELS = 100_000_000
    const totalPixels = (meta.width ?? 0) * (meta.height ?? 0)
    if (totalPixels > MAX_PIXELS) {
      throw new Error(
        `IMAGE_TOO_LARGE: ${meta.width}x${meta.height} (${totalPixels} px) excede el límite de ${MAX_PIXELS} px`,
      )
    }

    // Sharp options con limit de input pixels — defensa adicional contra
    // decompression bombs en el procesamiento mismo.
    const sharpOpts = { limitInputPixels: MAX_PIXELS }

    const thumbBuf = await sharp(buffer, sharpOpts)
      .rotate()
      .resize({ width: 400, height: 400, fit: "cover", withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer()

    let webBuf = await sharp(buffer, sharpOpts)
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

    // LQIP: placeholder diminuto (data URI ~1KB) para evitar el "pop-in" gris
    // del grid mientras carga. Se calcula sobre el buffer ya en memoria (costo
    // casi cero) y se guarda en metadata. Sin dependencia nueva (Sharp ya está).
    let lqip: string | null = null
    try {
      const lqipBuf = await sharp(buffer, sharpOpts)
        .rotate()
        .resize({ width: 24, withoutEnlargement: true })
        .webp({ quality: 40 })
        .toBuffer()
      lqip = `data:image/webp;base64,${lqipBuf.toString("base64")}`
    } catch {
      /* LQIP es best-effort; si falla seguimos sin él */
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
          lqip,
          aspect: meta.width && meta.height ? meta.width / meta.height : null,
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
  return (data ?? []) as unknown as GalleryAssetRow[]
}

export type GalleryActivity = {
  views: number
  lastViewedAt: string | null
  downloads: number
  favoritesTotal: number
  uniqueVisitors: number
  topFavorites: Array<{ assetId: string; count: number; thumbUrl: string | null }>
}

/** Métricas de actividad de una galería (data ya capturada, sin migración). */
export async function getGalleryActivity(
  studioId: string,
  galleryId: string,
): Promise<GalleryActivity> {
  const db = svc() as unknown as SupabaseClient

  const [tokensRes, downloadsRes, favsRes] = await Promise.all([
    db
      .from("gallery_share_tokens")
      .select("view_count, last_viewed_at")
      .eq("gallery_id", galleryId)
      .eq("studio_id", studioId),
    db
      .from("gallery_downloads")
      .select("id", { count: "exact", head: true })
      .eq("gallery_id", galleryId),
    db.from("gallery_favorites").select("asset_id, client_email").eq("gallery_id", galleryId),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokens = (tokensRes.data ?? []) as any[]
  const views = tokens.reduce((s, t) => s + (Number(t.view_count) || 0), 0)
  const lastViewedAt =
    tokens
      .map((t) => t.last_viewed_at as string | null)
      .filter((x): x is string => !!x)
      .sort()
      .pop() ?? null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const favs = (favsRes.data ?? []) as any[]
  const uniqueVisitors = new Set(favs.map((f) => (f.client_email as string) || "anon")).size
  const favCount = new Map<string, number>()
  for (const f of favs) {
    const id = f.asset_id as string
    favCount.set(id, (favCount.get(id) ?? 0) + 1)
  }
  const topEntries = [...favCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)

  let topFavorites: GalleryActivity["topFavorites"] = []
  if (topEntries.length) {
    const ids = topEntries.map(([id]) => id)
    const { data: assets } = await db
      .from("gallery_assets")
      .select("id, thumb_key")
      .in("id", ids)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const thumbById = new Map((assets ?? []).map((a: any) => [a.id, a.thumb_key]))
    topFavorites = topEntries.map(([assetId, count]) => ({
      assetId,
      count,
      thumbUrl: getAssetThumbUrl((thumbById.get(assetId) as string | null) ?? null),
    }))
  }

  return {
    views,
    lastViewedAt,
    downloads: downloadsRes.count ?? 0,
    favoritesTotal: favs.length,
    uniqueVisitors,
    topFavorites,
  }
}

/**
 * Captura como lead a un invitado que dejó su email en una galería pública,
 * siempre que NO sea el cliente dueño ni un cliente existente del estudio.
 * Idempotente y best-effort (no rompe el flujo del visor si falla).
 */
export async function captureGuestLead(
  galleryId: string,
  email: string | null,
  name: string | null,
): Promise<void> {
  const cleanEmail = (email ?? "").trim().toLowerCase()
  if (!cleanEmail || !cleanEmail.includes("@")) return
  const db = svc() as unknown as SupabaseClient
  try {
    const { data: g } = await db
      .from("galleries")
      .select("studio_id, client_id")
      .eq("id", galleryId)
      .maybeSingle()
    if (!g) return

    // No es lead si el email es del cliente dueño de la galería.
    if (g.client_id) {
      const { data: c } = await db
        .from("clients")
        .select("email")
        .eq("id", g.client_id)
        .maybeSingle()
      if (c?.email && String(c.email).trim().toLowerCase() === cleanEmail) return
    }
    // No es lead si ya es cliente del estudio.
    const { data: existingClient } = await db
      .from("clients")
      .select("id")
      .eq("studio_id", g.studio_id)
      .eq("email", cleanEmail)
      .is("deleted_at", null)
      .maybeSingle()
    if (existingClient) return
    // Idempotente: no duplicar lead con el mismo email.
    const { data: existingLead } = await db
      .from("leads")
      .select("id")
      .eq("studio_id", g.studio_id)
      .eq("email", cleanEmail)
      .maybeSingle()
    if (existingLead) return

    await db.from("leads").insert({
      studio_id: g.studio_id,
      name: (name ?? "").trim() || cleanEmail.split("@")[0],
      email: cleanEmail,
      source: "gallery_guest",
      status: "new",
      currency: "DOP",
    })
  } catch (err) {
    console.error("[captureGuestLead]", err)
  }
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

export type PublicGalleryAsset = {
  id: string
  width: number | null
  height: number | null
  aspect: number | null
  lqip: string | null
  deliveryTrack: "social" | "high_quality" | null
  thumbUrl: string | null
  webUrl: string | null
}

export type PublicGalleryView = {
  gallery: {
    id: string
    studioId: string
    name: string
    description: string | null
    subtitle: string | null
    welcomeText: string | null
    visibility: GalleryRow["visibility"]
    allow_download: boolean
    require_email: boolean
    galleryType: "selection" | "final_delivery"
    templateId: string
    theme: Record<string, unknown>
    coverConfig: Record<string, unknown>
    accentColor: string | null
    eventDate: string | null
    expiresAt: string | null
    coverThumbUrl: string | null
    coverWebUrl: string | null
  }
  assets: PublicGalleryAsset[]
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
  const db = supabase as unknown as SupabaseClient

  const { data: tk } = await supabase
    .from("gallery_share_tokens")
    .select("id, gallery_id, studio_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle()
  if (!tk || tk.revoked_at) return null
  if (tk.expires_at && new Date(tk.expires_at).getTime() < Date.now()) return null

  const { data: gallery } = await db
    .from("galleries")
    .select(
      "id, studio_id, name, description, subtitle, welcome_text, visibility, allow_download, require_email, status, cover_asset_id, gallery_type, template_id, theme, cover_config, accent_color, event_date, expires_at",
    )
    .eq("id", tk.gallery_id)
    .is("deleted_at", null)
    .maybeSingle()
  if (!gallery || gallery.status !== "published") return null

  const { data: assets } = await db
    .from("gallery_assets")
    .select("id, width, height, thumb_key, web_key, status, metadata, delivery_track")
    .eq("gallery_id", tk.gallery_id)
    .is("deleted_at", null)
    .eq("status", "completed")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assetList = (assets ?? []) as any[]

  // Portada: usa el cover elegido, o el primer asset como respaldo.
  const coverAsset =
    (gallery.cover_asset_id && assetList.find((a) => a.id === gallery.cover_asset_id)) ||
    assetList[0] ||
    null
  const coverThumb = getAssetThumbUrl((coverAsset?.thumb_key as string | null) ?? null)
  const coverWeb = getAssetWebUrl((coverAsset?.web_key as string | null) ?? null)

  const metaOf = (a: Record<string, unknown>) =>
    (a.metadata && typeof a.metadata === "object" ? a.metadata : {}) as Record<string, unknown>

  return {
    gallery: {
      id: gallery.id as string,
      studioId: gallery.studio_id as string,
      name: gallery.name as string,
      description: gallery.description as string | null,
      subtitle: (gallery.subtitle as string | null) ?? null,
      welcomeText: (gallery.welcome_text as string | null) ?? null,
      visibility: gallery.visibility as GalleryRow["visibility"],
      allow_download: gallery.allow_download as boolean,
      require_email: gallery.require_email as boolean,
      galleryType: ((gallery.gallery_type as string) === "final_delivery"
        ? "final_delivery"
        : "selection") as "selection" | "final_delivery",
      templateId: (gallery.template_id as string) ?? "classic_proofing",
      theme: (gallery.theme as Record<string, unknown>) ?? {},
      coverConfig: (gallery.cover_config as Record<string, unknown>) ?? {},
      accentColor: (gallery.accent_color as string | null) ?? null,
      eventDate: (gallery.event_date as string | null) ?? null,
      expiresAt: (gallery.expires_at as string | null) ?? null,
      coverThumbUrl: coverThumb,
      coverWebUrl: coverWeb,
    },
    assets: assetList.map((a): PublicGalleryAsset => {
      const m = metaOf(a)
      return {
        id: a.id as string,
        width: a.width as number | null,
        height: a.height as number | null,
        aspect: typeof m.aspect === "number" ? (m.aspect as number) : null,
        lqip: typeof m.lqip === "string" ? (m.lqip as string) : null,
        deliveryTrack:
          a.delivery_track === "social" || a.delivery_track === "high_quality"
            ? a.delivery_track
            : null,
        thumbUrl: getAssetThumbUrl(a.thumb_key as string | null),
        webUrl: getAssetWebUrl(a.web_key as string | null),
      }
    }),
    tokenInfo: { id: tk.id as string, expiresAt: tk.expires_at as string | null },
  }
}

// ─── API interna por ID (web local en el mismo servidor) ────────────────────

export type EmbedGalleryResult =
  | { ok: false; reason: "not_found" | "forbidden" }
  | { ok: true; etag: string; data: Record<string, unknown> }

/**
 * Resuelve una galería por ID para consumo desde una web LOCAL co-alojada
 * (no externa). Requiere que esté publicada + embed habilitado + key válida
 * (el `embed_token` de la galería, o `INTERNAL_API_KEY` del entorno).
 */
export async function getEmbeddableGallery(
  galleryId: string,
  key: string | null,
  opts: { page?: number; pageSize?: number; scope?: "summary" | "full" } = {},
): Promise<EmbedGalleryResult> {
  const db = svc() as unknown as SupabaseClient

  const { data: g } = await db
    .from("galleries")
    .select(
      "id, studio_id, name, slug, description, subtitle, gallery_type, template_id, theme, cover_config, accent_color, event_date, layout_grid, status, expires_at, embed_enabled, embed_token, cover_asset_id, updated_at",
    )
    .eq("id", galleryId)
    .is("deleted_at", null)
    .maybeSingle()

  if (!g || g.status !== "published" || !g.embed_enabled) {
    return { ok: false, reason: "not_found" }
  }

  const internalKey = process.env["INTERNAL_API_KEY"] ?? null
  const keyOk = (!!key && key === g.embed_token) || (!!internalKey && key === internalKey)
  if (!keyOk) return { ok: false, reason: "forbidden" }

  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 60))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data: sets } = await db
    .from("gallery_sets")
    .select("id, name, sort_order, asset_count")
    .eq("gallery_id", galleryId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })

  const { data: assets, count } = await db
    .from("gallery_assets")
    .select("id, width, height, thumb_key, web_key, metadata, delivery_track, set_id, sort_order", {
      count: "exact",
    })
    .eq("gallery_id", galleryId)
    .is("deleted_at", null)
    .eq("status", "completed")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .range(from, to)

  const total = count ?? 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (assets ?? []) as any[]

  // Portada (puede no estar en la página actual): query puntual.
  let coverUrl: string | null = null
  if (g.cover_asset_id) {
    const { data: cov } = await db
      .from("gallery_assets")
      .select("web_key")
      .eq("id", g.cover_asset_id)
      .maybeSingle()
    coverUrl = getAssetWebUrl((cov?.web_key as string | null) ?? null)
  } else if (list[0]) {
    coverUrl = getAssetWebUrl((list[0].web_key as string | null) ?? null)
  }

  const metaOf = (a: Record<string, unknown>) =>
    (a.metadata && typeof a.metadata === "object" ? a.metadata : {}) as Record<string, unknown>
  const includeOriginal = opts.scope === "full"

  const data: Record<string, unknown> = {
    gallery: {
      id: g.id,
      studioId: g.studio_id,
      name: g.name,
      slug: g.slug,
      type: g.gallery_type,
      description: g.description,
      subtitle: g.subtitle,
      templateId: g.template_id,
      theme: g.theme ?? {},
      coverConfig: g.cover_config ?? {},
      accentColor: g.accent_color,
      layoutGrid: g.layout_grid,
      eventDate: g.event_date,
      status: g.status,
      expiresAt: g.expires_at,
      cover: coverUrl ? { url: coverUrl } : null,
      updatedAt: g.updated_at,
    },
    sections: (sets ?? []).map((s: Record<string, unknown>) => ({
      id: s.id,
      name: s.name,
      sort: s.sort_order,
      count: s.asset_count,
    })),
    assets: list.map((a) => {
      const m = metaOf(a)
      return {
        id: a.id,
        w: a.width,
        h: a.height,
        ratio: typeof m.aspect === "number" ? m.aspect : null,
        blurhash: typeof m.lqip === "string" ? m.lqip : null,
        sort: a.sort_order,
        sectionId: a.set_id ?? null,
        deliveryTrack: a.delivery_track ?? null,
        urls: {
          thumb: getAssetThumbUrl(a.thumb_key as string | null),
          web: getAssetWebUrl(a.web_key as string | null),
          ...(includeOriginal ? { original: null } : {}),
        },
      }
    }),
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  }

  const etag = `W/"${String(g.updated_at).replace(/[^0-9]/g, "")}-${total}"`
  return { ok: true, etag, data }
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
