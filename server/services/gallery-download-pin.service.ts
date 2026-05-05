// ─── Gallery download PINs ──────────────────────────────────────────────────
// PIN de descarga: el admin genera un código (ej: "ABCD1234"), lo entrega al
// cliente, el cliente lo ingresa para descargar SIN watermark. Cada PIN tiene
// max_downloads (0 = ilimitado), used_count, expires_at opcional.

import "server-only"

import { hash, compare } from "bcryptjs"

import { createSupabaseServiceClient } from "@/server/supabase/service"

const svc = createSupabaseServiceClient

export type GalleryDownloadPinRow = {
  id: string
  studio_id: string
  gallery_id: string
  label: string | null
  pin_hash: string
  pin_last4: string
  resolution: "original" | "web"
  max_downloads: number
  used_count: number
  expires_at: string | null
  revoked_at: string | null
  last_used_at: string | null
  created_at: string
  created_by: string | null
}

export type GalleryDownloadPinPublic = Omit<GalleryDownloadPinRow, "pin_hash">

function stripHash(row: GalleryDownloadPinRow): GalleryDownloadPinPublic {
  const { pin_hash: _ph, ...rest } = row
  void _ph
  return rest
}

/** Genera un PIN de 8 chars alfanuméricos uppercase. */
export function generatePin(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // sin O/0/I/1/L para evitar confusión
  let out = ""
  for (let i = 0; i < 8; i++) {
    const idx = Math.floor(Math.random() * chars.length)
    out += chars[idx]
  }
  return out
}

// ─── Admin-side ─────────────────────────────────────────────────────────────

export async function getPinsByGallery(
  studioId: string,
  galleryId: string,
): Promise<GalleryDownloadPinPublic[]> {
  const supabase = svc()
  const { data, error } = await supabase
    .from("gallery_download_pins")
    .select("*")
    .eq("studio_id", studioId)
    .eq("gallery_id", galleryId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return ((data ?? []) as GalleryDownloadPinRow[]).map(stripHash)
}

export async function createPin(
  studioId: string,
  galleryId: string,
  data: {
    label?: string | null
    resolution?: "original" | "web"
    maxDownloads?: number
    expiresAt?: string | null
    createdBy?: string | null
  },
): Promise<{ pin: GalleryDownloadPinPublic; rawPin: string }> {
  const supabase = svc()

  // Verificar gallery
  const { data: gallery } = await supabase
    .from("galleries")
    .select("id, studio_id")
    .eq("id", galleryId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!gallery) throw new Error("Galería no encontrada")

  const rawPin = generatePin()
  const pinHash = await hash(rawPin, 10)
  const last4 = rawPin.slice(-4)

  const { data: row, error } = await supabase
    .from("gallery_download_pins")
    .insert({
      studio_id: studioId,
      gallery_id: galleryId,
      label: data.label ?? null,
      pin_hash: pinHash,
      pin_last4: last4,
      resolution: data.resolution ?? "original",
      max_downloads: data.maxDownloads ?? 0,
      expires_at: data.expiresAt ?? null,
      created_by: data.createdBy ?? null,
    })
    .select("*")
    .single()
  if (error) throw error

  return { pin: stripHash(row as GalleryDownloadPinRow), rawPin }
}

export async function revokePin(
  studioId: string,
  pinId: string,
): Promise<void> {
  const supabase = svc()
  const { error } = await supabase
    .from("gallery_download_pins")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", pinId)
    .eq("studio_id", studioId)
  if (error) throw error
}

export async function deletePin(
  studioId: string,
  pinId: string,
): Promise<void> {
  const supabase = svc()
  const { error } = await supabase
    .from("gallery_download_pins")
    .delete()
    .eq("id", pinId)
    .eq("studio_id", studioId)
  if (error) throw error
}

// ─── Public-side: validación + uso ──────────────────────────────────────────

export type ValidatedPin = {
  pinId: string
  galleryId: string
  resolution: "original" | "web"
  remaining: number | null // null = ilimitado
}

/**
 * Valida un PIN ingresado por el cliente. Si OK retorna el pin record.
 * Lanza error con mensaje legible si no aplica.
 */
export async function validatePin(
  galleryId: string,
  rawPin: string,
): Promise<ValidatedPin> {
  const supabase = svc()
  const cleaned = rawPin.trim().toUpperCase()
  if (!cleaned) throw new Error("PIN vacío")

  const last4 = cleaned.slice(-4)

  // Buscar candidatos por last4 (índice barato), comparar hash en servidor
  const { data: candidates } = await supabase
    .from("gallery_download_pins")
    .select("*")
    .eq("gallery_id", galleryId)
    .eq("pin_last4", last4)
    .is("revoked_at", null)

  const list = (candidates ?? []) as GalleryDownloadPinRow[]
  for (const p of list) {
    const ok = await compare(cleaned, p.pin_hash)
    if (!ok) continue
    if (p.expires_at && new Date(p.expires_at).getTime() < Date.now()) {
      throw new Error("Este PIN ha vencido")
    }
    if (p.max_downloads > 0 && p.used_count >= p.max_downloads) {
      throw new Error("PIN sin descargas restantes")
    }
    return {
      pinId: p.id,
      galleryId: p.gallery_id,
      resolution: p.resolution,
      remaining: p.max_downloads === 0 ? null : p.max_downloads - p.used_count,
    }
  }

  throw new Error("PIN inválido")
}

/**
 * Incrementa used_count + last_used_at. Llamar después de servir la descarga.
 * Read-then-write best-effort: en alta concurrencia el límite puede excederse
 * por 1, pero es aceptable para descargas (no es financiera).
 */
export async function consumePin(pinId: string): Promise<void> {
  const supabase = svc()
  const { data } = await supabase
    .from("gallery_download_pins")
    .select("used_count")
    .eq("id", pinId)
    .maybeSingle()
  const used = (data as { used_count: number } | null)?.used_count ?? 0
  await supabase
    .from("gallery_download_pins")
    .update({
      used_count: used + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", pinId)
}
