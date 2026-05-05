"use server"

import { revalidatePath } from "next/cache"

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

// ─── Public actions (cliente vía token) ─────────────────────────────────────
// Estas NO requieren auth de studio. Validan vía token público.

export async function createCollectionAsClientAction(input: {
  galleryId: string
  name: string
  clientEmail: string
  clientName?: string | null
}): Promise<{ id: string }> {
  if (!input.clientEmail) throw new Error("Email requerido")
  const row = await createCollectionAsClient(input.galleryId, {
    name: input.name,
    clientEmail: input.clientEmail,
    clientName: input.clientName ?? null,
  })
  return { id: row.id }
}

export async function addAssetAsClientAction(input: {
  collectionId: string
  assetId: string
}): Promise<{ added: boolean }> {
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
    .select("studio_id, is_client_editable, is_locked")
    .eq("id", input.collectionId)
    .is("deleted_at", null)
    .maybeSingle()
  const c = coll as {
    studio_id: string
    is_client_editable: boolean
    is_locked: boolean
  } | null
  if (!c) throw new Error("Colección no encontrada")
  if (!c.is_client_editable) throw new Error("Colección no editable por cliente")
  if (c.is_locked) throw new Error("Colección bloqueada")
  return svc(c.studio_id, input.collectionId, input.assetId)
}

export async function removeAssetAsClientAction(input: {
  collectionId: string
  assetId: string
}): Promise<{ success: true }> {
  const { removeAssetFromCollection: svc } = await import(
    "@/server/services/gallery-collection.service"
  )
  const { createSupabaseServiceClient } = await import(
    "@/server/supabase/service"
  )
  const supabase = createSupabaseServiceClient()
  const { data: coll } = await supabase
    .from("gallery_collections")
    .select("studio_id, is_client_editable, is_locked")
    .eq("id", input.collectionId)
    .is("deleted_at", null)
    .maybeSingle()
  const c = coll as {
    studio_id: string
    is_client_editable: boolean
    is_locked: boolean
  } | null
  if (!c) throw new Error("Colección no encontrada")
  if (!c.is_client_editable) throw new Error("Colección no editable por cliente")
  if (c.is_locked) throw new Error("Colección bloqueada")
  await svc(c.studio_id, input.collectionId, input.assetId)
  return { success: true }
}

export async function submitCollectionAsClientAction(input: {
  collectionId: string
}): Promise<{ studioId: string; galleryId: string }> {
  return submitCollection(input.collectionId)
}
