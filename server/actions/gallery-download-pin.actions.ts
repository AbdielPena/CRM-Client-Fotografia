"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  consumePin,
  createPin,
  deletePin,
  revokePin,
  validatePin,
} from "@/server/services/gallery-download-pin.service"

// ─── Admin actions ──────────────────────────────────────────────────────────

export async function createPinAction(
  galleryId: string,
  formData: FormData,
): Promise<{ id: string; rawPin: string; last4: string }> {
  const session = await requireStudioAuth()
  const label = String(formData.get("label") ?? "").trim() || null
  const resolution =
    String(formData.get("resolution") ?? "original") === "web" ? "web" : "original"
  const maxDownloads = Math.max(0, Number(formData.get("maxDownloads") ?? 0))
  const expiresRaw = String(formData.get("expiresAt") ?? "").trim()
  const expiresAt = expiresRaw ? new Date(expiresRaw).toISOString() : null

  const result = await createPin(session.studioId, galleryId, {
    label,
    resolution,
    maxDownloads,
    expiresAt,
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
  const validated = await validatePin(input.galleryId, input.rawPin)
  // Consumimos al validar (cada validación cuenta como un uso). Para que solo
  // cuente cuando efectivamente descarga, llamar consumePin desde el endpoint
  // de descarga después de servir el archivo.
  await consumePin(validated.pinId)
  return {
    ok: true as const,
    pinId: validated.pinId,
    resolution: validated.resolution,
    remaining:
      validated.remaining === null ? null : Math.max(0, validated.remaining - 1),
  }
}
