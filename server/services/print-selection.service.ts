import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import {
  allowedFor,
  catLabel,
  hasPrintEntitlements,
  isAutoPrint,
  normalizeEntitlements,
  EMPTY_ENTITLEMENTS,
  type PrintEntitlements,
  type PrintMode,
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
  /**
   * "auto" solo aplica a impresiones: se imprimen TODAS las entregadas y el
   * cliente NO selecciona (allowed/used = nº de fotos entregadas). El resto
   * de categorías es "manual".
   */
  mode: PrintMode
}

export interface GalleryPrintState {
  enabled: boolean
  packageId: string | null
  submitted: boolean
  submittedAt: string | null
  locked: boolean
  entitlements: PrintEntitlements
  categories: PrintCategory[]
  /** Nº de fotos de ENTREGA FINAL (para modo automático + carpeta digitales). */
  deliveredCount: number
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
  const sb = untypedService()
  // El plan puede estar en la galería o (si no lo heredó) en el proyecto.
  let packageId = gallery.package_id
  if (!packageId && gallery.project_id) {
    const { data: proj } = await sb
      .from("projects")
      .select("package_id")
      .eq("id", gallery.project_id)
      .maybeSingle()
    packageId = (proj as { package_id?: string | null } | null)?.package_id ?? null
  }
  if (!packageId) return EMPTY_ENTITLEMENTS
  const { data } = await sb
    .from("packages")
    .select("print_entitlements")
    .eq("id", packageId)
    .maybeSingle()
  return normalizeEntitlements(
    (data as { print_entitlements?: unknown } | null)?.print_entitlements,
  )
}

/**
 * ¿La galería es de ENTREGA aunque sus fotos no tengan track social/high_quality?
 * (galerías donde toda la galería es la entrega, sin distinción de tracks).
 */
async function isDeliveredGallery(galleryId: string): Promise<boolean> {
  const sb = untypedService()
  const { data } = await sb
    .from("galleries")
    .select("gallery_type, delivery_ready_at")
    .eq("id", galleryId)
    .maybeSingle()
  const g = data as { gallery_type?: string | null; delivery_ready_at?: string | null } | null
  return g?.gallery_type === "final_delivery" || !!g?.delivery_ready_at
}

/**
 * Nº de fotos de ENTREGA FINAL. Prefiere máxima calidad (high_quality), luego
 * sociales. Si la galería no usa tracks pero ES de entrega, todas sus fotos
 * completadas son la entrega (nunca la selección: eso solo aplica cuando NO hay
 * fotos con track).
 */
async function countDeliveredAssets(galleryId: string): Promise<number> {
  const sb = untypedService()
  const base = () =>
    sb
      .from("gallery_assets")
      .select("id", { count: "exact", head: true })
      .eq("gallery_id", galleryId)
      .eq("status", "completed")
  const { count: hq } = await base().eq("delivery_track", "high_quality")
  if ((hq ?? 0) > 0) return hq ?? 0
  const { count: soc } = await base().eq("delivery_track", "social")
  if ((soc ?? 0) > 0) return soc ?? 0
  if (await isDeliveredGallery(galleryId)) {
    const { count: all } = await base()
    return all ?? 0
  }
  return 0
}

export async function getGalleryPrintState(
  galleryId: string,
): Promise<GalleryPrintState | null> {
  const gallery = await loadGallery(galleryId)
  if (!gallery) return null

  const entitlements = await resolveGalleryEntitlements(gallery)

  const sb = untypedService()
  const deliveredCount = await countDeliveredAssets(galleryId)
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
    categories.push({ key: "album_cover", type: "album_cover", spec: null, label: catLabel("album_cover", null), allowed: entitlements.covers, used: 0, assetIds: [], mode: "manual" })
  }
  for (const f of entitlements.frames) {
    categories.push({ key: `frame:${f.size}`, type: "frame", spec: f.size, label: catLabel("frame", f.size), allowed: f.qty, used: 0, assetIds: [], mode: "manual" })
  }
  for (const [size, qty] of Object.entries(entitlements.prints)) {
    if (isAutoPrint(entitlements, size)) {
      // Automático: se imprimen todas las entregadas, sin selección del cliente.
      categories.push({ key: `print:${size}`, type: "print", spec: size, label: catLabel("print", size), allowed: deliveredCount, used: deliveredCount, assetIds: [], mode: "auto" })
    } else if (qty > 0) {
      categories.push({ key: `print:${size}`, type: "print", spec: size, label: catLabel("print", size), allowed: qty, used: 0, assetIds: [], mode: "manual" })
    }
  }

  const byKey = new Map(categories.map((c) => [c.key, c]))
  const byAsset: GalleryPrintState["byAsset"] = {}
  for (const s of selections) {
    const key = s.selection_type === "album_cover" ? "album_cover" : `${s.selection_type}:${s.spec}`
    const cat = byKey.get(key)
    if (cat && cat.mode !== "auto") {
      cat.used += 1
      cat.assetIds.push(s.asset_id)
    }
    ;(byAsset[s.asset_id] ??= []).push({ type: s.selection_type, spec: s.spec })
  }

  return {
    // Disponible si el plan incluye impresos Y (ya se habilitó explícitamente al
    // publicar la entrega O ya hay fotos de entrega). Así aparece en toda galería
    // entregada de un plan con impresos, sin depender del flag de publicación.
    enabled:
      entitlements.enabled &&
      hasPrintEntitlements(entitlements) &&
      ((gallery.print_selection_enabled ?? false) || deliveredCount > 0),
    packageId: gallery.package_id,
    submitted: !!gallery.print_submitted_at,
    submittedAt: gallery.print_submitted_at,
    locked: !!gallery.print_locked,
    entitlements,
    categories,
    deliveredCount,
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
  // Nunca mezclar comportamientos: en un tamaño automático NO se selecciona a mano.
  if (input.type === "print" && isAutoPrint(entitlements, input.spec)) {
    throw new PrintSelectionError(
      "AUTO_MODE",
      "Este tamaño se imprime automáticamente: incluye todas tus fotos entregadas.",
    )
  }
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

  // Solo enviar el email la PRIMERA vez que se habilita (evita duplicados al
  // re-publicar una galería de entrega final ya habilitada).
  const wasEnabled = !!gallery.print_selection_enabled
  const sb = untypedService()
  if (!wasEnabled) {
    await sb
      .from("galleries")
      .update({ print_selection_enabled: true, updated_at: new Date().toISOString() })
      .eq("id", galleryId)
    try {
      const { onPrintSelectionEnabled } = await import("./print-email.service")
      await onPrintSelectionEnabled(galleryId)
    } catch (err) {
      console.error("[print] onPrintSelectionEnabled failed", err)
    }
  }
  return true
}

/** Admin: cierra (bloquea) o reabre la selección de impresión de una galería. */
export async function setGalleryPrintLock(
  studioId: string,
  galleryId: string,
  locked: boolean,
): Promise<{ ok: true }> {
  const sb = untypedService()
  const { error } = await sb
    .from("galleries")
    .update({ print_locked: locked, updated_at: new Date().toISOString() })
    .eq("id", galleryId)
    .eq("studio_id", studioId)
  if (error) throw new PrintSelectionError("LOCK_FAILED", error.message)
  return { ok: true }
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

// ---------------------------------------------------------------------------
// Fotos de ENTREGA FINAL (para el ZIP: carpeta digitales + tamaños automáticos)
// ---------------------------------------------------------------------------

export interface DeliveredAsset {
  id: string
  originalKey: string | null
  originalName: string | null
  thumbKey: string | null
}

/**
 * Todas las fotos de ENTREGA FINAL de la galería (nunca las de selección).
 * Prefiere la máxima calidad: si hay track high_quality usa solo esas; si no,
 * las sociales. Paginado para no toparse con el tope de 1000 filas.
 */
export async function listDeliveredAssets(galleryId: string): Promise<DeliveredAsset[]> {
  const sb = untypedService()
  const pull = async (
    track: "high_quality" | "social" | null,
  ): Promise<DeliveredAsset[]> => {
    const out: DeliveredAsset[] = []
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      let query = sb
        .from("gallery_assets")
        .select("id, original_key, original_name, thumb_key, sort_order")
        .eq("gallery_id", galleryId)
        .eq("status", "completed")
      if (track) query = query.eq("delivery_track", track)
      const { data } = await query
        .order("sort_order", { ascending: true })
        .order("original_name", { ascending: true })
        .range(from, from + PAGE - 1)
      const rows = (data ?? []) as Array<{
        id: string
        original_key: string | null
        original_name: string | null
        thumb_key: string | null
      }>
      out.push(
        ...rows.map((r) => ({
          id: r.id,
          originalKey: r.original_key,
          originalName: r.original_name,
          thumbKey: r.thumb_key,
        })),
      )
      if (rows.length < PAGE) break
    }
    return out
  }
  const hq = await pull("high_quality")
  if (hq.length) return hq
  const social = await pull("social")
  if (social.length) return social
  // Sin tracks: si la galería es de entrega, todas sus fotos son la entrega.
  if (await isDeliveredGallery(galleryId)) return pull(null)
  return []
}

// ---------------------------------------------------------------------------
// Vista administrativa (apartado IMPRESIONES en galería y en la sesión)
// ---------------------------------------------------------------------------

export interface PrintAdminView {
  galleryId: string
  galleryName: string
  state: GalleryPrintState
  /** thumbUrl de cada foto seleccionada (portada / marcos) para previsualizar. */
  thumbByAsset: Record<string, string | null>
}

/** Estado de impresión + miniaturas de lo elegido, para el panel del estudio. */
export async function getGalleryPrintAdminView(
  galleryId: string,
): Promise<PrintAdminView | null> {
  const state = await getGalleryPrintState(galleryId)
  if (!state) return null

  const sb = untypedService()
  const ids = [...new Set(state.categories.flatMap((c) => c.assetIds))]
  const thumbByAsset: Record<string, string | null> = {}
  if (ids.length) {
    const { data } = await sb
      .from("gallery_assets")
      .select("id, thumb_key")
      .in("id", ids)
    const { getAssetThumbUrl } = await import("./gallery.service")
    for (const r of (data ?? []) as Array<{ id: string; thumb_key: string | null }>) {
      thumbByAsset[r.id] = getAssetThumbUrl(r.thumb_key)
    }
  }

  const { data: g } = await sb
    .from("galleries")
    .select("name")
    .eq("id", galleryId)
    .maybeSingle()
  return {
    galleryId,
    galleryName: (g as { name?: string } | null)?.name ?? "Galería",
    state,
    thumbByAsset,
  }
}

/** Vistas de impresión de todas las galerías de una sesión con impresos activos. */
export async function getProjectPrintViews(
  studioId: string,
  projectId: string,
): Promise<PrintAdminView[]> {
  const sb = untypedService()
  const { data: gals } = await sb
    .from("galleries")
    .select("id")
    .eq("project_id", projectId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
  const out: PrintAdminView[] = []
  for (const row of (gals ?? []) as Array<{ id: string }>) {
    const v = await getGalleryPrintAdminView(row.id)
    if (
      v &&
      (v.state.enabled ||
        v.state.categories.some((c) => c.used > 0 || c.mode === "auto"))
    ) {
      out.push(v)
    }
  }
  return out
}
