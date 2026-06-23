"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createSet,
  deleteSet,
  moveAssetsToSet,
  reorderSets,
  updateSet,
} from "@/server/services/gallery-set.service"

// ─── Validation schemas ─────────────────────────────────────────────────────

const uuidSchema = z.string().uuid("ID inválido")

const createSetSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(120, "Nombre muy largo"),
  description: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  isPrivate: z.boolean(),
})

const updateSetSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (typeof v === "string" ? v : undefined)),
  isPrivate: z.boolean().optional(),
  coverAssetId: uuidSchema.nullable().optional(),
})

const moveAssetsToSetSchema = z.object({
  galleryId: uuidSchema,
  assetIds: z.array(uuidSchema).min(1, "Debe haber al menos un asset"),
  setId: uuidSchema.nullable(),
})

const reorderSetsSchema = z.object({
  galleryId: uuidSchema,
  orderedIds: z.array(uuidSchema).min(1, "Debe haber al menos un set"),
})

/**
 * Habilita el flujo de entrega final en una galería existente creando los 2 sets
 * estándar ("Máxima Calidad" + "Redes Sociales") si todavía no existen.
 * Idempotente: si los sets ya están (por nombre), no los duplica.
 */
export async function enableFinalDeliveryAction(
  galleryId: string,
): Promise<{ created: number }> {
  const session = await requireStudioAuth()
  const validGalleryId = uuidSchema.parse(galleryId)

  const { getSetsByGallery } = await import("@/server/services/gallery-set.service")
  const existing = await getSetsByGallery(session.studioId, validGalleryId)

  const norm = (s: string) =>
    s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim()
  const names = new Set(existing.map((s) => norm(s.name)))

  const toCreate = [
    {
      name: "Máxima Calidad",
      description: "JPG full quality — para imprimir y archivar",
      isPrivate: false,
    },
    {
      name: "Redes Sociales",
      description: "Versiones comprimidas listas para Instagram/Facebook",
      isPrivate: false,
    },
  ].filter((s) => !names.has(norm(s.name)))

  let created = 0
  for (const s of toCreate) {
    await createSet(session.studioId, validGalleryId, s)
    created++
  }

  revalidatePath(`/galleries/${validGalleryId}`)
  return { created }
}

/**
 * Habilita la entrega final DENTRO de la misma galería: crea los 2 sets
 * estándar si no existen. No crea una galería separada.
 * Alias de enableFinalDeliveryAction para mantener compatibilidad de imports.
 */
export const createDeliveryGalleryAction = enableFinalDeliveryAction

export async function createSetAction(
  galleryId: string,
  formData: FormData,
): Promise<{ id: string }> {
  const session = await requireStudioAuth()
  const validGalleryId = uuidSchema.parse(galleryId)

  const rawIsPrivate = formData.get("isPrivate")
  const data = createSetSchema.parse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    isPrivate: rawIsPrivate === "true" || rawIsPrivate === "on",
  })

  const row = await createSet(session.studioId, validGalleryId, data)
  revalidatePath(`/galleries/${validGalleryId}`)
  return { id: row.id }
}

export async function updateSetAction(
  setId: string,
  galleryId: string,
  formData: FormData,
): Promise<{ success: true }> {
  const session = await requireStudioAuth()
  const validSetId = uuidSchema.parse(setId)
  const validGalleryId = uuidSchema.parse(galleryId)

  const rawName = formData.get("name")
  const rawDescription = formData.get("description")
  const rawIsPrivate = formData.get("isPrivate")
  const rawCoverAssetId = formData.get("coverAssetId")

  const raw: {
    name?: string
    description?: string
    isPrivate?: boolean
    coverAssetId?: string | null
  } = {}

  if (typeof rawName === "string") raw.name = rawName
  if (typeof rawDescription === "string") raw.description = rawDescription
  if (rawIsPrivate === "true" || rawIsPrivate === "on") {
    raw.isPrivate = true
  } else if (rawIsPrivate === "false" || rawIsPrivate === "off") {
    raw.isPrivate = false
  }
  if (typeof rawCoverAssetId === "string") {
    raw.coverAssetId = rawCoverAssetId.length > 0 ? rawCoverAssetId : null
  }

  const data = updateSetSchema.parse(raw)

  await updateSet(session.studioId, validSetId, data)
  revalidatePath(`/galleries/${validGalleryId}`)
  return { success: true }
}

export async function deleteSetAction(
  setId: string,
  galleryId: string,
  keepAssets: boolean = true,
): Promise<{ success: true }> {
  const session = await requireStudioAuth()
  const validSetId = uuidSchema.parse(setId)
  const validGalleryId = uuidSchema.parse(galleryId)
  const validKeepAssets = z.boolean().parse(keepAssets)

  await deleteSet(session.studioId, validSetId, { keepAssets: validKeepAssets })
  revalidatePath(`/galleries/${validGalleryId}`)
  return { success: true }
}

export async function moveAssetsToSetAction(input: {
  galleryId: string
  assetIds: string[]
  setId: string | null
}): Promise<{ moved: number }> {
  const session = await requireStudioAuth()
  const data = moveAssetsToSetSchema.parse(input)

  const result = await moveAssetsToSet(
    session.studioId,
    data.galleryId,
    data.assetIds,
    data.setId,
  )
  revalidatePath(`/galleries/${data.galleryId}`)
  return result
}

export async function reorderSetsAction(input: {
  galleryId: string
  orderedIds: string[]
}): Promise<{ success: true }> {
  const session = await requireStudioAuth()
  const data = reorderSetsSchema.parse(input)

  await reorderSets(session.studioId, data.galleryId, data.orderedIds)
  revalidatePath(`/galleries/${data.galleryId}`)
  return { success: true }
}
