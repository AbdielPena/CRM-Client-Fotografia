"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  addAssetToCollection,
  createCollection,
  createCollectionAsClient,
  deleteCollection,
  removeAssetFromCollection,
  renameCollection,
  submitCollection,
} from "@/server/services/gallery-collection.service"

// ─── Validation schemas (input público requiere validación estricta) ────────

const uuidSchema = z.string().uuid("ID inválido")

const createCollectionAsClientSchema = z.object({
  galleryId: uuidSchema,
  name: z.string().min(1, "Nombre requerido").max(120, "Nombre muy largo"),
  clientEmail: z.string().email("Email inválido").max(254),
  clientName: z.string().max(120).nullable().optional(),
})

const collectionAssetSchema = z.object({
  collectionId: uuidSchema,
  assetId: uuidSchema,
})

const submitCollectionSchema = z.object({
  collectionId: uuidSchema,
})

// ─── Admin actions ──────────────────────────────────────────────────────────

export async function createCollectionAction(
  galleryId: string,
  formData: FormData,
): Promise<{ id: string }> {
  const session = await requireStudioAuth()
  const name = String(formData.get("name") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim() || null
  const isClientEditable = formData.get("isClientEditable") === "true"
  const clientEmail = String(formData.get("clientEmail") ?? "").trim() || null
  const clientName = String(formData.get("clientName") ?? "").trim() || null

  if (!name) throw new Error("Nombre requerido")

  const row = await createCollection(session.studioId, galleryId, {
    name,
    description,
    isClientEditable,
    clientEmail,
    clientName,
    createdBy: session.userId,
  })

  revalidatePath(`/galleries/${galleryId}`)
  return { id: row.id }
}

export async function renameCollectionAction(
  collectionId: string,
  name: string,
  galleryId: string,
): Promise<{ success: true }> {
  const session = await requireStudioAuth()
  if (!name.trim()) throw new Error("Nombre requerido")
  await renameCollection(session.studioId, collectionId, name)
  revalidatePath(`/galleries/${galleryId}`)
  return { success: true }
}

export async function deleteCollectionAction(
  collectionId: string,
  galleryId: string,
): Promise<{ success: true }> {
  const session = await requireStudioAuth()
  await deleteCollection(session.studioId, collectionId)
  revalidatePath(`/galleries/${galleryId}`)
  return { success: true }
}

export async function addAssetToCollectionAction(
  collectionId: string,
  assetId: string,
  galleryId: string,
): Promise<{ added: boolean }> {
  const session = await requireStudioAuth()
  const result = await addAssetToCollection(
    session.studioId,
    collectionId,
    assetId,
  )
  revalidatePath(`/galleries/${galleryId}`)
  return result
}

export async function removeAssetFromCollectionAction(
  collectionId: string,
  assetId: string,
  galleryId: string,
): Promise<{ success: true }> {
  const session = await requireStudioAuth()
  await removeAssetFromCollection(session.studioId, collectionId, assetId)
  revalidatePath(`/galleries/${galleryId}`)
  return { success: true }
}

/**
 * Admin: quita UN favorito ❤️ (una foto) de la selección de un cliente.
 * Solo borra la marca; la foto no se toca.
 */
export async function removeFavoriteAction(
  galleryId: string,
  clientEmail: string,
  assetId: string,
): Promise<{ success: true }> {
  const session = await requireStudioAuth()
  const gid = uuidSchema.parse(galleryId)
  const aid = uuidSchema.parse(assetId)
  const { removeFavorite } = await import("@/server/services/gallery.service")
  await removeFavorite(session.studioId, gid, clientEmail, aid)
  revalidatePath(`/galleries/${gid}`)
  return { success: true }
}

/**
 * Admin: vacía TODAS las favoritas ❤️ de un cliente en una galería.
 * Solo borra marcas; las fotos permanecen.
 */
export async function clearFavoritesAction(
  galleryId: string,
  clientEmail: string,
): Promise<{ removed: number }> {
  const session = await requireStudioAuth()
  const gid = uuidSchema.parse(galleryId)
  const { clearFavorites } = await import("@/server/services/gallery.service")
  const removed = await clearFavorites(session.studioId, gid, clientEmail)
  revalidatePath(`/galleries/${gid}`)
  return { removed }
}

/**
 * El CLIENTE borra una lista de selección que él creó (soft-delete). No requiere
 * auth de studio; valida propiedad por correo dentro del servicio.
 */
export async function deleteCollectionAsClientAction(input: {
  collectionId: string
  clientEmail: string
}): Promise<{ success: true }> {
  const collectionId = uuidSchema.parse(input.collectionId)
  const clientEmail = z.string().email().max(254).parse(input.clientEmail)
  const { deleteCollectionAsClient } = await import(
    "@/server/services/gallery-collection.service"
  )
  const { galleryId } = await deleteCollectionAsClient(collectionId, clientEmail)
  revalidatePath(`/g/${galleryId}`)
  return { success: true }
}

// ─── Public actions (cliente vía token) ─────────────────────────────────────
// Estas NO requieren auth de studio. Validan vía token público.

export async function createCollectionAsClientAction(input: {
  galleryId: string
  name: string
  clientEmail: string
  clientName?: string | null
}): Promise<{ id: string }> {
  const data = createCollectionAsClientSchema.parse(input)
  const row = await createCollectionAsClient(data.galleryId, {
    name: data.name,
    clientEmail: data.clientEmail,
    clientName: data.clientName ?? null,
  })
  revalidatePath(`/g/${data.galleryId}`)
  return { id: row.id }
}

export async function addAssetAsClientAction(input: {
  collectionId: string
  assetId: string
}): Promise<{ added: boolean }> {
  const data = collectionAssetSchema.parse(input)
  // Importamos service directamente — no validamos studio (es público).
  const { addAssetToCollection: svc } = await import(
    "@/server/services/gallery-collection.service"
  )
  const { createSupabaseServiceClient } = await import(
    "@/server/supabase/service"
  )
  const supabase = createSupabaseServiceClient()
  const { data: coll } = await supabase
    .from("gallery_collections")
    .select("studio_id, gallery_id, is_client_editable, is_locked")
    .eq("id", data.collectionId)
    .is("deleted_at", null)
    .maybeSingle()
  const c = coll as {
    studio_id: string
    gallery_id: string
    is_client_editable: boolean
    is_locked: boolean
  } | null
  if (!c) throw new Error("Colección no encontrada")
  if (!c.is_client_editable) throw new Error("Colección no editable por cliente")
  if (c.is_locked) throw new Error("Colección bloqueada")
  const result = await svc(c.studio_id, data.collectionId, data.assetId)
  revalidatePath(`/g/${c.gallery_id}`)
  return result
}

export async function removeAssetAsClientAction(input: {
  collectionId: string
  assetId: string
}): Promise<{ success: true }> {
  const data = collectionAssetSchema.parse(input)
  const { removeAssetFromCollection: svc } = await import(
    "@/server/services/gallery-collection.service"
  )
  const { createSupabaseServiceClient } = await import(
    "@/server/supabase/service"
  )
  const supabase = createSupabaseServiceClient()
  const { data: coll } = await supabase
    .from("gallery_collections")
    .select("studio_id, gallery_id, is_client_editable, is_locked")
    .eq("id", data.collectionId)
    .is("deleted_at", null)
    .maybeSingle()
  const c = coll as {
    studio_id: string
    gallery_id: string
    is_client_editable: boolean
    is_locked: boolean
  } | null
  if (!c) throw new Error("Colección no encontrada")
  if (!c.is_client_editable) throw new Error("Colección no editable por cliente")
  if (c.is_locked) throw new Error("Colección bloqueada")
  await svc(c.studio_id, data.collectionId, data.assetId)
  revalidatePath(`/g/${c.gallery_id}`)
  return { success: true }
}

export async function submitCollectionAsClientAction(input: {
  collectionId: string
}): Promise<{ studioId: string; galleryId: string }> {
  const data = submitCollectionSchema.parse(input)
  const result = await submitCollection(data.collectionId)
  // Revalidar la galería pública + admin para que ambos vean el submit
  revalidatePath(`/g/${result.galleryId}`)
  revalidatePath(`/galleries/${result.galleryId}`)
  return result
}
