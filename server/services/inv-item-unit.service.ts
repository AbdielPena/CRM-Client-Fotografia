import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"
import { d } from "@/lib/decimal"
import { moveStock } from "./inv-stock-movement.service"

/**
 * Service de unidades serializadas (inv_item_units).
 *
 * Cada item kind='serialized' tiene N unidades individuales con número de
 * serie, QR code, barcode, fecha de compra, valor estimado. Permiten
 * tracking de cada pieza por separado.
 *
 * Cuando se crea una unidad, automáticamente emite movement type='entrada'
 * → status='disponible' implícito.
 */

export type InvItemUnitRow = {
  id: string
  studio_id: string
  item_id: string
  serial_number: string | null
  internal_code: string | null
  qr_code: string | null
  barcode: string | null
  status:
    | "disponible"
    | "reservado"
    | "prestado"
    | "rentado"
    | "mantenimiento"
    | "danado"
    | "perdido"
    | "retirado"
  physical_condition: string | null
  operational_condition: string | null
  current_location_id: string | null
  current_responsible_id: string | null
  current_responsible_type: "client" | "responsible" | null
  purchase_date: string | null
  purchase_price: number | string | null
  estimated_value: number | string | null
  warranty_expiry: string | null
  provider: string | null
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export async function getInvItemUnits(
  studioId: string,
  itemId: string,
  opts: {
    status?: InvItemUnitRow["status"]
    page?: number
    pageSize?: number
  } = {},
) {
  const { page = 1, pageSize = 50 } = opts
  const sb = untypedServer()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = sb
    .from("inv_item_units")
    .select(
      `*,
       location:inv_locations(id, name)`,
      { count: "exact" },
    )
    .eq("studio_id", studioId)
    .eq("item_id", itemId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to)

  if (opts.status) query = query.eq("status", opts.status)

  const { data, count, error } = await query
  if (error) throwServiceError("INV_UNIT_OP_FAILED", error)

  return {
    items: (data ?? []) as Array<
      InvItemUnitRow & {
        location?: { id: string; name: string } | null
      }
    >,
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize) || 1,
  }
}

export async function getInvItemUnitById(studioId: string, unitId: string) {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("inv_item_units")
    .select(
      `*,
       item:inv_items(id, name, kind, brand, model),
       location:inv_locations(id, name)`,
    )
    .eq("id", unitId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()

  if (error) throwServiceError("INV_UNIT_OP_FAILED", error)
  return data as
    | (InvItemUnitRow & {
        item?: unknown
        location?: unknown
      })
    | null
}

export async function createInvItemUnit(
  studioId: string,
  actorId: string,
  data: {
    itemId: string
    serialNumber?: string
    internalCode?: string
    qrCode?: string
    barcode?: string
    physicalCondition?: string
    operationalCondition?: string
    currentLocationId?: string
    purchaseDate?: string
    purchasePrice?: number
    estimatedValue?: number
    warrantyExpiry?: string
    provider?: string
    notes?: string
  },
) {
  const sb = untypedService()

  // Validar que el item exista, sea del studio, y kind='serialized'
  const { data: item } = await sb
    .from("inv_items")
    .select("id, kind")
    .eq("id", data.itemId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()

  if (!item) throw new Error("INV_ITEM_NOT_FOUND")
  if (item.kind !== "serialized") {
    throw new Error("INV_UNIT_REQUIRES_SERIALIZED_ITEM")
  }

  const { data: row, error } = await sb
    .from("inv_item_units")
    .insert({
      studio_id: studioId,
      item_id: data.itemId,
      serial_number: data.serialNumber ?? null,
      internal_code: data.internalCode ?? null,
      qr_code: data.qrCode ?? null,
      barcode: data.barcode ?? null,
      status: "disponible",
      physical_condition: data.physicalCondition ?? null,
      operational_condition: data.operationalCondition ?? null,
      current_location_id: data.currentLocationId ?? null,
      purchase_date: data.purchaseDate ?? null,
      purchase_price:
        data.purchasePrice != null ? d(data.purchasePrice).toFixed(2) : null,
      estimated_value:
        data.estimatedValue != null ? d(data.estimatedValue).toFixed(2) : null,
      warranty_expiry: data.warrantyExpiry ?? null,
      provider: data.provider ?? null,
      notes: data.notes ?? null,
    })
    .select("*")
    .single()

  if (error) {
    if (error.code === "23505") {
      if (error.message?.includes("serial_number"))
        throw new Error("INV_UNIT_DUPLICATE_SERIAL")
      if (error.message?.includes("internal_code"))
        throw new Error("INV_UNIT_DUPLICATE_INTERNAL_CODE")
      if (error.message?.includes("qr_code"))
        throw new Error("INV_UNIT_DUPLICATE_QR")
    }
    throwServiceError("INV_UNIT_CREATE_FAILED", error, { studioId })
  }

  const unit = row as InvItemUnitRow

  // Emit 'entrada' movement (auto status='disponible')
  try {
    await moveStock({
      studioId,
      type: "entrada",
      quantity: 1,
      itemId: data.itemId,
      itemUnitId: unit.id,
      registeredBy: actorId,
      reason: "Alta de unidad serializada",
    })
  } catch (err) {
    console.error("[inv-item-unit] moveStock entrada falló:", err)
  }

  await logActivity({
    studioId,
    actorId,
    entityType: "inv_item_unit",
    entityId: unit.id,
    action: "inv_item_unit.created",
    metadata: { item_id: data.itemId, serial_number: unit.serial_number },
  })

  return unit
}

/**
 * Marca una unidad como pérdida o daño. Emite el movement correspondiente
 * (afecta quantity_* del parent item para bulk, status del unit para serialized).
 */
export async function reportInvUnitLoss(
  studioId: string,
  actorId: string,
  data: {
    unitId: string
    kind: "perdida" | "dano"
    reason: string
  },
) {
  const sb = untypedService()
  const { data: unit } = await sb
    .from("inv_item_units")
    .select("id, item_id, status")
    .eq("id", data.unitId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()

  if (!unit) throw new Error("INV_UNIT_NOT_FOUND")

  try {
    await moveStock({
      studioId,
      type: data.kind,
      quantity: 1,
      itemId: unit.item_id,
      itemUnitId: unit.id,
      registeredBy: actorId,
      reason: data.reason,
    })
  } catch (err) {
    throwServiceError("INV_UNIT_LOSS_FAILED", err as Error, { studioId })
  }

  await logActivity({
    studioId,
    actorId,
    entityType: "inv_item_unit",
    entityId: data.unitId,
    action: `inv_item_unit.${data.kind}`,
    metadata: { reason: data.reason },
  })
}
