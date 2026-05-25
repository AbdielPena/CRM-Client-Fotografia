import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"

/**
 * Service del ledger universal de inventario (inv_stock_movements).
 *
 * NO escribe directamente a las tablas — usa la RPC PL/pgSQL `inv_move_stock`
 * que garantiza atomicidad: ledger insert + items.quantity_* / units.status
 * update en una sola transacción Postgres con SELECT FOR UPDATE.
 *
 * USO: este service es invocado desde los services de loans / rentals /
 * reservations / maintenance cuando ocurre un movement. No se debe llamar
 * desde Route Handlers directamente — siempre encapsulado en operación de
 * dominio.
 *
 * Ejemplo (`inv-loan.service.ts`):
 *   await moveStock({
 *     studioId, type: 'prestamo', quantity: 1,
 *     itemUnitId, loanId, registeredBy: actorId,
 *     reason: `Préstamo #${loanCode}`,
 *   })
 *   // El ledger queda registrado, la unidad pasa a status='prestado',
 *   // y el counter quantity_loaned del item se incrementa (si bulk).
 */

export type MoveStockType =
  | "entrada"
  | "salida"
  | "prestamo"
  | "devolucion_prestamo"
  | "renta"
  | "devolucion_renta"
  | "mantenimiento"
  | "ajuste"
  | "transferencia"
  | "baja"
  | "perdida"
  | "dano"
  | "reparacion"

export type MoveStockInput = {
  studioId: string
  type: MoveStockType
  quantity: number
  itemId?: string | null
  itemUnitId?: string | null
  reason?: string | null
  prevStatus?: string | null
  newStatus?: string | null
  prevLocationId?: string | null
  newLocationId?: string | null
  prevResponsibleId?: string | null
  newResponsibleId?: string | null
  loanId?: string | null
  rentalId?: string | null
  reservationId?: string | null
  maintenanceId?: string | null
  registeredBy?: string | null
}

export type MoveStockResult = {
  movementId: string
  newQuantityTotal: number | null
  newUnitStatus: string | null
}

/**
 * Registra un movimiento atómico al ledger + ajusta el estado del item/unit.
 *
 * Errores:
 *   - INV_MOVE_REQUIRES_ITEM_OR_UNIT — ni itemId ni itemUnitId fueron pasados
 *   - INV_MOVE_QUANTITY_INVALID     — quantity <= 0
 *   - INV_UNIT_NOT_FOUND            — itemUnitId no existe en este studio
 *   - INV_ITEM_NOT_FOUND            — itemId no existe / borrado / fuera de studio
 *   - INV_SERIALIZED_REQUIRES_UNIT  — item kind=serialized pero solo se pasó itemId
 */
export async function moveStock(input: MoveStockInput): Promise<MoveStockResult> {
  if (!input.itemId && !input.itemUnitId) {
    throw new Error("INV_MOVE_REQUIRES_ITEM_OR_UNIT")
  }
  if (input.quantity <= 0) {
    throw new Error("INV_MOVE_QUANTITY_INVALID")
  }

  const sb = untypedService()
  const { data, error } = await sb.rpc("inv_move_stock", {
    p_studio_id: input.studioId,
    p_type: input.type,
    p_quantity: input.quantity,
    p_item_id: input.itemId ?? null,
    p_item_unit_id: input.itemUnitId ?? null,
    p_reason: input.reason ?? null,
    p_prev_status: input.prevStatus ?? null,
    p_new_status: input.newStatus ?? null,
    p_prev_location_id: input.prevLocationId ?? null,
    p_new_location_id: input.newLocationId ?? null,
    p_prev_responsible_id: input.prevResponsibleId ?? null,
    p_new_responsible_id: input.newResponsibleId ?? null,
    p_loan_id: input.loanId ?? null,
    p_rental_id: input.rentalId ?? null,
    p_reservation_id: input.reservationId ?? null,
    p_maintenance_id: input.maintenanceId ?? null,
    p_registered_by: input.registeredBy ?? null,
  })

  if (error) {
    // Errores DGII/dominio: re-lanzar con código limpio
    const msg = error.message ?? ""
    if (msg.includes("INV_MOVE_REQUIRES_ITEM_OR_UNIT")) throw new Error("INV_MOVE_REQUIRES_ITEM_OR_UNIT")
    if (msg.includes("INV_MOVE_QUANTITY_INVALID")) throw new Error("INV_MOVE_QUANTITY_INVALID")
    if (msg.includes("INV_UNIT_NOT_FOUND")) throw new Error("INV_UNIT_NOT_FOUND")
    if (msg.includes("INV_ITEM_NOT_FOUND")) throw new Error("INV_ITEM_NOT_FOUND")
    if (msg.includes("INV_SERIALIZED_REQUIRES_UNIT")) throw new Error("INV_SERIALIZED_REQUIRES_UNIT")
    throwServiceError("INV_MOVE_FAILED", error, {
      studioId: input.studioId,
      type: input.type,
    })
  }

  const result = Array.isArray(data) ? data[0] : data
  return {
    movementId: result?.movement_id ?? "",
    newQuantityTotal: result?.new_quantity_total ?? null,
    newUnitStatus: result?.new_unit_status ?? null,
  }
}

/**
 * Lista los movements del ledger filtrados. Útil para vistas históricas y
 * reportes (estado de un item / unit a lo largo del tiempo).
 */
export async function getStockMovements(
  studioId: string,
  opts: {
    itemId?: string
    itemUnitId?: string
    type?: MoveStockType
    fromDate?: string
    toDate?: string
    page?: number
    pageSize?: number
  } = {},
) {
  const { page = 1, pageSize = 50 } = opts
  const sb = untypedService()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = sb
    .from("inv_stock_movements")
    .select("*", { count: "exact" })
    .eq("studio_id", studioId)
    .order("created_at", { ascending: false })
    .range(from, to)

  if (opts.itemId) query = query.eq("item_id", opts.itemId)
  if (opts.itemUnitId) query = query.eq("item_unit_id", opts.itemUnitId)
  if (opts.type) query = query.eq("type", opts.type)
  if (opts.fromDate) query = query.gte("created_at", opts.fromDate)
  if (opts.toDate) query = query.lte("created_at", opts.toDate)

  const { data, count, error } = await query
  if (error) throwServiceError("INV_STOCK_MOVEMENTS_OP_FAILED", error)

  return {
    items: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize) || 1,
  }
}
