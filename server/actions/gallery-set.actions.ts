"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createSet,
  deleteSet,
  moveAssetsToSet,
  reorderSets,
  updateSet,
} from "@/server/services/gallery-set.service"

export async function createSetAction(
  galleryId: string,
  formData: FormData,
): Promise<{ id: string }> {
  const session = await requireStudioAuth()
  const name = String(formData.get("name") ?? "").trim()
  if (!name) throw new Error("Nombre requerido")
  const description = String(formData.get("description") ?? "").trim() || null
  const isPrivate = formData.get("isPrivate") === "true"

  const row = await createSet(session.studioId, galleryId, {
    name,
    description,
    isPrivate,
  })
  revalidatePath(`/galleries/${galleryId}`)
  return { id: row.id }
}

export async function updateSetAction(
  setId: string,
  galleryId: string,
  formData: FormData,
): Promise<{ success: true }> {
  const session = await requireStudioAuth()
  const name = formData.get("name")
  const description = formData.get("description")
  const isPrivate = formData.get("isPrivate")
  const coverAssetId = formData.get("coverAssetId")

  await updateSet(session.studioId, setId, {
    name: typeof name === "string" ? name : undefined,
    description: typeof description === "string" ? description : undefined,
    isPrivate:
      isPrivate === "true" ? true : isPrivate === "false" ? false : undefined,
    coverAssetId:
      typeof coverAssetId === "string"
        ? coverAssetId || null
        : undefined,
  })
  revalidatePath(`/galleries/${galleryId}`)
  return { success: true }
}

export async function deleteSetAction(
  setId: string,
  galleryId: string,
  keepAssets: boolean = true,
): Promise<{ success: true }> {
  const session = await requireStudioAuth()
  await deleteSet(session.studioId, setId, { keepAssets })
  revalidatePath(`/galleries/${galleryId}`)
  return { success: true }
}

export async function moveAssetsToSetAction(input: {
  galleryId: string
  assetIds: string[]
  setId: string | null
}): Promise<{ moved: number }> {
  const session = await requireStudioAuth()
  const result = await moveAssetsToSet(
    session.studioId,
    input.galleryId,
    input.assetIds,
    input.setId,
  )
  revalidatePath(`/galleries/${input.galleryId}`)
  return result
}

export async function reorderSetsAction(input: {
  galleryId: string
  orderedIds: string[]
}): Promise<{ success: true }> {
  const session = await requireStudioAuth()
  await reorderSets(session.studioId, input.galleryId, input.orderedIds)
  revalidatePath(`/galleries/${input.galleryId}`)
  return { success: true }
}
