"use server"

import { revalidatePath } from "next/cache"
import { hash } from "bcryptjs"
import { z } from "zod"

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

// ─── Schemas zod ───────────────────────────────────────────────────────────
const uuidSchema = z.string().uuid("ID inválido")
const uuidOrNull = uuidSchema.nullable()
const visibilityEnum = z.enum(["private", "public", "password"])
const galleryStatusEnum = z.enum(["draft", "published", "archived", "expired"])

const createGallerySchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(120),
  description: z.string().max(2000).nullable(),
  projectId: uuidOrNull,
  clientId: uuidOrNull,
  visibility: visibilityEnum,
  password: z.string().min(4).max(120).nullable(),
  allowDownload: z.boolean(),
  requireEmail: z.boolean(),
  expiresAt: z.string().nullable(),
})

const updateGallerySchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(2000).nullable(),
    visibility: visibilityEnum,
    password: z.string().min(4).max(120).nullable(),
    allowDownload: z.boolean(),
    requireEmail: z.boolean(),
    expiresAt: z.string().nullable(),
    status: galleryStatusEnum,
    coverAssetId: uuidOrNull,
    watermarkEnabled: z.boolean(),
    watermarkText: z.string().max(120).nullable(),
    watermarkPosition: z.string().max(40),
    watermarkOpacity: z.number().min(0).max(1),
    selectionEnabled: z.boolean(),
    selectionLocked: z.boolean(),
    downloadPinRequired: z.boolean(),
    eventDate: z.string().nullable(),
    accentColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, "Color hex inválido"),
    layoutGrid: z.string().max(40),
    coverDesign: z.string().max(40),
  })
  .partial()

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

  const data = createGallerySchema.parse({
    name: pickString(formData, "name") ?? "",
    description: pickString(formData, "description"),
    projectId: pickString(formData, "projectId"),
    clientId: pickString(formData, "clientId"),
    visibility: pickString(formData, "visibility") ?? "private",
    password: pickString(formData, "password"),
    allowDownload: pickBool(formData, "allowDownload"),
    requireEmail: pickBool(formData, "requireEmail"),
    expiresAt: pickString(formData, "expiresAt"),
  })

  const passwordHash = await passwordHashOrNull(data.password)
  const input: CreateGalleryInput = {
    name: data.name,
    description: data.description,
    projectId: data.projectId,
    clientId: data.clientId,
    visibility: data.visibility,
    passwordHash,
    allowDownload: data.allowDownload,
    requireEmail: data.requireEmail,
    expiresAt: data.expiresAt,
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
  uuidSchema.parse(galleryId)

  // Construir el raw patch — solo campos presentes
  const raw: Record<string, unknown> = {}
  const name = pickString(formData, "name")
  if (name) raw.name = name
  const description = formData.get("description")
  if (typeof description === "string") raw.description = description || null
  const visibility = pickString(formData, "visibility")
  if (visibility) raw.visibility = visibility
  if (formData.has("allowDownload")) raw.allowDownload = pickBool(formData, "allowDownload")
  if (formData.has("requireEmail")) raw.requireEmail = pickBool(formData, "requireEmail")
  const expiresAt = formData.get("expiresAt")
  if (typeof expiresAt === "string") raw.expiresAt = expiresAt || null
  const status = pickString(formData, "status")
  if (status) raw.status = status
  const coverAssetId = formData.get("coverAssetId")
  if (typeof coverAssetId === "string") raw.coverAssetId = coverAssetId || null

  // Marca de agua
  if (formData.has("watermark_enabled"))
    raw.watermarkEnabled = pickBool(formData, "watermark_enabled")
  const watermarkText = formData.get("watermark_text")
  if (typeof watermarkText === "string") raw.watermarkText = watermarkText || null
  const watermarkPosition = pickString(formData, "watermark_position")
  if (watermarkPosition) raw.watermarkPosition = watermarkPosition
  const watermarkOpacity = formData.get("watermark_opacity")
  if (typeof watermarkOpacity === "string" && watermarkOpacity.trim()) {
    const n = Number(watermarkOpacity)
    if (!Number.isNaN(n)) raw.watermarkOpacity = Math.min(1, Math.max(0, n))
  }

  // Selección + PIN required + extras de info
  if (formData.has("selection_enabled"))
    raw.selectionEnabled = pickBool(formData, "selection_enabled")
  if (formData.has("selection_locked"))
    raw.selectionLocked = pickBool(formData, "selection_locked")
  if (formData.has("download_pin_required"))
    raw.downloadPinRequired = pickBool(formData, "download_pin_required")
  const eventDate = formData.get("event_date")
  if (typeof eventDate === "string") raw.eventDate = eventDate || null
  const accentColor = pickString(formData, "accent_color")
  if (accentColor) raw.accentColor = accentColor
  const layoutGrid = pickString(formData, "layout_grid")
  if (layoutGrid) raw.layoutGrid = layoutGrid
  const coverDesign = pickString(formData, "cover_design")
  if (coverDesign) raw.coverDesign = coverDesign

  // Validar todo el patch en una sola pasada
  const parsed = updateGallerySchema.parse(raw)

  // Construir UpdateGalleryInput final con password ya hasheado
  const patch: UpdateGalleryInput = { ...parsed }
  const passwordRaw = pickString(formData, "password")
  if (passwordRaw !== null) patch.passwordHash = await passwordHashOrNull(passwordRaw)

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
