import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"

/**
 * Service de reservas del módulo Inventory.
 *
 * Una reserva apartá items para un cliente/responsable por un periodo
 * sin tomarlos físicamente. Cuando llega la fecha, se convierte en
 * loan (interno) o rental (comercial).
 *
 * Las reservas NO emiten stock_movements — no cambian el estado físico.
 * Solo "reservan" en lógica de negocio (UI debería mostrar como ocupado).
 *
 * Estados:
 *   pendiente → confirmada → convertida_prestamo / convertida_renta
 *   pendiente → vencida (cron) si expires_at < hoy
 *   cualquiera → cancelada
 */

export type InvReservationRow = {
  id: string
  studio_id: string
  code: string
  client_id: string | null
  responsible_id: string | null
  status:
    | "pendiente"
    | "confirmada"
    | "cancelada"
    | "convertida_prestamo"
    | "convertida_renta"
    | "vencida"
  start_date: string
  end_date: string
  reason: string | null
  expires_at: string | null
  converted_to_loan_id: string | null
  converted_to_rental_id: string | null
  registered_by: string
  created_at: string
  updated_at: string
}

function generateReservationCode(): string {
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const rnd = Math.floor(Math.random() * 10000).toString().padStart(4, "0")
  return `RV-${yyyymmdd}-${rnd}`
}

export async function getInvReservations(
  studioId: string,
  opts: {
    status?: InvReservationRow["status"]
    fromDate?: string
    toDate?: string
    page?: number
    pageSize?: number
  } = {},
) {
  const { page = 1, pageSize = 50 } = opts
  const sb = untypedServer()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = sb
    .from("inv_reservations")
    .select(
      `*,
       client:clients(id, name),
       responsible:inv_internal_responsibles(id, full_name)`,
      { count: "exact" },
    )
    .eq("studio_id", studioId)
    .order("start_date", { ascending: false })
    .range(from, to)

  if (opts.status) query = query.eq("status", opts.status)
  if (opts.fromDate) query = query.gte("start_date", opts.fromDate)
  if (opts.toDate) query = query.lte("start_date", opts.toDate)

  const { data, count, error } = await query
  if (error) throwServiceError("INV_RESERVATION_OP_FAILED", error)

  return {
    items: (data ?? []) as Array<
      InvReservationRow & {
        client?: { id: string; name: string } | null
        responsible?: { id: string; full_name: string } | null
      }
    >,
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize) || 1,
  }
}

export async function createInvReservation(
  studioId: string,
  actorId: string,
  data: {
    clientId?: string | null
    responsibleId?: string | null
    startDate: string
    endDate: string
    reason?: string | null
    expiresAt?: string | null
    items: Array<{ itemId?: string; itemUnitId?: string; quantity: number }>
  },
) {
  const sb = untypedService()

  if (!data.clientId && !data.responsibleId) {
    throw new Error("INV_RESERVATION_REQUIRES_CLIENT_OR_RESPONSIBLE")
  }
  if (data.items.length === 0) {
    throw new Error("INV_RESERVATION_REQUIRES_ITEMS")
  }
  if (new Date(data.endDate) <= new Date(data.startDate)) {
    throw new Error("INV_RESERVATION_END_BEFORE_START")
  }

  // Insert parent con retry x3 si code collision
  let row: InvReservationRow | null = null
  for (let i = 0; i < 3 && !row; i++) {
    const code = generateReservationCode()
    const { data: r, error } = await sb
      .from("inv_reservations")
      .insert({
        studio_id: studioId,
        code,
        client_id: data.clientId ?? null,
        responsible_id: data.responsibleId ?? null,
        status: "pendiente",
        start_date: data.startDate,
        end_date: data.endDate,
        reason: data.reason ?? null,
        expires_at: data.expiresAt ?? null,
        registered_by: actorId,
      })
      .select("*")
      .maybeSingle()

    if (error) {
      if (error.code === "23505" && error.message?.includes("code")) continue
      throwServiceError("INV_RESERVATION_CREATE_FAILED", error, { studioId })
    }
    row = r as InvReservationRow
  }
  if (!row) throw new Error("INV_RESERVATION_CODE_GEN_FAILED")

  // Insert items
  const itemsPayload = data.items.map((line) => ({
    studio_id: studioId,
    reservation_id: row!.id,
    item_id: line.itemId ?? null,
    item_unit_id: line.itemUnitId ?? null,
    quantity: line.quantity,
  }))
  const { error: itemsErr } = await sb
    .from("inv_reservation_items")
    .insert(itemsPayload)

  if (itemsErr) {
    await sb.from("inv_reservations").delete().eq("id", row.id)
    throwServiceError("INV_RESERVATION_ITEMS_FAILED", itemsErr, { studioId })
  }

  await logActivity({
    studioId,
    actorId,
    entityType: "inv_reservation",
    entityId: row.id,
    action: "inv_reservation.created",
    metadata: {
      code: row.code,
      client_id: data.clientId,
      items_count: data.items.length,
    },
  })

  return row
}

export async function confirmInvReservation(
  studioId: string,
  actorId: string,
  reservationId: string,
) {
  const sb = untypedService()
  const { error } = await sb
    .from("inv_reservations")
    .update({ status: "confirmada" })
    .eq("id", reservationId)
    .eq("studio_id", studioId)
    .eq("status", "pendiente")

  if (error)
    throwServiceError("INV_RESERVATION_CONFIRM_FAILED", error, {
      studioId,
      reservationId,
    })

  await logActivity({
    studioId,
    actorId,
    entityType: "inv_reservation",
    entityId: reservationId,
    action: "inv_reservation.confirmed",
  })
}

export async function cancelInvReservation(
  studioId: string,
  actorId: string,
  reservationId: string,
  reason?: string,
) {
  const sb = untypedService()
  const { error } = await sb
    .from("inv_reservations")
    .update({ status: "cancelada" })
    .eq("id", reservationId)
    .eq("studio_id", studioId)
    .in("status", ["pendiente", "confirmada"])

  if (error)
    throwServiceError("INV_RESERVATION_CANCEL_FAILED", error, {
      studioId,
      reservationId,
    })

  await logActivity({
    studioId,
    actorId,
    entityType: "inv_reservation",
    entityId: reservationId,
    action: "inv_reservation.cancelled",
    metadata: reason ? { reason } : undefined,
  })
}

/**
 * Marca la reservación como convertida a un loan o rental específico.
 * El servicio que CREA el loan/rental debe llamar este después de éxito.
 */
export async function markReservationConverted(
  studioId: string,
  actorId: string,
  reservationId: string,
  conversion: { loanId?: string; rentalId?: string },
) {
  if (!conversion.loanId && !conversion.rentalId) {
    throw new Error("INV_RESERVATION_CONVERSION_TARGET_REQUIRED")
  }

  const sb = untypedService()
  const { error } = await sb
    .from("inv_reservations")
    .update({
      status: conversion.loanId ? "convertida_prestamo" : "convertida_renta",
      converted_to_loan_id: conversion.loanId ?? null,
      converted_to_rental_id: conversion.rentalId ?? null,
    })
    .eq("id", reservationId)
    .eq("studio_id", studioId)

  if (error)
    throwServiceError("INV_RESERVATION_CONVERT_FAILED", error, {
      studioId,
      reservationId,
    })

  await logActivity({
    studioId,
    actorId,
    entityType: "inv_reservation",
    entityId: reservationId,
    action: "inv_reservation.converted",
    metadata: conversion,
  })
}
