import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import {
  allowedFor,
  catLabel,
  hasPrintEntitlements,
  normalizeEntitlements,
  EMPTY_ENTITLEMENTS,
  type PrintEntitlements,
  type PrintSelectionType,
} from "@/lib/print/entitlements"

/**
 * Módulo de selección de impresiones / álbumes / marcos.
 *
 * El cliente selecciona desde su galería de entrega final:
 *  - Portada de álbum (album_cover)
 *  - Fotos para marcos (frame) — tamaños DEFINIBLES por el estudio por plan
 *  - Fotos para impresión (print) — tamaños configurables por plan
 *
 * Las cantidades permitidas vienen del plan (packages.print_entitlements).
 * El admin luego descarga un ZIP organizado por carpetas.
 */

export type { PrintEntitlements, PrintSelectionType } from "@/lib/print/entitlements"

// ---------------------------------------------------------------------------
// Estado de selección por galería
// ---------------------------------------------------------------------------

export interface PrintCategory {
  key: string // ej. "print:5x7", "frame:12x18", "album_cover"
  type: PrintSelectionType
  spec: string | null
  label: string
  allowed: number
  used: number
  assetIds: string[]
}

export interface GalleryPrintState {
  enabled: boolean
  packageId: string | null
  submitted: boolean
  submittedAt: string | null
  locked: boolean
  entitlements: PrintEntitlements
  categories: PrintCategory[]
  /** assetId → selecciones que tiene (para badges en cada foto). */
  byAsset: Record<string, Array<{ type: PrintSelectionType; spec: string | null }>>
}

interface GalleryRow {
  id: string
  studio_id: string
  project_id: string | null
  package_id: string | null
  print_selection_enabled: boolean | null
  print_submitted_at: string | null
  print_locked: boolean | null
}

async function loadGallery(galleryId: string): Promise<GalleryRow | null> {
  const sb = untypedService()
  const { data } = await sb
    .from("galleries")
    .select(
      "id, studio_id, project_id, package_id, print_selection_enabled, print_submitted_at, print_locked",
    )
    .eq("id", galleryId)
    .is("deleted_at", null)
    .maybeSingle()
  return (data as GalleryRow | null) ?? null
}

export async function resolveGalleryEntitlements(
  gallery: GalleryRow,
): Promise<PrintEntitlements> {
  if (!gallery.package_id) return EMPTY_ENTITLEMENTS
  const sb = untypedService()
  const { data } = await sb
    .from("packages")
    .select("print_entitlements")
    .eq("id", gallery.package_id)
    .maybeSingle()
  return normalizeEntitlements(
    (data as { print_entitlements?: unknown } | null)?.print_entitlements,
  )
}

export async function getGalleryPrintState(
  galleryId: string,
): Promise<GalleryPrintState | null> {
  const gallery = await loadGallery(galleryId)
  if (!gallery) return null

  const entitlements = await resolveGalleryEntitlements(gallery)

  const sb = untypedService()
  const { data: selRaw } = await sb
    .from("gallery_print_selections")
    .select("id, asset_id, selection_type, spec")
    .eq("gallery_id", galleryId)
  const selections = (selRaw ?? []) as Array<{
    id: string
    asset_id: string
    selection_type: PrintSelectionType
    spec: string | null
  }>

  const categories: PrintCategory[] = []
  if (entitlements.covers > 0) {
    categories.push({ key: "album_cover", type: "album_cover", spec: null, label: catLabel("album_cover", null), allowed: entitlements.covers, used: 0, assetIds: [] })
  }
  for (const f of entitlements.frames) {
    categories.push({ key: `frame:${f.size}`, type: "frame", spec: f.size, label: catLabel("frame", f.size), allowed: f.qty, used: 0, assetIds: [] })
  }
  for (const [size, qty] of Object.entries(entitlements.prints)) {
    if (qty > 0) categories.push({ key: `print:${size}`, type: "print", spec: size, label: catLabel("print", size), allowed: qty, used: 0, assetIds: [] })
  }

  const byKey = new Map(categories.map((c) => [c.key, c]))
  const byAsset: GalleryPrintState["byAsset"] = {}
  for (const s of selections) {
    const key = s.selection_type === "album_cover" ? "album_cover" : `${s.selection_type}:${s.spec}`
    const cat = byKey.get(key)
    if (cat) {
      cat.used += 1
      cat.assetIds.push(s.asset_id)
    }
    ;(byAsset[s.asset_id] ??= []).push({ type: s.selection_type, spec: s.spec })
  }

  return {
    enabled:
      (gallery.print_selection_enabled ?? false) &&
      entitlements.enabled &&
      hasPrintEntitlements(entitlements),
    packageId: gallery.package_id,
    submitted: !!gallery.print_submitted_at,
    submittedAt: gallery.print_submitted_at,
    locked: !!gallery.print_locked,
    entitlements,
    categories,
    byAsset,
  }
}

// ---------------------------------------------------------------------------
// Mutaciones (selección del cliente)
// ---------------------------------------------------------------------------

export class PrintSelectionError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export async function addPrintSelection(input: {
  galleryId: string
  assetId: string
  type: PrintSelectionType
  spec: string | null
  clientEmail?: string | null
  clientName?: string | null
}): Promise<{ ok: true }> {
  const gallery = await loadGallery(input.galleryId)
  if (!gallery) throw new PrintSelectionError("NOT_FOUND", "Galería no encontrada")
  if (gallery.print_locked) throw new PrintSelectionError("LOCKED", "La selección está bloqueada")

  const entitlements = await resolveGalleryEntitlements(gallery)
  const allowed = allowedFor(entitlements, input.type, input.spec)
  if (allowed <= 0) throw new PrintSelectionError("NOT_ALLOWED", "Este entregable no está incluido en tu plan")

  const sb = untypedService()
  const countQuery = sb
    .from("gallery_print_selections")
    .select("id", { count: "exact", head: true })
    .eq("gallery_id", input.galleryId)
    .eq("selection_type", input.type)
  const { count } =
    input.spec === null
      ? await countQuery.is("spec", null)
      : await countQuery.eq("spec", input.spec)
  if ((count ?? 0) >= allowed) {
    throw new PrintSelectionError("LIMIT_REACHED", "Límite alcanzado")
  }

  const { error } = await sb.from("gallery_print_selections").insert({
    studio_id: gallery.studio_id,
    gallery_id: input.galleryId,
    project_id: gallery.project_id,
    asset_id: input.assetId,
    selection_type: input.type,
    spec: input.spec,
    client_email: input.clientEmail ?? null,
    client_name: input.clientName ?? null,
  })
  if (error) {
    if ((error as { code?: string }).code === "23505") return { ok: true }
    throw new PrintSelectionError("INSERT_FAILED", error.message)
  }
  return { ok: true }
}

export async function removePrintSelection(input: {
  galleryId: string
  assetId: string
  type: PrintSelectionType
  spec: string | null
}): Promise<{ ok: true }> {
  const gallery = await loadGallery(input.galleryId)
  if (!gallery) throw new PrintSelectionError("NOT_FOUND", "Galería no encontrada")
  if (gallery.print_locked) throw new PrintSelectionError("LOCKED", "La selección está bloqueada")

  const sb = untypedService()
  const base = sb
    .from("gallery_print_selections")
    .delete()
    .eq("gallery_id", input.galleryId)
    .eq("asset_id", input.assetId)
    .eq("selection_type", input.type)
  const { error } = input.spec === null ? await base.is("spec", null) : await base.eq("spec", input.spec)
  if (error) throw new PrintSelectionError("DELETE_FAILED", error.message)
  return { ok: true }
}

/**
 * Al publicar la galería de ENTREGA FINAL: si el plan incluye impresos, habilita
 * la selección de impresión y avisa al cliente por email. Best-effort, idempotente.
 */
export async function maybeEnablePrintSelection(galleryId: string): Promise<boolean> {
  const gallery = await loadGallery(galleryId)
  if (!gallery) return false
  const e = await resolveGalleryEntitlements(gallery)
  if (!e.enabled || !hasPrintEntitlements(e)) return false

  const sb = untypedService()
  if (!gallery.print_selection_enabled) {
    await sb
      .from("galleries")
      .update({ print_selection_enabled: true, updated_at: new Date().toISOString() })
      .eq("id", galleryId)
  }
  try {
    const { onPrintSelectionEnabled } = await import("./print-email.service")
    await onPrintSelectionEnabled(galleryId)
  } catch (err) {
    console.error("[print] onPrintSelectionEnabled failed", err)
  }
  return true
}

export async function submitGalleryPrintSelection(input: {
  galleryId: string
  lock?: boolean
}): Promise<{ ok: true }> {
  const sb = untypedService()
  const { error } = await sb
    .from("galleries")
    .update({
      print_submitted_at: new Date().toISOString(),
      print_locked: input.lock ?? false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.galleryId)
  if (error) throw new PrintSelectionError("SUBMIT_FAILED", error.message)
  return { ok: true }
}
