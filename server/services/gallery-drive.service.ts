import "server-only"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { untypedService } from "@/server/supabase/untyped"
import { resolveTemplate } from "@/server/services/email-template.service"
import { enqueueEmail } from "@/server/services/email.service"
import * as drive from "@/server/services/google-drive.service"
import { getDriveConnectionStatus } from "@/server/services/google-drive-oauth.service"

/**
 * Orquestador: respalda/entrega una galería de ENTREGA FINAL a Google Drive en
 * dos pistas (espejo de print-zip.service pero subiendo a Drive en vez de ZIP):
 *
 *   /StudioFlow Entregas/{categoría}/{cliente}/{proyecto}/
 *       Máxima calidad (originales)/   ← gallery_assets.original_key (sin compresión)
 *       Redes (optimizada)/            ← gallery_assets.web_key (rendition web)
 *
 * La {categoría} sale de project.service_category_id (heredada del paquete).
 * Sin categoría → carpeta "Sin categoría".
 *
 * Comparte por email del cliente (lector) o link no listado. Avisa por email.
 * Reusa el OAuth de Google Calendar (mismo token) vía google-drive.service.
 */

const ORIGINALS_BUCKET = "gallery-originals"
const RENDITIONS_BUCKET = "gallery-renditions"
const ROOT_FOLDER = "StudioFlow Entregas"

export type DriveTrack = "social" | "high_quality" | "both"

function sanitize(s: string): string {
  return (s || "").replace(/[/\\:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "_"
}

function baseName(originalName: string | null, id: string): string {
  const n = (originalName || "").replace(/\.[^.]+$/, "")
  return sanitize(n) || id.slice(0, 8)
}

interface BackupRow {
  id: string
  studio_id: string
  gallery_id: string
  project_id: string | null
  client_id: string | null
  track: DriveTrack
  status: string
  uploaded_assets: number | null
  bytes_uploaded: number | null
}

/**
 * Encola un backup de Drive para una galería (idempotente: reusa el activo si
 * ya existe). Devuelve el id del backup.
 */
export async function enqueueGalleryDriveBackup(
  studioId: string,
  galleryId: string,
  opts: { track?: DriveTrack; createdBy?: string | null } = {},
): Promise<string> {
  const sb = untypedService()
  const { data: g } = await sb
    .from("galleries")
    .select("id, studio_id, project_id, client_id")
    .eq("id", galleryId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!g) throw new Error("Galería no encontrada")

  const { data: existing } = await sb
    .from("gallery_drive_backups")
    .select("id")
    .eq("gallery_id", galleryId)
    .in("status", ["pending", "running", "uploading"])
    .maybeSingle()
  if (existing) return (existing as { id: string }).id

  const row = g as { project_id: string | null; client_id: string | null }
  const { data: created, error } = await sb
    .from("gallery_drive_backups")
    .insert({
      studio_id: studioId,
      gallery_id: galleryId,
      project_id: row.project_id,
      client_id: row.client_id,
      track: opts.track ?? "both",
      status: "pending",
      created_by: opts.createdBy ?? null,
    })
    .select("id")
    .single()
  if (error) throw error
  return (created as { id: string }).id
}

/** Ejecuta un backup de Drive (descarga assets del storage y los sube a Drive). */
export async function runGalleryDriveBackup(backupId: string): Promise<void> {
  const sb = untypedService()
  const storage = createSupabaseServiceClient()

  const { data: bRaw } = await sb
    .from("gallery_drive_backups")
    .select("*")
    .eq("id", backupId)
    .maybeSingle()
  const b = bRaw as BackupRow | null
  if (!b || b.status === "completed") return

  await sb
    .from("gallery_drive_backups")
    .update({ status: "running", started_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
    .eq("id", backupId)

  try {
    const studioId = b.studio_id

    // Nombres de cliente / proyecto / galería.
    const { data: g } = await sb
      .from("galleries")
      .select("id, name, client_id, project_id")
      .eq("id", b.gallery_id)
      .maybeSingle()
    const gallery = g as { name: string; client_id: string | null; project_id: string | null } | null
    let clientName = "Cliente"
    let clientEmail: string | null = null
    let projectName = gallery?.name ?? "Galería"
    let categoryFolder = "Sin categoría"
    if (gallery?.client_id) {
      const { data: c } = await sb.from("clients").select("name, email").eq("id", gallery.client_id).maybeSingle()
      const cc = c as { name?: string; email?: string } | null
      if (cc?.name) clientName = cc.name
      clientEmail = cc?.email ?? null
    }
    if (gallery?.project_id) {
      const { data: p } = await sb
        .from("projects")
        .select("name, service_category_id")
        .eq("id", gallery.project_id)
        .maybeSingle()
      const pp = p as { name?: string; service_category_id?: string | null } | null
      if (pp?.name) projectName = pp.name
      // Carpeta de categoría: prioriza drive_folder_name (configurable) sobre el nombre.
      if (pp?.service_category_id) {
        const { data: cat } = await sb
          .from("service_categories")
          .select("name, drive_folder_name")
          .eq("id", pp.service_category_id)
          .maybeSingle()
        const cc = cat as { name?: string; drive_folder_name?: string | null } | null
        const folder = cc?.drive_folder_name || cc?.name
        if (folder) categoryFolder = folder
      }
    }

    const tracks: Array<"high_quality" | "social"> =
      b.track === "both" ? ["high_quality", "social"] : [b.track as "high_quality" | "social"]

    const { data: assetsRaw } = await sb
      .from("gallery_assets")
      .select("id, original_name, original_key, web_key, mime_type, delivery_track")
      .eq("gallery_id", b.gallery_id)
      .eq("status", "completed")
    const allAssets = (assetsRaw ?? []) as Array<{
      id: string
      original_name: string | null
      original_key: string | null
      web_key: string | null
      mime_type: string | null
      delivery_track: "high_quality" | "social" | null
    }>

    // Determinar la pista efectiva de cada foto:
    //  - Si la galería tiene fotos con delivery_track → SOLO esas son la entrega
    //    final; las demás (delivery_track=null) son fotos de prueba de la
    //    selección y NO se respaldan.
    //  - Si NINGUNA tiene track (entrega final "pura"/vieja) → todas van a
    //    Máxima Calidad como respaldo.
    // Cada foto va a UNA sola carpeta (no se duplica en ambas).
    const hasAnyTrack = allAssets.some((a) => a.delivery_track !== null)
    const assets = allAssets
      .map((a) => ({
        ...a,
        track: (a.delivery_track ?? (hasAnyTrack ? null : "high_quality")) as
          | "high_quality"
          | "social"
          | null,
      }))
      .filter((a) => a.track !== null && tracks.includes(a.track))

    // Carpetas: /StudioFlow Entregas/{categoría}/{cliente}/{proyecto}/
    const projectFolderId = await drive.ensureFolderPath(studioId, [
      ROOT_FOLDER,
      sanitize(categoryFolder),
      sanitize(clientName),
      sanitize(projectName),
    ])
    const folderIds: { high_quality?: string; social?: string } = {}
    if (tracks.includes("high_quality"))
      folderIds.high_quality = await drive.ensureFolder(studioId, "Máxima calidad (originales)", projectFolderId)
    if (tracks.includes("social"))
      folderIds.social = await drive.ensureFolder(studioId, "Redes (optimizada)", projectFolderId)

    await sb
      .from("gallery_drive_backups")
      .update({
        status: "uploading",
        root_folder_id: projectFolderId,
        high_quality_folder_id: folderIds.high_quality ?? null,
        social_folder_id: folderIds.social ?? null,
        total_assets: assets.length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", backupId)

    let uploaded = 0
    let bytes = 0
    for (const a of assets) {
      // Cada foto va SOLO a la carpeta de su pista (no se duplica).
      const tr = a.track
      if (!tr) continue
      const key = tr === "high_quality" ? a.original_key : a.web_key
      const bucket = tr === "high_quality" ? ORIGINALS_BUCKET : RENDITIONS_BUCKET
      if (!key) continue
      const { data: blob, error } = await storage.storage.from(bucket).download(key)
      if (error || !blob) {
        console.error("[gallery-drive] download fail", a.id, tr, error)
        continue
      }
      const buf = Buffer.from(await blob.arrayBuffer())
      const folderId = folderIds[tr]
      if (!folderId) continue
      const ext = tr === "high_quality" ? (a.original_name?.split(".").pop() ?? "jpg") : "webp"
      const name = `${baseName(a.original_name, a.id)}${tr === "social" ? "_web" : ""}.${ext}`
      const mime = tr === "high_quality" ? (a.mime_type ?? "image/jpeg") : "image/webp"
      try {
        await drive.uploadFile(studioId, folderId, name, buf, mime)
        uploaded += 1
        bytes += buf.length
      } catch (e) {
        console.error("[gallery-drive] upload fail", a.id, tr, e)
      }
      await sb
        .from("gallery_drive_backups")
        .update({ uploaded_assets: uploaded, bytes_uploaded: bytes, updated_at: new Date().toISOString() })
        .eq("id", backupId)
    }

    // Compartir como "cualquiera con el enlace" (lector, sin descubrimiento/indexado).
    await drive.shareFolder(studioId, projectFolderId, {})
    const link = await drive.getFileLink(studioId, projectFolderId)

    const total = assets.length
    const finalStatus = uploaded === 0 && total > 0 ? "failed" : uploaded < total ? "partial" : "completed"

    await sb
      .from("gallery_drive_backups")
      .update({
        status: finalStatus,
        web_view_link: link,
        shared_with_email: clientEmail,
        share_type: "anyone_with_link",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_error: finalStatus === "failed" ? "No se subió ningún archivo" : null,
      })
      .eq("id", backupId)

    // Email al cliente con el link (best-effort).
    if (finalStatus !== "failed" && link && clientEmail) {
      try {
        await sendDriveLinkEmail({
          studioId,
          galleryName: gallery?.name ?? projectName,
          clientName,
          clientEmail,
          driveLink: link,
          backupId,
        })
      } catch (e) {
        console.error("[gallery-drive] email fail", e)
      }
    }
  } catch (e) {
    await sb
      .from("gallery_drive_backups")
      .update({
        status: "failed",
        last_error: e instanceof Error ? e.message : String(e),
        updated_at: new Date().toISOString(),
      })
      .eq("id", backupId)
    throw e
  }
}

async function sendDriveLinkEmail(input: {
  studioId: string
  galleryName: string
  clientName: string
  clientEmail: string
  driveLink: string
  backupId: string
}): Promise<void> {
  const sb = untypedService()
  const { data: studioRow } = await sb
    .from("studios")
    .select("name, email")
    .eq("id", input.studioId)
    .maybeSingle()
  const studio = studioRow as { name?: string; email?: string } | null
  const studioName = studio?.name ?? "Tu fotógrafo"

  const tpl = await resolveTemplate(
    input.studioId,
    "gallery_drive_link_available",
    {
      client_name: input.clientName,
      gallery_name: input.galleryName,
      drive_link: input.driveLink,
      studio_name: studioName,
    },
    {
      subject: `Tu entrega en Google Drive — ${input.galleryName}`,
      bodyHtml: `<p>Hola ${input.clientName},</p><p>Te dejamos la entrega de <strong>${input.galleryName}</strong> en Google Drive (puedes descargar todo): <a href="${input.driveLink}">abrir carpeta</a>.</p><p>— ${studioName}</p>`,
    },
  )

  await enqueueEmail({
    studioId: input.studioId,
    toEmail: input.clientEmail,
    toName: input.clientName,
    fromEmail: studio?.email ?? null,
    fromName: tpl.fromName ?? studioName,
    replyTo: tpl.replyTo ?? studio?.email ?? null,
    subject: tpl.subject,
    bodyHtml: tpl.bodyHtml,
    relatedEntityType: "gallery",
    relatedEntityId: input.backupId,
  })

  await sb
    .from("gallery_drive_backups")
    .update({ email_sent_at: new Date().toISOString() })
    .eq("id", input.backupId)
}

/**
 * Estado de la conexión de Google Drive del studio (reusa el OAuth de Calendar).
 * `connected` = hay refresh token Y el scope incluye drive.file.
 */
export async function getGoogleDriveStatus(
  studioId: string,
): Promise<{ connected: boolean; email: string | null; needsReconnect: boolean }> {
  // Conexión de Drive DEDICADA (service='google_drive'), separada de Calendar.
  const s = await getDriveConnectionStatus(studioId)
  return { connected: s.connected, email: s.email, needsReconnect: false }
}

/** Worker: drena backups pendientes (llamado por el cron endpoint). */
export async function drainPendingDriveBackups(limit = 3): Promise<{ processed: number }> {
  const sb = untypedService()
  const { data } = await sb
    .from("gallery_drive_backups")
    .select("id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit)
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id)
  let processed = 0
  for (const id of ids) {
    try {
      await runGalleryDriveBackup(id)
      processed += 1
    } catch (e) {
      console.error("[gallery-drive] backup failed", id, e)
    }
  }
  return { processed }
}
