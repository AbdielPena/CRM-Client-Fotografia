"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createReselectionGallery,
  type ReselectionInfo,
} from "@/server/services/reselection.service"

export async function createReselectionAction(
  galleryId: string,
): Promise<ReselectionInfo> {
  const ctx = await requireStudioAuth()
  const info = await createReselectionGallery(ctx.studioId, galleryId)
  revalidatePath(`/galleries/${galleryId}`)
  return info
}
