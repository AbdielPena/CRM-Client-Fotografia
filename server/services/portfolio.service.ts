import "server-only"

import { untypedService } from "@/server/supabase/untyped"

/**
 * Portafolio: la vitrina pública del estudio.
 *
 * Regla de oro: el archivo se COPIA al bucket `portfolio` al añadirlo. Nunca se
 * referencia el de la galería — si el fotógrafo borra la galería, la vitrina
 * tiene que seguir en pie.
 */

const BUCKET = "portfolio"
const RENDITIONS = "gallery-renditions"

export interface PortfolioCategory {
  id: string
  name: string
  slug: string
  sortOrder: number
  isActive: boolean
  itemCount: number
}

export interface PortfolioItem {
  id: string
  categoryId: string | null
  categoryName: string | null
  imageKey: string
  imageUrl: string
  width: number | null
  height: number | null
  title: string | null
  description: string | null
  sortOrder: number
  published: boolean
  projectId: string | null
  galleryAssetId: string | null
  createdAt: string
}

/** URL pública y permanente. El bucket `portfolio` es público: sin firma, cacheable. */
export function portfolioImageUrl(key: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "")
  return `${base}/storage/v1/object/public/${BUCKET}/${key}`
}

export async function getPortfolioCategories(studioId: string): Promise<PortfolioCategory[]> {
  const sb = untypedService()
  const [{ data: cats }, { data: items }] = await Promise.all([
    sb
      .from("portfolio_categories")
      .select("id, name, slug, sort_order, is_active")
      .eq("studio_id", studioId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    sb
      .from("portfolio_items")
      .select("category_id")
      .eq("studio_id", studioId)
      .is("deleted_at", null),
  ])

  const counts = new Map<string, number>()
  for (const r of (items ?? []) as Array<{ category_id: string | null }>) {
    if (r.category_id) counts.set(r.category_id, (counts.get(r.category_id) ?? 0) + 1)
  }

  return ((cats ?? []) as any[]).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    sortOrder: c.sort_order,
    isActive: c.is_active,
    itemCount: counts.get(c.id) ?? 0,
  }))
}

export async function getPortfolioItems(
  studioId: string,
  opts: { categoryId?: string; publishedOnly?: boolean } = {},
): Promise<PortfolioItem[]> {
  const sb = untypedService()
  let q = sb
    .from("portfolio_items")
    .select(
      "id, category_id, image_key, width, height, title, description, sort_order, published, project_id, gallery_asset_id, created_at, category:portfolio_categories(name)",
    )
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })

  if (opts.categoryId) q = q.eq("category_id", opts.categoryId)
  if (opts.publishedOnly) q = q.eq("published", true)

  const { data } = await q
  return ((data ?? []) as any[]).map((r) => {
    const cat = Array.isArray(r.category) ? r.category[0] : r.category
    return {
      id: r.id,
      categoryId: r.category_id ?? null,
      categoryName: cat?.name ?? null,
      imageKey: r.image_key,
      imageUrl: portfolioImageUrl(r.image_key),
      width: r.width ?? null,
      height: r.height ?? null,
      title: r.title ?? null,
      description: r.description ?? null,
      sortOrder: r.sort_order,
      published: r.published,
      projectId: r.project_id ?? null,
      galleryAssetId: r.gallery_asset_id ?? null,
      createdAt: r.created_at,
    }
  })
}

/**
 * Marca fotos de una galería para el portafolio. El fotógrafo elige cuáles: esto
 * recibe exactamente las que seleccionó, nunca la galería entera.
 *
 * Copia cada archivo al bucket propio. Idempotente: si una foto ya está en el
 * portafolio se salta (índice único por gallery_asset_id).
 */
export async function addGalleryAssetsToPortfolio(
  studioId: string,
  assetIds: string[],
  categoryId: string,
): Promise<{ added: number; skipped: number; failed: number }> {
  if (assetIds.length === 0) return { added: 0, skipped: 0, failed: 0 }
  const sb = untypedService()

  // La categoría tiene que ser de ESTE estudio.
  const { data: cat } = await sb
    .from("portfolio_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!cat) throw new Error("La categoría no existe o no es de este estudio")

  // Solo fotos de este estudio, con rendición web lista.
  const { data: assets } = await sb
    .from("gallery_assets")
    .select("id, web_key, width, height, original_name, gallery_id")
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .in("id", assetIds)
    .not("web_key", "is", null)

  const rows = (assets ?? []) as Array<{
    id: string
    web_key: string
    width: number | null
    height: number | null
    original_name: string | null
    gallery_id: string
  }>
  if (rows.length === 0) return { added: 0, skipped: 0, failed: assetIds.length }

  // Ya en el portafolio → saltar (no duplicar ni re-copiar).
  const { data: existing } = await sb
    .from("portfolio_items")
    .select("gallery_asset_id")
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .in(
      "gallery_asset_id",
      rows.map((r) => r.id),
    )
  const already = new Set(
    ((existing ?? []) as Array<{ gallery_asset_id: string | null }>).map((r) => r.gallery_asset_id),
  )

  // La sesión de origen, para dejar constancia de dónde salió la foto.
  const galleryIds = [...new Set(rows.map((r) => r.gallery_id))]
  const { data: galleries } = await sb
    .from("galleries")
    .select("id, project_id")
    .in("id", galleryIds)
  const projectByGallery = new Map(
    ((galleries ?? []) as Array<{ id: string; project_id: string | null }>).map((g) => [
      g.id,
      g.project_id,
    ]),
  )

  // sort_order: al final de la categoría, respetando lo que ya hay.
  const { data: last } = await sb
    .from("portfolio_items")
    .select("sort_order")
    .eq("studio_id", studioId)
    .eq("category_id", categoryId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
  let nextOrder = (((last ?? []) as Array<{ sort_order: number }>)[0]?.sort_order ?? 0) + 1

  let added = 0
  let skipped = 0
  let failed = 0

  for (const a of rows) {
    if (already.has(a.id)) {
      skipped++
      continue
    }
    try {
      // Copiar el archivo al bucket del portafolio.
      const dl = await sb.storage.from(RENDITIONS).download(a.web_key)
      if (dl.error || !dl.data) {
        failed++
        continue
      }
      const key = `${studioId}/${a.id}.webp`
      const up = await sb.storage
        .from(BUCKET)
        .upload(key, dl.data, { contentType: "image/webp", upsert: true })
      if (up.error) {
        failed++
        continue
      }

      const { error } = await sb.from("portfolio_items").insert({
        studio_id: studioId,
        category_id: categoryId,
        gallery_asset_id: a.id,
        project_id: projectByGallery.get(a.gallery_id) ?? null,
        image_key: key,
        width: a.width,
        height: a.height,
        title: null,
        sort_order: nextOrder++,
        published: false, // nace en borrador: el estudio decide cuándo publicar
      })
      if (error) {
        failed++
        continue
      }
      added++
    } catch {
      failed++
    }
  }

  return { added, skipped, failed }
}

/** Sube una foto directamente al portafolio (sin pasar por una galería). */
export async function uploadPortfolioItem(
  studioId: string,
  input: {
    file: ArrayBuffer
    contentType: string
    categoryId: string
    title?: string | null
    description?: string | null
    projectId?: string | null
    published?: boolean
    width?: number | null
    height?: number | null
  },
): Promise<{ id: string }> {
  const sb = untypedService()

  const { data: cat } = await sb
    .from("portfolio_categories")
    .select("id")
    .eq("id", input.categoryId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!cat) throw new Error("La categoría no existe o no es de este estudio")

  const ext = input.contentType.includes("png")
    ? "png"
    : input.contentType.includes("webp")
      ? "webp"
      : "jpg"
  const key = `${studioId}/manual/${crypto.randomUUID()}.${ext}`

  const up = await sb.storage
    .from(BUCKET)
    .upload(key, input.file, { contentType: input.contentType, upsert: false })
  if (up.error) throw new Error("No se pudo subir la imagen")

  const { data: last } = await sb
    .from("portfolio_items")
    .select("sort_order")
    .eq("studio_id", studioId)
    .eq("category_id", input.categoryId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
  const sortOrder = (((last ?? []) as Array<{ sort_order: number }>)[0]?.sort_order ?? 0) + 1

  const { data, error } = await sb
    .from("portfolio_items")
    .insert({
      studio_id: studioId,
      category_id: input.categoryId,
      image_key: key,
      width: input.width ?? null,
      height: input.height ?? null,
      title: input.title ?? null,
      description: input.description ?? null,
      project_id: input.projectId ?? null,
      sort_order: sortOrder,
      published: input.published ?? false,
    })
    .select("id")
    .single()

  if (error || !data) {
    // No dejar el archivo huérfano si la fila no entró.
    await sb.storage.from(BUCKET).remove([key])
    throw new Error("No se pudo guardar la foto en el portafolio")
  }
  return { id: (data as { id: string }).id }
}

export async function updatePortfolioItem(
  studioId: string,
  itemId: string,
  patch: {
    categoryId?: string
    title?: string | null
    description?: string | null
    published?: boolean
    sortOrder?: number
  },
): Promise<void> {
  const sb = untypedService()
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.categoryId !== undefined) row.category_id = patch.categoryId
  if (patch.title !== undefined) row.title = patch.title
  if (patch.description !== undefined) row.description = patch.description
  if (patch.published !== undefined) row.published = patch.published
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder

  const { error } = await sb
    .from("portfolio_items")
    .update(row)
    .eq("id", itemId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
  if (error) throw new Error("No se pudo actualizar")
}

/** Despublicar sin borrar (punto 8 de la spec). */
export async function setPortfolioPublished(
  studioId: string,
  itemId: string,
  published: boolean,
): Promise<void> {
  await updatePortfolioItem(studioId, itemId, { published })
}

/** Quitar del portafolio. Soft-delete: el archivo se queda por si acaso. */
export async function removePortfolioItem(studioId: string, itemId: string): Promise<void> {
  const sb = untypedService()
  const { error } = await sb
    .from("portfolio_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("studio_id", studioId)
  if (error) throw new Error("No se pudo quitar del portafolio")
}

/** Reordena dentro de una categoría. El orden manda en la web. */
export async function reorderPortfolioItems(
  studioId: string,
  orderedIds: string[],
): Promise<void> {
  const sb = untypedService()
  await Promise.all(
    orderedIds.map((id, i) =>
      sb
        .from("portfolio_items")
        .update({ sort_order: i + 1, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("studio_id", studioId)
        .is("deleted_at", null),
    ),
  )
}

/** Qué fotos de esta galería ya están en el portafolio (para marcarlas en la UI). */
export async function getPortfolioAssetIds(
  studioId: string,
  galleryId: string,
): Promise<Set<string>> {
  const sb = untypedService()
  const { data: assets } = await sb
    .from("gallery_assets")
    .select("id")
    .eq("studio_id", studioId)
    .eq("gallery_id", galleryId)
    .is("deleted_at", null)
  const ids = ((assets ?? []) as Array<{ id: string }>).map((a) => a.id)
  if (ids.length === 0) return new Set()

  const { data } = await sb
    .from("portfolio_items")
    .select("gallery_asset_id")
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .in("gallery_asset_id", ids)

  return new Set(
    ((data ?? []) as Array<{ gallery_asset_id: string | null }>)
      .map((r) => r.gallery_asset_id)
      .filter((x): x is string => !!x),
  )
}
