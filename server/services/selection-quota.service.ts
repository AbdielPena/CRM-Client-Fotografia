/**
 * Cuota de selección por paquete del proyecto.
 *
 * Cada package tiene `edited_photos` (cantidad incluida) y `extra_photo_price`
 * (costo unitario de extras). Cuando el cliente selecciona fotos en una galería
 * vinculada a un proyecto con paquete, lo que pase del límite cuenta como extra.
 *
 * Si la galería no tiene proyecto/paquete vinculado, no hay límite (devuelve
 * `null` como `included`).
 */

import "server-only"

import { createSupabaseServiceClient } from "@/server/supabase/service"

export type SelectionQuota = {
  /** Cuántas incluye el paquete (null = sin límite) */
  included: number | null
  /** Cuántas seleccionó el cliente (favoritos + items en colecciones únicos) */
  selected: number
  /** Cuántas pasan del límite (siempre >= 0) */
  extras: number
  /** Cuántas más le quedan dentro del paquete (null si sin límite) */
  remaining: number | null
  /** Precio por extra (en la moneda del paquete) */
  extraUnitPrice: number
  /** Total estimado de extras */
  extraTotal: number
  /** Currency del paquete */
  currency: string
  packageName: string | null
}

/**
 * Calcula la cuota de selección de una galería.
 * Cuenta tanto favoritos como items de colecciones del cliente como
 * "selected" (deduplicado por asset_id).
 */
export async function getGallerySelectionQuota(
  galleryId: string,
  clientEmail?: string,
): Promise<SelectionQuota> {
  const supabase = createSupabaseServiceClient()

  // 1. Galería → project_id → package
  const { data: g } = await supabase
    .from("galleries")
    .select("id, project_id")
    .eq("id", galleryId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gallery = g as any
  const projectId = gallery?.project_id as string | null

  let packageName: string | null = null
  let included: number | null = null
  let extraUnitPrice = 0
  let currency = "USD"

  if (projectId) {
    const { data: p } = await supabase
      .from("projects")
      .select("package_id")
      .eq("id", projectId)
      .maybeSingle()
    const packageId = (p as { package_id?: string | null } | null)?.package_id ?? null

    if (packageId) {
      const { data: pkg } = await supabase
        .from("packages")
        .select("name, edited_photos, extra_photo_price, currency")
        .eq("id", packageId)
        .maybeSingle()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pk = pkg as any
      if (pk) {
        packageName = pk.name as string
        included = (pk.edited_photos as number | null) ?? null
        extraUnitPrice = Number(pk.extra_photo_price ?? 0)
        currency = (pk.currency as string) ?? "USD"
      }
    }
  }

  // 2. Contar selecciones únicas del cliente
  const selectedIds = new Set<string>()
  const email = (clientEmail ?? "").trim().toLowerCase() || "anon@guest"

  // Favoritos
  const { data: favs } = await supabase
    .from("gallery_favorites")
    .select("asset_id")
    .eq("gallery_id", galleryId)
    .eq("client_email", email)
  for (const f of (favs ?? []) as Array<{ asset_id: string }>) {
    selectedIds.add(f.asset_id)
  }

  // Items en colecciones del cliente
  const { data: colls } = await supabase
    .from("gallery_collections")
    .select("id")
    .eq("gallery_id", galleryId)
    .eq("client_email", email)
    .is("deleted_at", null)
  const collIds = ((colls ?? []) as Array<{ id: string }>).map((c) => c.id)
  if (collIds.length > 0) {
    const { data: items } = await supabase
      .from("gallery_collection_items")
      .select("asset_id")
      .in("collection_id", collIds)
    for (const it of (items ?? []) as Array<{ asset_id: string }>) {
      selectedIds.add(it.asset_id)
    }
  }

  const selected = selectedIds.size
  const extras = included !== null ? Math.max(0, selected - included) : 0
  const remaining = included !== null ? Math.max(0, included - selected) : null
  const extraTotal = extras * extraUnitPrice

  return {
    included,
    selected,
    extras,
    remaining,
    extraUnitPrice,
    extraTotal,
    currency,
    packageName,
  }
}

/**
 * Después de un submit (o periódicamente), notifica al studio si el cliente
 * pasó del límite. Idempotente — no spammea si ya hay notif del último día.
 */
export async function notifyOverLimitIfNeeded(
  studioId: string,
  galleryId: string,
  clientEmail: string,
): Promise<void> {
  const quota = await getGallerySelectionQuota(galleryId, clientEmail)
  if (quota.extras === 0) return

  const supabase = createSupabaseServiceClient()
  // Evitar duplicados: si ya hay una notif del mismo type+entity en últimas 24h, skip
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: recent } = await supabase
    .from("notifications")
    .select("id")
    .eq("studio_id", studioId)
    .eq("related_entity_id", galleryId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .eq("type", "gallery_selection_over_limit" as any)
    .gte("created_at", dayAgo)
    .limit(1)
  if ((recent ?? []).length > 0) return

  await supabase.from("notifications").insert({
    studio_id: studioId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type: "gallery_selection_over_limit" as any,
    title: "Cliente excedió su selección",
    body: `${clientEmail} eligió ${quota.selected} fotos. Su paquete incluye ${quota.included}, hay ${quota.extras} extras.`,
    action_url: `/galleries/${galleryId}`,
    related_entity_type: "gallery",
    related_entity_id: galleryId,
  })
}
