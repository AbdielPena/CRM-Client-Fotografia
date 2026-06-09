"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import { untypedService } from "@/server/supabase/untyped"
import {
  enqueueGalleryDriveBackup,
  runGalleryDriveBackup,
  type DriveTrack,
} from "@/server/services/gallery-drive.service"
import type { DriveBackupStatus } from "@/lib/galleries/drive-types"

/** Dispara (o reusa) el respaldo a Drive de una galería y lo ejecuta en background. */
export async function uploadGalleryToDriveAction(
  galleryId: string,
  track: DriveTrack = "both",
): Promise<{ ok: boolean; backupId?: string; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }
  try {
    const backupId = await enqueueGalleryDriveBackup(session.studioId, galleryId, {
      track,
      createdBy: session.userId,
    })
    // Ejecuta en background (proceso pm2 persistente). La UI hace polling del estado.
    void runGalleryDriveBackup(backupId).catch((e) => {
      console.error("[gallery-drive.action] run failed", e)
    })
    revalidatePath(`/galleries/${galleryId}`)
    return { ok: true, backupId }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error" }
  }
}

/** Estado del último respaldo a Drive de una galería (para polling en la UI). */
export async function getDriveBackupStatusAction(
  galleryId: string,
): Promise<DriveBackupStatus | null> {
  try {
    await requireStudioAuth()
  } catch {
    return null
  }
  const sb = untypedService()
  const { data } = await sb
    .from("gallery_drive_backups")
    .select(
      "id, status, track, total_assets, uploaded_assets, web_view_link, shared_with_email, last_error, updated_at",
    )
    .eq("gallery_id", galleryId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data as any
  return {
    id: r.id,
    status: r.status,
    track: r.track,
    totalAssets: r.total_assets ?? 0,
    uploadedAssets: r.uploaded_assets ?? 0,
    webViewLink: r.web_view_link ?? null,
    sharedWithEmail: r.shared_with_email ?? null,
    lastError: r.last_error ?? null,
    updatedAt: r.updated_at ?? null,
  }
}
