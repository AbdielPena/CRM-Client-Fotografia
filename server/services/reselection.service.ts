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
  const { count: selectedCount } = await sb
    .from("gallery_favorites")
    .select("asset_id", { count: "exact", head: true })
    .eq("gallery_id", c.id)

  return {
    childId: c.id,
    token,
    url: token ? `${appUrl()}/g/${token}` : null,
    assetCount: assetCount ?? 0,
    selectedCount: selectedCount ?? 0,
    status: c.status,
  }
}

export async function createReselectionGallery(
  studioId: string,
  parentGalleryId: string,
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

  // Fotos que el cliente eligió (favoritos, unión de todos los clientes).
  const { data: favs } = await sb
    .from("gallery_favorites")
    .select("asset_id")
    .eq("gallery_id", parentGalleryId)
  const favIds = [
    ...new Set(((favs ?? []) as Array<{ asset_id: string }>).map((f) => f.asset_id)),
  ]
  if (favIds.length === 0) {
    throw new Error("El cliente aún no ha marcado fotos para crear una segunda selección")
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
