"use server"

import { revalidatePath } from "next/cache"
import { hash } from "bcryptjs"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import {
  createGallery,
  createGalleryShareToken,
  deleteGallery,
  publishGallery,
  shareGalleryWithClient,
  updateGallery,
  type CreateGalleryInput,
  type UpdateGalleryInput,
} from "@/server/services/gallery.service"
import { onGalleryLinkedToClient } from "@/server/services/project-automation.service"

function pickString(fd: FormData, key: string): string | null {
  const v = fd.get(key)
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null
}

function pickBool(fd: FormData, key: string): boolean {
  const v = fd.get(key)
  return v === "true" || v === "on" || v === "1"
}

async function passwordHashOrNull(raw: string | null): Promise<string | null> {
  if (!raw) return null
  return hash(raw, 10)
}

export async function createGalleryAction(formData: FormData): Promise<{ id: string }> {
  const ctx = await requireStudioAuth()
  const name = pickString(formData, "name")
  if (!name) throw new Error("name requerido")

  const visibility = (pickString(formData, "visibility") ?? "private") as
    | "private"
    | "public"
    | "password"
  const passwordHash = await passwordHashOrNull(pickString(formData, "password"))

  const input: CreateGalleryInput = {
    name,
    description: pickString(formData, "description"),
    projectId: pickString(formData, "projectId"),
    clientId: pickString(formData, "clientId"),
    visibility,
    passwordHash,
    allowDownload: pickBool(formData, "allowDownload"),
    requireEmail: pickBool(formData, "requireEmail"),
    expiresAt: pickString(formData, "expiresAt"),
  }

  const row = await createGallery(ctx.studioId, ctx.userId, input)

  // Automatización: si la galería se vincula a un cliente, mover su proyecto
  // a "Esperando selección".
  if (input.clientId) {
    try {
      await onGalleryLinkedToClient(ctx.studioId, input.clientId, input.projectId ?? null)
    } catch (err) {
      console.error("[createGalleryAction] automation onGalleryLinked falló:", err)
    }
  }

  revalidatePath("/galleries")
  revalidatePath("/projects")
  return { id: row.id }
}

export async function updateGalleryAction(
  galleryId: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireStudioAuth()

  const passwordRaw = pickString(formData, "password")
  const patch: UpdateGalleryInput = {}

  const name = pickString(formData, "name")
  if (name) patch.name = name
  const description = formData.get("description")
  if (typeof description === "string") patch.description = description
  const visibility = pickString(formData, "visibility")
  if (visibility) patch.visibility = visibility as "private" | "public" | "password"
  if (passwordRaw !== null) patch.passwordHash = await passwordHashOrNull(passwordRaw)
  if (formData.has("allowDownload")) patch.allowDownload = pickBool(formData, "allowDownload")
  if (formData.has("requireEmail")) patch.requireEmail = pickBool(formData, "requireEmail")
  const expiresAt = formData.get("expiresAt")
  if (typeof expiresAt === "string") patch.expiresAt = expiresAt || null
  const status = pickString(formData, "status")
  if (status) patch.status = status as "draft" | "published" | "archived" | "expired"
  const coverAssetId = formData.get("coverAssetId")
  if (typeof coverAssetId === "string") patch.coverAssetId = coverAssetId || null

  // Marca de agua
  if (formData.has("watermark_enabled"))
    patch.watermarkEnabled = pickBool(formData, "watermark_enabled")
  const watermarkText = formData.get("watermark_text")
  if (typeof watermarkText === "string") patch.watermarkText = watermarkText || null
  const watermarkPosition = pickString(formData, "watermark_position")
  if (watermarkPosition) patch.watermarkPosition = watermarkPosition
  const watermarkOpacity = formData.get("watermark_opacity")
  if (typeof watermarkOpacity === "string" && watermarkOpacity.trim()) {
    const n = Number(watermarkOpacity)
    if (!Number.isNaN(n)) patch.watermarkOpacity = Math.min(1, Math.max(0, n))
  }

  // Selección + PIN required + extras de info
  if (formData.has("selection_enabled"))
    patch.selectionEnabled = pickBool(formData, "selection_enabled")
  if (formData.has("selection_locked"))
    patch.selectionLocked = pickBool(formData, "selection_locked")
  if (formData.has("download_pin_required"))
    patch.downloadPinRequired = pickBool(formData, "download_pin_required")
  const eventDate = formData.get("event_date")
  if (typeof eventDate === "string") patch.eventDate = eventDate || null
  const accentColor = pickString(formData, "accent_color")
  if (accentColor) patch.accentColor = accentColor
  const layoutGrid = pickString(formData, "layout_grid")
  if (layoutGrid) patch.layoutGrid = layoutGrid
  const coverDesign = pickString(formData, "cover_design")
  if (coverDesign) patch.coverDesign = coverDesign

  await updateGallery(ctx.studioId, ctx.userId, galleryId, patch)
  revalidatePath(`/galleries/${galleryId}`)
  revalidatePath("/galleries")
}

export async function publishGalleryAction(galleryId: string): Promise<void> {
  const ctx = await requireStudioAuth()
  await publishGallery(ctx.studioId, ctx.userId, galleryId)
  revalidatePath(`/galleries/${galleryId}`)
  revalidatePath("/galleries")
}

export async function deleteGalleryAction(galleryId: string): Promise<void> {
  const ctx = await requireStudioAuth()
  await deleteGallery(ctx.studioId, ctx.userId, galleryId)
  revalidatePath("/galleries")
}

export async function shareGalleryAction(
  galleryId: string,
  formData: FormData,
): Promise<{ token: string; url: string }> {
  const ctx = await requireStudioAuth()
  const expiresAt = pickString(formData, "expiresAt")
  const clientEmail = pickString(formData, "clientEmail")

  const result = clientEmail
    ? await shareGalleryWithClient(ctx.studioId, galleryId, {
        clientEmail,
        expiresAt,
      })
    : await createGalleryShareToken(ctx.studioId, galleryId, { expiresAt })

  revalidatePath(`/galleries/${galleryId}`)
  return result
}
