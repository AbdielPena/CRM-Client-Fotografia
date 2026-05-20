import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"
import { moveStock } from "./inv-stock-movement.service"
import { d } from "@/lib/decimal"

/**
 * Service de mantenimiento del módulo Inventory.
 *
 * Cuando un item necesita mantenimiento (preventivo/correctivo/reparación):
 *   1. createInvMaintenance crea record con status='pendiente'
 *   2. Optional: moveStock type='mantenimiento' → unit pasa a 'mantenimiento'
 *   3. completeMaintenance al terminar:
 *      - status='completado', end_date, cost final
 *      - moveStock type='reparacion' (regresa a 'disponible' implícito en
 *        el RPC inv_move_stock — aunque para serialized hay que ajustar
 *        manualmente porque la lógica del RPC pone 'mantenimiento' por
 *        este type. Esto es una limitation conocida; F4 final debería
 *        refinar el mapping)
 *
 * Las reparaciones cost se pueden vincular a fin_transactions.gasto opcional.
 */

export type InvMaintenanceRow = {
  id: string
  studio_id: string
  code: string
  item_unit_id: string | null
  item_id: string | null
  type:
    | "preventivo"
    | "correctivo"
    | "limpieza"
    | "revision"
    | "reparacion"
    | "calibracion"
    | "cambio_pieza"
  status: "pendiente" | "en_proceso" | "completado" | "cancelado"
  description: string | null
  start_date: string | null
  end_date: string | null
  technician: string | null
  cost: number | string
  parts_used: unknown
  photos: unknown
  next_maintenance_date: string | null
  notes: string | null
  registered_by: string | null
  created_at: string
  updated_at: string
}

function generateMaintenanceCode(): string {
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const rnd = Math.floor(Math.random() * 10000).toString().padStart(4, "0")
  return `MT-${yyyymmdd}-${rnd}`
}

export async function getInvMaintenanceRecords(
  studioId: string,
  opts: {
    status?: InvMaintenanceRow["status"]
    type?: InvMaintenanceRow["type"]
    itemId?: string
    itemUnitId?: string
    page?: number
    pageSize?: number
  } = {},
) {
  const { page = 1, pageSize = 50 } = opts
  const sb = untypedServer()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = sb
    .from("inv_maintenance_records")
    .select(
      `*,
       item:inv_items(id, name, kind),
       unit:inv_item_units(id, serial_number)`,
      { count: "exact" },
    )
    .eq("studio_id", studioId)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to)

  if (opts.status) query = query.eq("status", opts.status)
  if (opts.type) query = query.eq("type", opts.type)
  if (opts.itemId) query = query.eq("item_id", opts.itemId)
  if (opts.itemUnitId) query = query.eq("item_unit_id", opts.itemUnitId)

  const { data, count, error } = await query
  if (error) throwServiceError("INV_MAINT_OP_FAILED", error)

  return {
    items: (data ?? []) as Array<
      InvMaintenanceRow & {
        item?: { id: string; name: string; kind: string } | null
        unit?: { id: string; serial_number: string | null } | null
      }
    >,
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize) || 1,
  }
}

export async function getInvMaintenanceById(
  studioId: string,
  maintenanceId: string,
) {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("inv_maintenance_records")
    .select(
      `*,
       item:inv_items(id, name, brand, kind),
       unit:inv_item_units(id, serial_number, internal_code)`,
    )
    .eq("id", maintenanceId)
    .eq("studio_id", studioId)
    .maybeSingle()

  if (error)
    throwServiceError("INV_MAINT_GET_FAILED", error, {
      studioId,
      maintenanceId,
    })

  if (!data) return null
  return data as InvMaintenanceRow & {
    item?: {
      id: string
      name: string
      brand: string | null
      kind: string
    } | null
    unit?: {
      id: string
      serial_number: string | null
      internal_code: string | null
    } | null
  }
}

export async function cancelInvMaintenance(
  studioId: string,
  actorId: string,
  maintenanceId: string,
  reason?: string,
) {
  const sb = untypedService()
  const { error } = await sb
    .from("inv_maintenance_records")
    .update({ status: "cancelado", end_date: new Date().toISOString() })
    .eq("id", maintenanceId)
    .eq("studio_id", studioId)
    .in("status", ["pendiente", "en_proceso"])

  if (error)
    throwServiceError("INV_MAINT_CANCEL_FAILED", error, {
      studioId,
      maintenanceId,
    })

  await logActivity({
    studioId,
    actorId,
    entityType: "inv_maintenance",
    entityId: maintenanceId,
    action: "inv_maintenance.cancelled",
    metadata: reason ? { reason } : undefined,
  })
}

export async function createInvMaintenance(
  studioId: string,
  actorId: string,
  data: {
    itemId?: string | null
    itemUnitId?: string | null
    type: InvMaintenanceRow["type"]
    description?: string
    technician?: string
    estimatedCost?: number
    notes?: string
    startNow?: boolean // si true, status='en_proceso' + moveStock type='mantenimiento'
  },
) {
  const sb = untypedService()
  if (!data.itemId && !data.itemUnitId) {
    throw new Error("INV_MAINT_REQUIRES_ITEM_OR_UNIT")
  }

  let row: InvMaintenanceRow | null = null
  for (let i = 0; i < 3 && !row; i++) {
    const code = generateMaintenanceCode()
    const { data: r, error } = await sb
      .from("inv_maintenance_records")
      .insert({
        studio_id: studioId,
        code,
        item_id: data.itemId ?? null,
        item_unit_id: data.itemUnitId ?? null,
        type: data.type,
        status: data.startNow ? "en_proceso" : "pendiente",
        description: data.description ?? null,
        start_date: data.startNow ? new Date().toISOString() : null,
        technician: data.technician ?? null,
        cost: data.estimatedCost != null ? d(data.estimatedCost).toFixed(2) : "0.00",
        notes: data.notes ?? null,
        registered_by: actorId,
      })
      .select("*")
      .maybeSingle()

    if (error) {
      if (error.code === "23505" && error.message?.includes("code")) continue
      throwServiceError("INV_MAINT_CREATE_FAILED", error, { studioId })
    }
    row = r as InvMaintenanceRow
  }
  if (!row) throw new Error("INV_MAINT_CODE_GEN_FAILED")

  // Si startNow → moveStock para marcar la unidad en mantenimiento
  if (data.startNow) {
    try {
      await moveStock({
        studioId,
        type: "mantenimiento",
        quantity: 1,
        itemId: data.itemId ?? null,
        itemUnitId: data.itemUnitId ?? null,
        maintenanceId: row.id,
        registeredBy: actorId,
        reason: `Mantenimiento #${row.code}: ${data.type}`,
      })
    } catch (err) {
      console.error("[inv-maintenance] moveStock falló:", err)
    }
  }

  await logActivity({
    studioId,
    actorId,
    entityType: "inv_maintenance",
    entityId: row.id,
    action: "inv_maintenance.created",
    metadata: { code: row.code, type: data.type, technician: data.technician },
  })

  return row
}

export async function completeInvMaintenance(
  studioId: string,
  actorId: string,
  data: {
    maintenanceId: string
    finalCost?: number
    nextMaintenanceDate?: string
    notes?: string
  },
) {
  const sb = untypedService()

  const { data: existing } = await sb
    .from("inv_maintenance_records")
    .select("id, item_id, item_unit_id, code, type, status")
    .eq("id", data.maintenanceId)
    .eq("studio_id", studioId)
    .maybeSingle()

  if (!existing) throw new Error("INV_MAINT_NOT_FOUND")
  if (existing.status === "completado") throw new Error("INV_MAINT_ALREADY_DONE")
  if (existing.status === "cancelado") throw new Error("INV_MAINT_CANCELLED")

  const patch: Record<string, unknown> = {
    status: "completado",
    end_date: new Date().toISOString(),
  }
  if (data.finalCost != null) patch.cost = d(data.finalCost).toFixed(2)
  if (data.nextMaintenanceDate) patch.next_maintenance_date = data.nextMaintenanceDate
  if (data.notes) patch.notes = data.notes

  const { error: updateErr } = await sb
    .from("inv_maintenance_records")
    .update(patch)
    .eq("id", data.maintenanceId)
    .eq("studio_id", studioId)

  if (updateErr)
    throwServiceError("INV_MAINT_UPDATE_FAILED", updateErr, {
      studioId,
      maintenanceId: data.maintenanceId,
    })

  // moveStock: devolver el unit a disponible. El movement_type 'reparacion'
  // está en el enum pero el RPC inv_move_stock lo mapea a status='mantenimiento'.
  // Para serialized usamos type='entrada' que sí mapea a 'disponible'.
  if (existing.item_unit_id) {
    try {
      await moveStock({
        studioId,
        type: "entrada",
        quantity: 1,
        itemUnitId: existing.item_unit_id,
        maintenanceId: existing.id,
        registeredBy: actorId,
        reason: `Mantenimiento completado #${existing.code}: ${existing.type}`,
      })
    } catch (err) {
      console.error("[inv-maintenance] moveStock devolución falló:", err)
    }
  }

  await logActivity({
    studioId,
    actorId,
    entityType: "inv_maintenance",
    entityId: data.maintenanceId,
    action: "inv_maintenance.completed",
    metadata: {
      cost: patch.cost,
      next_maintenance_date: data.nextMaintenanceDate,
    },
  })
}
