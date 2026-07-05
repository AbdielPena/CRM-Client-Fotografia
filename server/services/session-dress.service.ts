import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import {
  recordDressPayable,
  settleDressPayable,
  cancelDressPayable,
} from "@/server/services/finanzapp-bridge.service"
import { notify } from "@/server/services/notification.service"

/**
 * Vestido seleccionado para la sesión (quinceañera). Se puede elegir del
 * catálogo (dress_catalog, vínculo `dress_catalog_id`) o a mano. Los campos
 * dress_name/provider/cost quedan como snapshot denormalizado. El costo
 * (rental_price) se resuelve en el servidor cuando elige el CLIENTE en el portal
 * → nunca se expone el precio al cliente.
 */
export async function setSessionDress(
  studioId: string,
  projectId: string,
  data: {
    dressCatalogId?: string | null
    dressName: string
    dressProvider: string
    dressCost: number | null
    dressNotes: string
    dressImageUrl?: string | null
  },
): Promise<void> {
  const sb = untypedService()
  const patch: Record<string, unknown> = {
    dress_name: data.dressName.trim() || null,
    dress_provider: data.dressProvider.trim() || null,
    dress_cost: data.dressCost,
    dress_notes: data.dressNotes.trim() || null,
  }
  if (data.dressCatalogId !== undefined) patch.dress_catalog_id = data.dressCatalogId || null
  if (data.dressImageUrl !== undefined) patch.dress_image_url = data.dressImageUrl || null

  // Resolver includes_dress + monto incluido (plan → categoría) y datos del proyecto.
  const { data: proj } = await sb
    .from("projects")
    .select("event_date, package_id, service_category_id, name, dress_extra_invoiced")
    .eq("id", projectId)
    .eq("studio_id", studioId)
    .maybeSingle()
  const p = proj as {
    event_date?: string | null
    package_id?: string | null
    service_category_id?: string | null
    name?: string | null
    dress_extra_invoiced?: boolean | null
  } | null
  let includesDress = false
  let includedAmount = 0
  if (p?.package_id) {
    const { data: pkg } = await sb
      .from("packages")
      .select("includes_dress, dress_included_amount")
      .eq("id", p.package_id)
      .maybeSingle()
    const pk = pkg as { includes_dress?: boolean; dress_included_amount?: number | null } | null
    includesDress = !!pk?.includes_dress
    includedAmount = Number(pk?.dress_included_amount ?? 0)
  }
  if (includesDress && !includedAmount && p?.service_category_id) {
    const { data: cat } = await sb
      .from("service_categories")
      .select("dress_included_amount")
      .eq("id", p.service_category_id)
      .maybeSingle()
    includedAmount = Number((cat as { dress_included_amount?: number | null } | null)?.dress_included_amount ?? 0)
  }
  const cost = data.dressCost
  const extra =
    includesDress && includedAmount > 0 && cost != null ? Math.max(0, cost - includedAmount) : 0
  patch.dress_extra_cost = extra || null

  const { error } = await sb
    .from("projects")
    .update(patch)
    .eq("id", projectId)
    .eq("studio_id", studioId)
  if (error) throw new Error(error.message)

  // Gasto del vestido en FinanzApp (payable = costo que paga el estudio a la
  // tienda). Best-effort (sin workspace mapeado → skip). Ver colaboradores.
  try {
    if (includesDress && cost != null && cost > 0) {
      await recordDressPayable(studioId, {
        projectId,
        acreedor: data.dressProvider.trim() || "Vestido",
        monto: cost,
        dueDate: p?.event_date ?? null,
        notas: `Vestido de la sesión${data.dressName.trim() ? `: ${data.dressName.trim()}` : ""}`,
      })
    } else {
      await cancelDressPayable(studioId, projectId)
    }
  } catch {
    /* best-effort */
  }

  // Avisar al dueño si el vestido excede lo incluido y aún no se ha facturado.
  try {
    if (extra > 0 && !p?.dress_extra_invoiced) {
      await notify({
        studioId,
        type: "system",
        title: "Vestido excede lo incluido",
        body: `${p?.name ?? "Sesión"}: el vestido cuesta más que lo incluido. Costo extra a facturar: RD$${extra.toLocaleString("es-DO")}.`,
        actionUrl: `/projects/${projectId}`,
        recipientRole: "owner",
        relatedEntityType: "project",
        relatedEntityId: projectId,
      })
    }
  } catch {
    /* best-effort */
  }
}

/** Marca el gasto del vestido como pagado (settle en FinanzApp + estado). */
export async function setSessionDressPaid(
  studioId: string,
  projectId: string,
  paid: boolean,
): Promise<void> {
  const sb = untypedService()
  const { error } = await sb
    .from("projects")
    .update({ dress_pay_status: paid ? "paid" : "pending" })
    .eq("id", projectId)
    .eq("studio_id", studioId)
  if (error) throw new Error(error.message)
  try {
    if (paid) await settleDressPayable(studioId, { projectId })
  } catch {
    /* best-effort */
  }
}

/**
 * Registra el vestido por id del catálogo, resolviendo nombre/tienda/costo en el
 * servidor. Para el portal del cliente (no envía ni ve el precio) y reutilizable.
 * NO toca dress_notes. Devuelve el nombre para confirmación.
 */
export async function setSessionDressFromCatalog(
  studioId: string,
  projectId: string,
  catalogDressId: string,
): Promise<{ dressName: string }> {
  const sb = untypedService()
  const { data: d } = await sb
    .from("dress_catalog")
    .select("id, name, collection, rental_price, is_active, dress_stores(name)")
    .eq("id", catalogDressId)
    .eq("studio_id", studioId)
    .maybeSingle()
  if (!d) throw new Error("Vestido no encontrado")
  const dress = d as {
    name: string
    collection: string | null
    rental_price: number | string | null
    dress_stores: { name?: string } | { name?: string }[] | null
  }
  const store = Array.isArray(dress.dress_stores) ? dress.dress_stores[0] : dress.dress_stores
  const fullName = dress.collection ? `${dress.name} — ${dress.collection}` : dress.name
  const { error } = await sb
    .from("projects")
    .update({
      dress_catalog_id: catalogDressId,
      dress_name: fullName,
      dress_provider: store?.name ?? null,
      dress_cost: dress.rental_price != null ? Number(dress.rental_price) : null,
    })
    .eq("id", projectId)
    .eq("studio_id", studioId)
  if (error) throw new Error(error.message)
  return { dressName: fullName }
}

export type ClientDressOption = {
  id: string
  name: string
  collection: string | null
  imageUrl: string | null
}
export type ClientDressStore = {
  storeId: string
  storeName: string
  dresses: ClientDressOption[]
}

/**
 * Catálogo de vestidos para que el CLIENTE elija en su portal: SIN precio
 * (el rental_price es privado), agrupado por tienda. Solo activos.
 */
export async function getDressPickerForClient(studioId: string): Promise<ClientDressStore[]> {
  const sb = untypedService()
  const { data } = await sb
    .from("dress_catalog")
    .select("id, name, collection, image_url, store_id, is_active, dress_stores(name)")
    .eq("studio_id", studioId)
    .eq("is_active", true)
    .order("collection")
    .order("name")
  const byStore = new Map<string, ClientDressStore>()
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const storeId = r.store_id as string
    const storeName = (r.dress_stores as { name?: string } | null)?.name ?? "Vestidos"
    let g = byStore.get(storeId)
    if (!g) {
      g = { storeId, storeName, dresses: [] }
      byStore.set(storeId, g)
    }
    g.dresses.push({
      id: r.id as string,
      name: r.name as string,
      collection: (r.collection as string | null) ?? null,
      imageUrl: (r.image_url as string | null) ?? null,
    })
  }
  return [...byStore.values()]
}
