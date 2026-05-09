"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  consumePin,
  createPin,
  deletePin,
  revokePin,
  validatePin,
} from "@/server/services/gallery-download-pin.service"

// Schemas
const uuidSchema = z.string().uuid("ID inválido")

const createPinSchema = z.object({
  label: z.string().max(80).nullable(),
  resolution: z.enum(["original", "web"]).default("original"),
  maxDownloads: z.number().int().min(0).max(10000).default(0),
  expiresAt: z.string().datetime().nullable(),
})

const validatePinSchema = z.object({
  galleryId: uuidSchema,
  // PIN: 4-12 dígitos. Sanitizamos antes de la regex para resistir
  // espacios o copy-paste con junk.
  rawPin: z
    .string()
    .transform((s) => s.replace(/\s/g, "").trim())
    .pipe(z.string().regex(/^\d{4,12}$/, "PIN debe ser 4-12 dígitos")),
})

// ─── Admin actions ──────────────────────────────────────────────────────────

export async function createPinAction(
  galleryId: string,
  formData: FormData,
): Promise<{ id: string; rawPin: string; last4: string }> {
  const session = await requireStudioAuth()
  uuidSchema.parse(galleryId)

  const expiresRaw = String(formData.get("expiresAt") ?? "").trim()
  const data = createPinSchema.parse({
    label: String(formData.get("label") ?? "").trim() || null,
    resolution: String(formData.get("resolution") ?? "original"),
    maxDownloads: Number(formData.get("maxDownloads") ?? 0),
    expiresAt: expiresRaw ? new Date(expiresRaw).toISOString() : null,
  })

  const result = await createPin(session.studioId, galleryId, {
    ...data,
    createdBy: session.userId,
  })

  revalidatePath(`/galleries/${galleryId}`)
  return {
    id: result.pin.id,
    rawPin: result.rawPin,
    last4: result.pin.pin_last4,
  }
}

export async function revokePinAction(
  pinId: string,
  galleryId: string,
): Promise<{ success: true }> {
  const session = await requireStudioAuth()
  await revokePin(session.studioId, pinId)
  revalidatePath(`/galleries/${galleryId}`)
  return { success: true }
}

export async function deletePinAction(
  pinId: string,
  galleryId: string,
): Promise<{ success: true }> {
  const session = await requireStudioAuth()
  await deletePin(session.studioId, pinId)
  revalidatePath(`/galleries/${galleryId}`)
  return { success: true }
}

// ─── Public action: validar PIN para descarga ───────────────────────────────

export async function validatePinAndConsumeAction(input: {
  galleryId: string
  rawPin: string
}): Promise<{
  ok: true
  pinId: string
  resolution: "original" | "web"
  remaining: number | null
}> {
  // Acción pública: validación zod estricta resiste UUIDs malformados,
  // PINs no numéricos, payloads gigantes y otros vectores de abuse.
  const data = validatePinSchema.parse(input)
  const validated = await validatePin(data.galleryId, data.rawPin)
  await consumePin(validated.pinId)
  return {
    ok: true as const,
    pinId: validated.pinId,
    resolution: validated.resolution,
    remaining:
      validated.remaining === null ? null : Math.max(0, validated.remaining - 1),
  }
}
