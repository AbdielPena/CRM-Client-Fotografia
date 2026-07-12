"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createReselectionGallery,
  deleteReselectionGallery,
  setGalleryFinalSelection,
  type ReselectionInfo,
  type SelectionFilter,
} from "@/server/services/reselection.service"

export async function createReselectionAction(
  galleryId: string,
  filter?: SelectionFilter,
): Promise<ReselectionInfo> {
  const ctx = await requireStudioAuth()
  const info = await createReselectionGallery(ctx.studioId, galleryId, filter)
  revalidatePath(`/galleries/${galleryId}`)
  return info
}

export async function deleteReselectionAction(galleryId: string): Promise<void> {
  const ctx = await requireStudioAuth()
  await deleteReselectionGallery(ctx.studioId, galleryId)
  revalidatePath(`/galleries/${galleryId}`)
}

export async function setFinalSelectionAction(
  galleryId: string,
  sourceGalleryId: string | null,
): Promise<{ ok: boolean; message?: string }> {
  let ctx
  try {
    ctx = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }
  try {
    await setGalleryFinalSelection(ctx.studioId, galleryId, sourceGalleryId)
    revalidatePath(`/galleries/${galleryId}`)
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error" }
  }
}
