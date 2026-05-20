import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"
import type {
  CreateInvItemInput,
  UpdateInvItemInput,
} from "@/lib/validations/inv-item.schema"

/**
 * Service de items del inventario (catálogo + cantidades agregadas).
 *
 * Patrón canonical replicado de `client.service.ts`:
 *   - studioId como parámetro explícito (auth context lo provee el caller)
 *   - Queries vía supabase.from() con .eq('studio_id', studioId) — RLS además
 *     como red de seguridad
 *   - Soft delete via `deleted_at = now()`
 *   - Activity log unificado (no audit_logs paralelo)
 *
 * USO DE UNTYPED CLIENT: Hasta que la migration `20260520000300_inventory_init`
 * se aplique en Supabase y se regeneren los tipos (`types/supabase.ts`),
 * usamos `untypedServer()` / `untypedService()` que bypasean el chequeo de
 * column names. Cuando esté disponible, migrar a `createSupabaseServerClient`
 * tipado normal.
 *
 * Items con kind='serialized' tienen quantity_total=0; las unidades reales
 * viven en `inv_item_units`. Items kind='bulk' usan quantity_total como
 * contador. El service NO toca las quantity_* derivadas (loaned/rented/etc.) —
 * esas las actualiza el ledger (`inv-stock-movement.service`) al registrar
 * loans/rentals/maintenance.
 */

// ----------------------------------------------------------------------------
// Tipos snake_case (manuales hasta regen de tipos Supabase)
// ----------------------------------------------------------------------------

export type InvItemRow = {
  id: string
  studio_id: string
  kind: "serialized" | "bulk"
  name: string
  category_id: string | null
  subcategory_id: string | null
  brand: string | null
  model: string | null
  description: string | null
  internal_code: string | null
  default_purchase_price: number | string | null
  default_estimated_value: number | string | null
  default_rental_price_per_day: number | string | null
  provider: string | null
  quantity_total: number
  quantity_reserved: number
  quantity_loaned: number
  quantity_rented: number
  quantity_maintenance: number
  quantity_damaged: number
  quantity_lost: number
  min_stock: number
  max_stock: number | null
  default_location_id: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// ----------------------------------------------------------------------------
// Listado + detalle
// ----------------------------------------------------------------------------

export async function getInvItems(
  studioId: string,
  opts: {
    search?: string
    categoryId?: string
    kind?: "serialized" | "bulk"
    activeOnly?: boolean
    lowStockOnly?: boolean
    page?: number
    pageSize?: number
  } = {},
) {
  const {
    search,
    categoryId,
    kind,
    activeOnly = true,
    lowStockOnly = false,
    page = 1,
    pageSize = 50,
  } = opts
  const sb = untypedServer()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = sb
    .from("inv_items")
    .select("*", { count: "exact" })
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .range(from, to)

  if (activeOnly) query = query.eq("is_active", true)
  if (categoryId) query = query.eq("category_id", categoryId)
  if (kind) query = query.eq("kind", kind)
  if (search && search.trim()) {
    const term = `%${search.trim()}%`
    query = query.or(
      `name.ilike.${term},brand.ilike.${term},model.ilike.${term},internal_code.ilike.${term}`,
    )
  }

  const { data, count, error } = await query
  if (error) throwServiceError("INV_ITEM_OP_FAILED", error)

  let items = (data ?? []) as InvItemRow[]
  if (lowStockOnly) {
    items = items.filter((it) => it.quantity_total <= it.min_stock)
  }

  const total = count ?? items.length
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  }
}

export async function getInvItemById(studioId: string, itemId: string) {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("inv_items")
    .select(
      `*,
       category:inv_categories(id, name, code),
       subcategory:inv_subcategories(id, name, code),
       default_location:inv_locations(id, name)`,
    )
    .eq("id", itemId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()

  if (error) throwServiceError("INV_ITEM_OP_FAILED", error)
  return (data ?? null) as
    | (InvItemRow & {
        category?: { id: string; name: string; code: string } | null
        subcategory?: { id: string; name: string; code: string } | null
        default_location?: { id: string; name: string } | null
      })
    | null
}

// ----------------------------------------------------------------------------
// Crear / Update / Soft delete
// ----------------------------------------------------------------------------

export async function createInvItem(
  studioId: string,
  actorId: string,
  data: CreateInvItemInput,
) {
  const sb = untypedService()
  const payload = {
    studio_id: studioId,
    kind: data.kind,
    name: data.name,
    category_id: data.categoryId ?? null,
    subcategory_id: data.subcategoryId ?? null,
    brand: data.brand ?? null,
    model: data.model ?? null,
    description: data.description ?? null,
    internal_code: data.internalCode ?? null,
    default_purchase_price: data.defaultPurchasePrice ?? null,
    default_estimated_value: data.defaultEstimatedValue ?? null,
    default_rental_price_per_day: data.defaultRentalPricePerDay ?? null,
    provider: data.provider ?? null,
    quantity_total: data.quantityTotal ?? 0,
    min_stock: data.minStock ?? 0,
    max_stock: data.maxStock ?? null,
    default_location_id: data.defaultLocationId ?? null,
    notes: data.notes ?? null,
    is_active: true,
  }

  const { data: row, error } = await sb
    .from("inv_items")
    .insert(payload)
    .select("*")
    .single()

  if (error) throwServiceError("INV_ITEM_CREATE_FAILED", error, { studioId })

  const item = row as InvItemRow
  await logActivity({
    studioId,
    actorId,
    entityType: "inv_item",
    entityId: item.id,
    action: "inv_item.created",
    metadata: { name: item.name, kind: item.kind },
  })

  return item
}

export async function updateInvItem(
  studioId: string,
  actorId: string,
  itemId: string,
  data: UpdateInvItemInput,
) {
  const sb = untypedService()

  const patch: Record<string, unknown> = {}
  if (data.name !== undefined) patch.name = data.name
  if (data.categoryId !== undefined) patch.category_id = data.categoryId
  if (data.subcategoryId !== undefined) patch.subcategory_id = data.subcategoryId
  if (data.brand !== undefined) patch.brand = data.brand
  if (data.model !== undefined) patch.model = data.model
  if (data.description !== undefined) patch.description = data.description
  if (data.internalCode !== undefined) patch.internal_code = data.internalCode
  if (data.defaultPurchasePrice !== undefined)
    patch.default_purchase_price = data.defaultPurchasePrice
  if (data.defaultEstimatedValue !== undefined)
    patch.default_estimated_value = data.defaultEstimatedValue
  if (data.defaultRentalPricePerDay !== undefined)
    patch.default_rental_price_per_day = data.defaultRentalPricePerDay
  if (data.provider !== undefined) patch.provider = data.provider
  if (data.minStock !== undefined) patch.min_stock = data.minStock
  if (data.maxStock !== undefined) patch.max_stock = data.maxStock
  if (data.defaultLocationId !== undefined)
    patch.default_location_id = data.defaultLocationId
  if (data.notes !== undefined) patch.notes = data.notes
  if (data.isActive !== undefined) patch.is_active = data.isActive

  // Validar tenant explícito antes de mutar (RLS lo refuerza, pero queremos 404 claro)
  const { data: existing } = await sb
    .from("inv_items")
    .select("id, studio_id, name")
    .eq("id", itemId)
    .maybeSingle()

  if (!existing || existing.studio_id !== studioId) {
    throw new Error("INV_ITEM_NOT_FOUND")
  }

  const { data: row, error } = await sb
    .from("inv_items")
    .update(patch)
    .eq("id", itemId)
    .eq("studio_id", studioId)
    .select("*")
    .single()

  if (error)
    throwServiceError("INV_ITEM_UPDATE_FAILED", error, { studioId, itemId })

  await logActivity({
    studioId,
    actorId,
    entityType: "inv_item",
    entityId: itemId,
    action: "inv_item.updated",
    metadata: data as Record<string, unknown>,
  })

  return row as InvItemRow
}

/**
 * Soft delete: marca `deleted_at = now()`. Restaurable desde `/trash`.
 * NO permite borrar items con unidades activas (préstamo/renta/mantenimiento).
 */
export async function deleteInvItem(
  studioId: string,
  actorId: string,
  itemId: string,
  reason?: string | null,
) {
  const sb = untypedService()

  // Verificar que no haya unidades con status comprometido
  const { data: blockingUnits } = await sb
    .from("inv_item_units")
    .select("id, status")
    .eq("item_id", itemId)
    .eq("studio_id", studioId)
    .in("status", ["reservado", "prestado", "rentado", "mantenimiento"])
    .is("deleted_at", null)
    .limit(1)

  if (Array.isArray(blockingUnits) && blockingUnits.length > 0) {
    throw new Error("INV_ITEM_HAS_ACTIVE_UNITS")
  }

  const { error } = await sb
    .from("inv_items")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", itemId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)

  if (error)
    throwServiceError("INV_ITEM_DELETE_FAILED", error, { studioId, itemId })

  await logActivity({
    studioId,
    actorId,
    entityType: "inv_item",
    entityId: itemId,
    action: "inv_item.deleted",
    metadata: reason ? { reason } : undefined,
  })
}
