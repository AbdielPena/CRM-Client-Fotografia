"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import { setGalleryPrintLock } from "@/server/services/print-selection.service"

export async function setPrintLockAction(
  galleryId: string,
  locked: boolean,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }
  try {
    await setGalleryPrintLock(session.studioId, galleryId, locked)
    revalidatePath(`/galleries/${galleryId}`)
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error" }
  }
}
