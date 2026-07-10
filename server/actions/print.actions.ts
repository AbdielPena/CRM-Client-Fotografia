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

/** Botón del estudio: avisa al cliente que sus impresiones están listas para retirar. */
export async function notifyPrintsReadyAction(
  galleryId: string,
): Promise<{ ok: boolean; message?: string; waSent?: boolean }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }
  try {
    const { sendPrintsReadyNotification } = await import(
      "@/server/services/print-email.service"
    )
    const r = await sendPrintsReadyNotification(galleryId, session.studioId)
    revalidatePath(`/galleries/${galleryId}`)
    if (!r.ok) {
      return { ok: false, message: "No se pudo avisar (¿el cliente tiene correo?)." }
    }
    return { ok: true, waSent: r.waSent }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error" }
  }
}
