import "server-only"

import { randomUUID } from "node:crypto"

import { createId } from "@paralleldrive/cuid2"
import { untypedService } from "@/server/supabase/untyped"

/**
 * "Segunda selección" (re-selección): cuando el cliente elige más fotos de las
 * que incluye su plan, se crea una galería HIJA con SOLO esas fotos elegidas
 * (filas nuevas que apuntan a los MISMOS archivos en storage — no se duplica
 * nada en disco). El cliente entra y vuelve a marcar con ♥ para bajar al número
 * del plan (los extras se cuentan igual que en la 1ra ronda, vía la cuota del
 * paquete). La hija se oculta de la lista (`parent_gallery_id`) y se gestiona
 * desde la galería padre.
 */

export type ReselectionInfo = {
  childId: string
  token: string | null
  url: string | null
  assetCount: number
  /** Favoritos marcados en la 2da ronda (lo que ya re-eligió). */
  selectedCount: number
  status: string
}

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://my.abbypixel.com"
  )
}

type Sb = ReturnType<typeof untypedService>

/**
 * Asset IDs que el cliente eligió en una galería. Cubre las DOS formas de
 * seleccionar: ♥ generales (`gallery_favorites`) y los ítems de sus listas
 * (`gallery_collection_items`). Unión sin duplicar — algunos clientes usan el
 * corazón y otros arman una lista; antes la 2da selección solo miraba ♥ y
 * fallaba ("el cliente aún no ha marcado fotos") cuando la selección era una lista.
 */
/**
 * Filtro opcional para elegir DE QUÉ selecciones se arma la 2da galería. Sin
 * filtro (undefined) = todo (♥ generales + todas las listas), como siempre. Con
 * filtro, el fotógrafo elige: incluir o no los ♥ y qué listas (`collectionIds`).
 */
export type SelectionFilter = {
  /** IDs de listas (`gallery_collections`) a incluir. `undefined` = todas. */
  collectionIds?: string[]
  /** Incluir los ♥ generales (`gallery_favorites`). `undefined` = sí. */
  includeFavorites?: boolean
}

async function getSelectedAssetIds(
  sb: Sb,
  galleryId: string,
  filter?: SelectionFilter,
): Promise<string[]> {
  const ids = new Set<string>()

  // ♥ generales: incluir siempre salvo que el filtro los excluya explícitamente.
  const wantFavorites = filter ? filter.includeFavorites === true : true
  if (wantFavorites) {
    const { data: favs } = await sb
      .from("gallery_favorites")
      .select("asset_id")
      .eq("gallery_id", galleryId)
    for (const f of (favs ?? []) as Array<{ asset_id: string | null }>) {
      if (f.asset_id) ids.add(f.asset_id)
    }
  }

  // Listas: sin filtro = todas; con filtro = solo las pedidas (validando que
  // pertenezcan a ESTA galería, para no colar IDs de otra).
  let collIds: string[]
  if (filter && filter.collectionIds) {
    if (filter.collectionIds.length > 0) {
      const { data: colls } = await sb
        .from("gallery_collections")
        .select("id")
        .eq("gallery_id", galleryId)
        .is("deleted_at", null)
        .in("id", filter.collectionIds)
      collIds = ((colls ?? []) as Array<{ id: string }>).map((c) => c.id)
    } else {
      collIds = []
    }
  } else if (filter) {
    // Filtro dado sin `collectionIds` → no incluir listas (solo lo que pida ♥).
    collIds = []
  } else {
    const { data: colls } = await sb
      .from("gallery_collections")
      .select("id")
      .eq("gallery_id", galleryId)
      .is("deleted_at", null)
    collIds = ((colls ?? []) as Array<{ id: string }>).map((c) => c.id)
  }

  if (collIds.length > 0) {
    const { data: items } = await sb
      .from("gallery_collection_items")
      .select("asset_id")
      .in("collection_id", collIds)
    for (const it of (items ?? []) as Array<{ asset_id: string | null }>) {
      if (it.asset_id) ids.add(it.asset_id)
    }
  }

  return [...ids]
}

/**
 * Cuántas fotos eligió el cliente en una galería (♥ generales + ítems de sus
 * listas). MISMA fuente que usa `createReselectionGallery`, para que el
 * contador del botón "Crear 2da selección" y la creación NUNCA se contradigan
 * (antes la página contaba solo ♥ → 0 cuando el cliente usó una lista, y el
 * botón quedaba deshabilitado aunque sí había selección).
 */
export async function countSelectedAssets(galleryId: string): Promise<number> {
  const sb = untypedService()
  return (await getSelectedAssetIds(sb, galleryId)).length
}

export async function getReselectionForGallery(
  studioId: string,
  parentGalleryId: string,
): Promise<ReselectionInfo | null> {
  const sb = untypedService()
  const { data: child } = await sb
    .from("galleries")
    .select("id, status")
    .eq("parent_gallery_id", parentGalleryId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!child) return null
  const c = child as { id: string; status: string }

  const { data: tok } = await sb
    .from("gallery_share_tokens")
    .select("token")
    .eq("gallery_id", c.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
  const token = (tok as { token: string }[] | null)?.[0]?.token ?? null

  const { count: assetCount } = await sb
    .from("gallery_assets")
    .select("id", { count: "exact", head: true })
    .eq("gallery_id", c.id)
    .is("deleted_at", null)
  const selectedCount = (await getSelectedAssetIds(sb, c.id)).length

  return {
    childId: c.id,
    token,
    url: token ? `${appUrl()}/g/${token}` : null,
    assetCount: assetCount ?? 0,
    selectedCount,
    status: c.status,
  }
}

// ---------------------------------------------------------------------------
// Todas las RONDAS de re-selección de una galería, con sus fotos, para mostrarlas
// como listas SEPARADAS en la pestaña Selecciones de la galería madre (así el
// estudio ve cada ronda —163 → 71 → 42…— en un solo lugar, sin navegar galerías
// anidadas).
// ---------------------------------------------------------------------------

export interface SelectionRoundPhoto {
  id: string
  thumbUrl: string | null
  originalName: string
}

export interface SelectionRound {
  galleryId: string
  /** "2da selección", "3ra selección"… según la profundidad en la cadena. */
  label: string
  count: number
  submittedAt: string | null
  photos: SelectionRoundPhoto[]
}

const ROUND_ORDINALS = [
  "",
  "Selección",
  "2da selección",
  "3ra selección",
  "4ta selección",
  "5ta selección",
  "6ta selección",
  "7ma selección",
  "8va selección",
]

/**
 * Recorre la cadena de re-selecciones HACIA ABAJO desde `rootGalleryId` y
 * devuelve cada galería descendiente (2da, 3ra…) con las fotos que el cliente
 * eligió en esa ronda (♥ + listas), miniaturas ya resueltas. La ronda 1 (la
 * propia galería madre) NO se incluye: ya se muestra con sus favoritos/listas.
 */
export async function getSelectionRoundsForGallery(
  studioId: string,
  rootGalleryId: string,
): Promise<SelectionRound[]> {
  const sb = untypedService()
  const { getAssetThumbUrl } = await import("./gallery.service")
  const rounds: SelectionRound[] = []
  const seen = new Set<string>([rootGalleryId])
  let parents = [rootGalleryId]
  let depth = 1

  // Cadena acotada (máx 8 niveles) por seguridad ante ciclos.
  while (parents.length && depth < 8) {
    const { data: children } = await sb
      .from("galleries")
      .select("id, selection_submitted_at, created_at")
      .in("parent_gallery_id", parents)
      .eq("studio_id", studioId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
    const kids = ((children ?? []) as Array<{
      id: string
      selection_submitted_at: string | null
    }>).filter((c) => !seen.has(c.id))
    if (!kids.length) break
    depth += 1
    for (const kid of kids) {
      seen.add(kid.id)
      const assetIds = await getSelectedAssetIds(sb, kid.id)
      const photos: SelectionRoundPhoto[] = []
      if (assetIds.length) {
        const { data: rows } = await sb
          .from("gallery_assets")
          .select("id, thumb_key, original_name, sort_order")
          .in("id", assetIds.slice(0, 600))
          .order("sort_order", { ascending: true })
        for (const r of (rows ?? []) as Array<{
          id: string
          thumb_key: string | null
          original_name: string | null
        }>) {
          photos.push({
            id: r.id,
            thumbUrl: getAssetThumbUrl(r.thumb_key),
            originalName: r.original_name ?? "",
          })
        }
      }
      rounds.push({
        galleryId: kid.id,
        label: ROUND_ORDINALS[depth] ?? `${depth}ª selección`,
        count: assetIds.length,
        submittedAt: kid.selection_submitted_at ?? null,
        photos,
      })
    }
    parents = kids.map((k) => k.id)
  }
  return rounds
}

/**
 * Fija cuál RONDA de selección es la FINAL/oficial para esta galería de entrega
 * (`galleries.final_selection_gallery_id`). `sourceGalleryId=null` = la selección
 * de la propia galería. Se usa en la validación de entrega y cálculos derivados.
 */
export async function setGalleryFinalSelection(
  studioId: string,
  galleryId: string,
  sourceGalleryId: string | null,
): Promise<void> {
  const sb = untypedService()
  const { error } = await sb
    .from("galleries")
    .update({
      final_selection_gallery_id: sourceGalleryId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", galleryId)
    .eq("studio_id", studioId)
  if (error) throw error
}

export async function createReselectionGallery(
  studioId: string,
  parentGalleryId: string,
  filter?: SelectionFilter,
): Promise<ReselectionInfo> {
  const sb = untypedService()

  // Idempotente: si ya existe la 2da selección, la devolvemos.
  const existing = await getReselectionForGallery(studioId, parentGalleryId)
  if (existing) return existing

  const { data: parent } = await sb
    .from("galleries")
    .select("id, name, project_id, client_id, visibility, require_email, accent_color, template_id")
    .eq("id", parentGalleryId)
    .eq("studio_id", studioId)
    .maybeSingle()
  if (!parent) throw new Error("Galería no encontrada")
  const p = parent as {
    name: string
    project_id: string | null
    client_id: string | null
    visibility: string | null
    require_email: boolean | null
    accent_color: string | null
    template_id: string | null
  }

  // Fotos que el cliente eligió: ♥ generales + ítems de sus listas (un cliente
  // puede usar cualquiera de las dos formas). Con `filter`, el fotógrafo elige
  // de qué selecciones (listas / ♥) se arma esta 2da ronda.
  const favIds = await getSelectedAssetIds(sb, parentGalleryId, filter)
  if (favIds.length === 0) {
    throw new Error("No hay fotos en las selecciones elegidas para crear la segunda ronda")
  }

  const { data: assetRows } = await sb
    .from("gallery_assets")
    .select(
      "filename, original_name, mime_type, file_size, width, height, status, sort_order, original_key, thumb_key, web_key, metadata, is_private",
    )
    .in("id", favIds)
    .is("deleted_at", null)
  const assets = (assetRows ?? []) as Array<Record<string, unknown>>

  // Galería hija (selección), oculta de la lista.
  const childId = randomUUID()
  const slug = `reseleccion-${createId().slice(0, 12)}`
  const { error: gErr } = await sb.from("galleries").insert({
    id: childId,
    studio_id: studioId,
    parent_gallery_id: parentGalleryId,
    project_id: p.project_id,
    client_id: p.client_id,
    name: `${p.name} — 2da selección`,
    slug,
    gallery_type: "selection",
    status: "published",
    selection_enabled: true,
    visibility: p.visibility ?? "private",
    allow_download: false,
    require_email: p.require_email ?? false,
    accent_color: p.accent_color ?? null,
    template_id: p.template_id ?? null,
    asset_count: assets.length,
  })
  if (gErr) throw gErr

  // Clonar las fotos (mismos keys de storage → sin duplicar archivos).
  const clones = assets.map((a, i) => ({
    id: randomUUID(),
    studio_id: studioId,
    gallery_id: childId,
    filename: a.filename,
    original_name: a.original_name,
    mime_type: a.mime_type,
    file_size: a.file_size,
    width: a.width,
    height: a.height,
    status: a.status,
    sort_order: (a.sort_order as number | null) ?? i,
    original_key: a.original_key,
    thumb_key: a.thumb_key,
    web_key: a.web_key,
    metadata: a.metadata,
    is_private: (a.is_private as boolean | null) ?? false,
  }))
  const { error: aErr } = await sb.from("gallery_assets").insert(clones)
  if (aErr) throw aErr

  // Token público (link para compartir).
  const token = createId() + createId()
  await sb.from("gallery_share_tokens").insert({
    studio_id: studioId,
    gallery_id: childId,
    token,
    expires_at: null,
    view_mode: "full",
  })

  return {
    childId,
    token,
    url: `${appUrl()}/g/${token}`,
    assetCount: clones.length,
    selectedCount: 0,
    status: "published",
  }
}

/**
 * Elimina la 2da selección (galería hija) para poder rehacerla con OTRAS
 * selecciones. Soft-delete de la hija + sus filas clon de assets + revoca sus
 * tokens. Los archivos en storage NO se tocan (las clones comparten los keys
 * del padre; solo se marcan como borradas las filas de la hija).
 */
export async function deleteReselectionGallery(
  studioId: string,
  parentGalleryId: string,
): Promise<void> {
  const sb = untypedService()
  const { data: child } = await sb
    .from("galleries")
    .select("id")
    .eq("parent_gallery_id", parentGalleryId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!child) return
  const childId = (child as { id: string }).id
  const now = new Date().toISOString()

  await sb.from("gallery_assets").update({ deleted_at: now }).eq("gallery_id", childId)
  await sb
    .from("gallery_share_tokens")
    .update({ revoked_at: now })
    .eq("gallery_id", childId)
    .is("revoked_at", null)
  await sb.from("galleries").update({ deleted_at: now }).eq("id", childId)
}
