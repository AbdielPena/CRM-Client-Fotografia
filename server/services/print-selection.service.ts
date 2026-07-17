import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import {
  allowedFor,
  catLabel,
  hasPrintEntitlements,
  isAutoPrint,
  normalizeEntitlements,
  summarizeEntitlements,
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
  gallery_type: string | null
}

async function loadGallery(galleryId: string): Promise<GalleryRow | null> {
  const sb = untypedService()
  const { data } = await sb
    .from("galleries")
    .select(
      "id, studio_id, project_id, package_id, print_selection_enabled, print_submitted_at, print_locked, gallery_type",
    )
    .eq("id", galleryId)
    .is("deleted_at", null)
    .maybeSingle()
  return (data as GalleryRow | null) ?? null
}

/**
 * ¿Esta galería de SELECCIÓN ya tiene su galería de ENTREGA aparte?
 *
 * Las impresiones se eligen SIEMPRE desde la entrega final. Una galería de
 * selección con entrega propia no debe ofrecer impresiones: su link llevaría al
 * cliente a las fotos sin editar. Pasó con Massiel — al partir las galerías
 * unificadas, las banderas `print_*` se quedaron en la de selección.
 */
async function hasSeparateDeliveryGallery(galleryId: string): Promise<boolean> {
  const sb = untypedService()
  const { data } = await sb
    .from("galleries")
    .select("id")
    .eq("source_gallery_id", galleryId)
    .eq("gallery_type", "final_delivery")
    .is("deleted_at", null)
    .limit(1)
  return ((data ?? []) as Array<{ id: string }>).length > 0
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
  const [deliveredCount, supersededBySeparateDelivery] = await Promise.all([
    countDeliveredAssets(galleryId),
    gallery.gallery_type === "final_delivery"
      ? Promise.resolve(false)
      : hasSeparateDeliveryGallery(galleryId),
  ])
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
    // Nunca en una galería de selección que ya tiene su entrega aparte: ahí se
    // elegiría sobre las fotos sin editar.
    enabled:
      entitlements.enabled &&
      hasPrintEntitlements(entitlements) &&
      !supersededBySeparateDelivery &&
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
  clientName: string | null
  clientPhone: string | null
  /** Token público activo (para el link donde el cliente elige impresiones). */
  publicToken: string | null
  state: GalleryPrintState
  /** thumbUrl de cada foto seleccionada (portada / marcos) para previsualizar. */
  thumbByAsset: Record<string, string | null>
  /** Cuándo se avisó al cliente que sus impresiones están listas (o null). */
  printReadyAt: string | null
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
    .select("name, client_id, print_ready_at")
    .eq("id", galleryId)
    .maybeSingle()
  const gallery = g as {
    name?: string
    client_id?: string | null
    print_ready_at?: string | null
  } | null

  // Cliente (nombre + teléfono para el link/WhatsApp).
  let clientName: string | null = null
  let clientPhone: string | null = null
  if (gallery?.client_id) {
    const { data: c } = await sb
      .from("clients")
      .select("name, phone")
      .eq("id", gallery.client_id)
      .maybeSingle()
    const client = c as { name?: string | null; phone?: string | null } | null
    clientName = client?.name ?? null
    clientPhone = client?.phone ?? null
  }

  // Token público activo (preferir el de galería COMPLETA, no el de solo-selección).
  const { data: tokens } = await sb
    .from("gallery_share_tokens")
    .select("token, view_mode")
    .eq("gallery_id", galleryId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(20)
  const tokenList = (tokens ?? []) as Array<{ token: string; view_mode: string | null }>
  const publicToken =
    (tokenList.find((t) => t.view_mode !== "selection") ?? tokenList[0])?.token ?? null

  return {
    galleryId,
    galleryName: gallery?.name ?? "Galería",
    clientName,
    clientPhone,
    publicToken,
    state,
    thumbByAsset,
    printReadyAt: gallery?.print_ready_at ?? null,
  }
}

// ---------------------------------------------------------------------------
// Apartado GLOBAL de impresiones — todas las galerías entregadas del estudio
// cuyo plan incluye impresos, con su estado por cliente (pendiente/seleccionado).
// ---------------------------------------------------------------------------

export type StudioPrintStatus =
  | "pending" // el cliente aún NO ha seleccionado (hay algo que elegir)
  | "in_progress" // empezó a elegir pero no envió
  | "selected" // envió / completó su selección
  | "auto" // no requiere selección (se imprime todo lo entregado)

export interface StudioPrintItem {
  galleryId: string
  galleryName: string
  projectId: string | null
  clientName: string | null
  clientPhone: string | null
  /** Token público (para el link ?impresiones=1 que se envía al cliente). */
  publicToken: string | null
  status: StudioPrintStatus
  submittedAt: string | null
  locked: boolean
  /** Fecha de entrega/sesión (YYYY-MM-DD) para ordenar y mostrar. */
  deliveredDate: string | null
  /** Resumen legible de lo incluido en el plan (portadas, marcos, impresiones). */
  summary: string
  hasManual: boolean
  /** Fotos ya seleccionadas por el cliente (categorías manuales). */
  selectedCount: number
  /** Total de fotos que el cliente debe elegir (categorías manuales). */
  manualTotal: number
}

interface PrintGalleryRow {
  id: string
  project_id: string | null
  package_id: string | null
  name: string | null
  client_id: string | null
  print_submitted_at: string | null
  print_locked: boolean | null
  delivery_ready_at: string | null
  delivery_date: string | null
  gallery_type: string | null
}

const PRINT_GALLERY_COLS =
  "id, project_id, package_id, name, client_id, print_selection_enabled, print_submitted_at, print_locked, gallery_type, delivery_ready_at, delivery_date"

/** Señales de "galería entregada" (cualquiera basta). */
const DELIVERED_OR =
  "delivery_ready_at.not.is.null,gallery_type.eq.final_delivery,print_selection_enabled.is.true,print_submitted_at.not.is.null"

/**
 * Galerías candidatas del estudio: entregadas de alguna forma. Con `clientId`
 * se limita a las de ese cliente (por galería o por su proyecto).
 */
async function loadPrintCandidateGalleries(
  studioId: string,
  clientId?: string,
): Promise<PrintGalleryRow[]> {
  const sb = untypedService()
  let projectIdsForClient: string[] = []
  if (clientId) {
    const { data } = await sb
      .from("projects")
      .select("id")
      .eq("studio_id", studioId)
      .eq("client_id", clientId)
      .is("deleted_at", null)
    projectIdsForClient = ((data ?? []) as Array<{ id: string }>).map((p) => p.id)
  }
  let query = sb
    .from("galleries")
    .select(PRINT_GALLERY_COLS)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .or(DELIVERED_OR)
  if (clientId) {
    // La galería es de este cliente si: (a) su client_id es él, O (b) NO tiene
    // client_id propio y hereda el cliente de su proyecto (que es de él). NO
    // basta con que el proyecto sea suyo si la galería tiene otro client_id
    // explícito (dato inconsistente): en ese caso resolveClient etiquetaría con
    // el otro cliente y el botón de WhatsApp marcaría al número equivocado.
    const clientOr = projectIdsForClient.length
      ? `client_id.eq.${clientId},and(client_id.is.null,project_id.in.(${projectIdsForClient.join(",")}))`
      : `client_id.eq.${clientId}`
    query = query.or(clientOr)
  }
  const { data } = await query
  return (data ?? []) as PrintGalleryRow[]
}

/**
 * Lista todas las galerías ENTREGADAS del estudio cuyo plan incluye impresos,
 * con el estado de selección de impresiones de cada una. Alimenta el apartado
 * global /impresiones: qué clientes tienen impresiones pendientes de elegir y
 * cuáles ya seleccionaron. Batch de consultas (no por-galería) para escalar.
 */
export async function listStudioPrintOverview(
  studioId: string,
): Promise<StudioPrintItem[]> {
  return buildPrintItems(await loadPrintCandidateGalleries(studioId))
}

/**
 * Igual que listStudioPrintOverview pero solo las impresiones de UN cliente
 * (para la sección "Impresiones" del perfil del cliente).
 */
export async function listClientPrintOverview(
  studioId: string,
  clientId: string,
): Promise<StudioPrintItem[]> {
  return buildPrintItems(await loadPrintCandidateGalleries(studioId, clientId))
}

/** Calcula el estado de impresión de un conjunto de galerías candidatas. */
async function buildPrintItems(
  galleries: PrintGalleryRow[],
): Promise<StudioPrintItem[]> {
  if (galleries.length === 0) return []
  const sb = untypedService()
  const galleryIds = galleries.map((g) => g.id)

  // 2. Proyectos (heredar package_id / event_date / client_id si faltan).
  const projectIds = [
    ...new Set(galleries.map((g) => g.project_id).filter((x): x is string => !!x)),
  ]
  const projectMap = new Map<
    string,
    { package_id: string | null; event_date: string | null; client_id: string | null }
  >()
  if (projectIds.length) {
    const { data } = await sb
      .from("projects")
      .select("id, package_id, event_date, client_id")
      .in("id", projectIds)
    for (const p of (data ?? []) as Array<{
      id: string
      package_id: string | null
      event_date: string | null
      client_id: string | null
    }>) {
      projectMap.set(p.id, {
        package_id: p.package_id ?? null,
        event_date: p.event_date ?? null,
        client_id: p.client_id ?? null,
      })
    }
  }

  const resolvePkg = (g: PrintGalleryRow): string | null =>
    g.package_id ?? (g.project_id ? projectMap.get(g.project_id)?.package_id ?? null : null)
  const resolveClient = (g: PrintGalleryRow): string | null =>
    g.client_id ?? (g.project_id ? projectMap.get(g.project_id)?.client_id ?? null : null)

  // 3. Entitlements por paquete.
  const pkgIds = [
    ...new Set(galleries.map(resolvePkg).filter((x): x is string => !!x)),
  ]
  const entByPkg = new Map<string, PrintEntitlements>()
  if (pkgIds.length) {
    const { data } = await sb
      .from("packages")
      .select("id, print_entitlements")
      .in("id", pkgIds)
    for (const p of (data ?? []) as Array<{ id: string; print_entitlements: unknown }>) {
      entByPkg.set(p.id, normalizeEntitlements(p.print_entitlements))
    }
  }

  // 4. Selecciones por galería.
  const selByGallery = new Map<
    string,
    Array<{ type: PrintSelectionType; spec: string | null }>
  >()
  {
    const { data } = await sb
      .from("gallery_print_selections")
      .select("gallery_id, selection_type, spec")
      .in("gallery_id", galleryIds)
    for (const s of (data ?? []) as Array<{
      gallery_id: string
      selection_type: PrintSelectionType
      spec: string | null
    }>) {
      const arr = selByGallery.get(s.gallery_id) ?? []
      arr.push({ type: s.selection_type, spec: s.spec })
      selByGallery.set(s.gallery_id, arr)
    }
  }

  // 5. Clientes.
  const clientIds = [
    ...new Set(galleries.map(resolveClient).filter((x): x is string => !!x)),
  ]
  const clientMap = new Map<string, { name: string | null; phone: string | null }>()
  if (clientIds.length) {
    const { data } = await sb
      .from("clients")
      .select("id, name, phone")
      .in("id", clientIds)
    for (const c of (data ?? []) as Array<{
      id: string
      name: string | null
      phone: string | null
    }>) {
      clientMap.set(c.id, { name: c.name ?? null, phone: c.phone ?? null })
    }
  }

  // 6. Tokens públicos (preferir el de galería completa, no el de solo-selección).
  const tokensByGallery = new Map<
    string,
    Array<{ token: string; viewMode: string | null }>
  >()
  {
    const { data } = await sb
      .from("gallery_share_tokens")
      .select("gallery_id, token, view_mode, created_at")
      .in("gallery_id", galleryIds)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
    for (const t of (data ?? []) as Array<{
      gallery_id: string
      token: string
      view_mode: string | null
    }>) {
      const arr = tokensByGallery.get(t.gallery_id) ?? []
      arr.push({ token: t.token, viewMode: t.view_mode })
      tokensByGallery.set(t.gallery_id, arr)
    }
  }

  // Galerías de SELECCIÓN que ya tienen su galería de ENTREGA aparte: las
  // impresiones se eligen SIEMPRE desde la entrega, así que la de selección no
  // debe aparecer aquí. Si no se excluyen, su link manda al cliente a las fotos
  // sin editar (le pasó a Massiel: banderas `print_*` que quedaron en la
  // selección al partir las galerías unificadas).
  const supersededByDelivery = new Set<string>()
  {
    const { data } = await sb
      .from("galleries")
      .select("source_gallery_id")
      .eq("gallery_type", "final_delivery")
      .is("deleted_at", null)
      .not("source_gallery_id", "is", null)
    for (const r of (data ?? []) as Array<{ source_gallery_id: string | null }>) {
      if (r.source_gallery_id) supersededByDelivery.add(r.source_gallery_id)
    }
  }

  const items: StudioPrintItem[] = []
  for (const g of galleries) {
    if (g.gallery_type !== "final_delivery" && supersededByDelivery.has(g.id)) continue
    const pkgId = resolvePkg(g)
    const ent = pkgId ? entByPkg.get(pkgId) : undefined
    if (!ent || !ent.enabled || !hasPrintEntitlements(ent)) continue

    // Categorías manuales (lo que el cliente elige) + permitido de cada una.
    const manualCats: Array<{ key: string; allowed: number }> = []
    if (ent.covers > 0) manualCats.push({ key: "album_cover", allowed: ent.covers })
    for (const f of ent.frames) manualCats.push({ key: `frame:${f.size}`, allowed: f.qty })
    for (const [size, qty] of Object.entries(ent.prints)) {
      if (ent.print_modes[size] === "auto") continue
      if (qty > 0) manualCats.push({ key: `print:${size}`, allowed: qty })
    }
    const hasManual = manualCats.length > 0
    const manualTotal = manualCats.reduce((s, c) => s + c.allowed, 0)

    // Usadas por categoría (para progreso + "todo completo").
    const usedByKey = new Map<string, number>()
    for (const s of selByGallery.get(g.id) ?? []) {
      const key = s.type === "album_cover" ? "album_cover" : `${s.type}:${s.spec}`
      usedByKey.set(key, (usedByKey.get(key) ?? 0) + 1)
    }
    let selectedCount = 0
    let allFull = hasManual
    for (const c of manualCats) {
      const used = Math.min(usedByKey.get(c.key) ?? 0, c.allowed)
      selectedCount += used
      if (used < c.allowed) allFull = false
    }

    const submitted = !!g.print_submitted_at
    let status: StudioPrintStatus
    if (!hasManual) status = "auto"
    else if (submitted || allFull) status = "selected"
    else if (selectedCount > 0) status = "in_progress"
    else status = "pending"

    const clientId = resolveClient(g)
    const client = clientId ? clientMap.get(clientId) : undefined
    const tokens = tokensByGallery.get(g.id) ?? []
    const publicToken =
      (tokens.find((t) => t.viewMode !== "selection") ?? tokens[0])?.token ?? null

    const proj = g.project_id ? projectMap.get(g.project_id) : undefined
    const deliveredDate =
      g.delivery_date ??
      proj?.event_date ??
      (g.delivery_ready_at ? g.delivery_ready_at.slice(0, 10) : null)

    items.push({
      galleryId: g.id,
      galleryName: g.name ?? "Galería",
      projectId: g.project_id ?? null,
      clientName: client?.name ?? null,
      clientPhone: client?.phone ?? null,
      publicToken,
      status,
      submittedAt: g.print_submitted_at ?? null,
      locked: !!g.print_locked,
      deliveredDate,
      summary: summarizeEntitlements(ent),
      hasManual,
      selectedCount,
      manualTotal,
    })
  }

  // Orden: primero lo que espera acción del cliente (pending → in_progress),
  // luego lo listo; dentro de cada grupo, entregas más recientes primero.
  const rank: Record<StudioPrintStatus, number> = {
    pending: 0,
    in_progress: 1,
    selected: 2,
    auto: 3,
  }
  items.sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status]
    return (b.deliveredDate ?? "").localeCompare(a.deliveredDate ?? "")
  })
  return items
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
    // SOLO galerías de ENTREGA FINAL: las impresiones se eligen de las fotos
    // ENTREGADAS, no de la selección. `state.enabled` ya exige entrega (fotos de
    // entrega o selección de impresión habilitada). NO mostrar en galerías de
    // selección/2da selección aunque el plan tenga una impresión "automática".
    if (v && (v.state.enabled || v.state.categories.some((c) => c.used > 0))) {
      out.push(v)
    }
  }
  return out
}
