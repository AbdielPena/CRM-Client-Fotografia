"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createReselectionGallery,
  deleteReselectionGallery,
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
