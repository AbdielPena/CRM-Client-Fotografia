import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"
import { moveStock } from "./inv-stock-movement.service"
import { d } from "@/lib/decimal"
import type {
  CreateInvRentalInput,
  RecordRentalPaymentInput,
  ReturnInvRentalInput,
} from "@/lib/validations/inv-rental.schema"

/**
 * Service de alquileres del módulo Inventory.
 *
 * A diferencia de inv-loan (préstamos internos, sin cobro), rentals son
 * alquileres comerciales a `clients` del CRM con:
 *   - subtotal/discount/tax/total + deposit (depósito en garantía)
 *   - paid_amount tracking (con generated column `balance = total - paid_amount`)
 *   - days generated automático desde end_date - start_date
 *   - rental_payments table separada con method enum
 *
 * Flow:
 *   1. createInvRental → loan parent + items + emit 'renta' movements
 *   2. recordRentalPayment → insert inv_rental_payments + opcionalmente
 *      fin_transactions.ingreso si finAccountId
 *   3. returnInvRental → items 'devuelto' + 'devolucion_renta' movements +
 *      recalc rental.status
 */

// ============================================================================
// Tipos
// ============================================================================

export type InvRentalRow = {
  id: string
  studio_id: string
  code: string
  client_id: string
  status:
    | "cotizada"
    | "reservada"
    | "activa"
    | "devuelta"
    | "vencida"
    | "cancelada"
    | "con_deuda"
    | "con_dano"
    | "perdida"
  start_date: string
  end_date: string
  actual_return_date: string | null
  days: number
  subtotal: number | string
  discount: number | string
  tax: number | string
  deposit: number | string
  total: number | string
  paid_amount: number | string
  balance: number | string
  contract_url: string | null
  signature_url: string | null
  notes: string | null
  registered_by: string
  project_id: string | null
  created_at: string
  updated_at: string
}

export type InvRentalItemRow = {
  id: string
  studio_id: string
  rental_id: string
  item_id: string | null
  item_unit_id: string | null
  quantity: number
  price_per_day: number | string
  line_total: number | string
  returned_quantity: number
  status: string
  condition_out: string | null
  condition_in: string | null
  returned_at: string | null
  notes: string | null
}

// ============================================================================
// Helpers
// ============================================================================

function generateRentalCode(): string {
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const rnd = Math.floor(Math.random() * 10000).toString().padStart(4, "0")
  return `RT-${yyyymmdd}-${rnd}`
}

/**
 * Calcula días entre start_date y end_date. Mín 1 día (alquiler de horas
 * cobra día completo). Espeja la lógica de la generated column del schema.
 */
function calcDays(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  return Math.max(1, Math.ceil((end - start) / 86_400_000))
}

// ============================================================================
// Listado + detalle
// ============================================================================

export async function getInvRentals(
  studioId: string,
  opts: {
    status?: InvRentalRow["status"]
    clientId?: string
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
    .from("inv_rentals")
    .select(
      `*,
       client:clients(id, name, email, phone),
       project:projects(id, name)`,
      { count: "exact" },
    )
    .eq("studio_id", studioId)
    .order("start_date", { ascending: false })
    .range(from, to)

  if (opts.status) query = query.eq("status", opts.status)
  if (opts.clientId) query = query.eq("client_id", opts.clientId)
  if (opts.fromDate) query = query.gte("start_date", opts.fromDate)
  if (opts.toDate) query = query.lte("start_date", opts.toDate)

  const { data, count, error } = await query
  if (error) throwServiceError("INV_RENTAL_OP_FAILED", error)

  return {
    items: (data ?? []) as Array<
      InvRentalRow & {
        client?: { id: string; name: string; email: string | null; phone: string | null } | null
        project?: { id: string; name: string } | null
      }
    >,
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize) || 1,
  }
}

export async function getInvRentalById(studioId: string, rentalId: string) {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("inv_rentals")
    .select(
      `*,
       client:clients(id, name, email, phone),
       project:projects(id, name, status),
       items:inv_rental_items(
         *,
         item:inv_items(id, name, kind, brand, model),
         unit:inv_item_units(id, serial_number, internal_code)
       ),
       payments:inv_rental_payments(*)`,
    )
    .eq("id", rentalId)
    .eq("studio_id", studioId)
    .maybeSingle()

  if (error) throwServiceError("INV_RENTAL_OP_FAILED", error)
  return data as
    | (InvRentalRow & {
        client?: unknown
        project?: unknown
        items?: Array<InvRentalItemRow & { item?: unknown; unit?: unknown }>
        payments?: unknown[]
      })
    | null
}

// ============================================================================
// Create rental
// ============================================================================

export async function createInvRental(
  studioId: string,
  actorId: string,
  data: CreateInvRentalInput,
) {
  const sb = untypedService()
  const days = calcDays(data.startDate, data.endDate)

  // Calcular line_totals + subtotal
  const lines = data.items.map((line) => ({
    ...line,
    lineTotal: d(line.pricePerDay).times(line.quantity).times(days),
  }))
  const subtotal = lines.reduce((acc, l) => acc.plus(l.lineTotal), d(0))
  const discountD = d(data.discount ?? 0)
  const taxD = d(data.tax ?? 0)
  const depositD = d(data.deposit ?? 0)
  const total = subtotal.minus(discountD).plus(taxD)

  // 1. Insert parent (retry 3x si code colisión)
  let rentalRow: InvRentalRow | null = null
  for (let attempt = 0; attempt < 3 && !rentalRow; attempt++) {
    const code = generateRentalCode()
    const { data: row, error } = await sb
      .from("inv_rentals")
      .insert({
        studio_id: studioId,
        code,
        client_id: data.clientId,
        status: "activa",
        start_date: data.startDate,
        end_date: data.endDate,
        subtotal: subtotal.toFixed(2),
        discount: discountD.toFixed(2),
        tax: taxD.toFixed(2),
        deposit: depositD.toFixed(2),
        total: total.toFixed(2),
        paid_amount: "0.00",
        contract_url: data.contractUrl ?? null,
        signature_url: data.signatureUrl ?? null,
        notes: data.notes ?? null,
        project_id: data.projectId ?? null,
        registered_by: actorId,
      })
      .select("*")
      .maybeSingle()

    if (error) {
      if (error.code === "23505" && error.message?.includes("code")) continue
      throwServiceError("INV_RENTAL_CREATE_FAILED", error, { studioId })
    }
    rentalRow = row as InvRentalRow
  }

  if (!rentalRow) throw new Error("INV_RENTAL_CODE_GEN_FAILED")

  // 2. Insert items
  const itemsPayload = lines.map((line) => ({
    studio_id: studioId,
    rental_id: rentalRow!.id,
    item_id: line.itemId ?? null,
    item_unit_id: line.itemUnitId ?? null,
    quantity: line.quantity,
    price_per_day: d(line.pricePerDay).toFixed(2),
    line_total: line.lineTotal.toFixed(2),
    notes: line.notes ?? null,
    status: "activa",
  }))

  const { data: insertedItems, error: itemsErr } = await sb
    .from("inv_rental_items")
    .insert(itemsPayload)
    .select("*")

  if (itemsErr) {
    await sb.from("inv_rentals").delete().eq("id", rentalRow.id)
    throwServiceError("INV_RENTAL_ITEMS_CREATE_FAILED", itemsErr, {
      studioId,
      rentalId: rentalRow.id,
    })
  }

  // 3. Emit 'renta' movements
  for (const line of (insertedItems ?? []) as InvRentalItemRow[]) {
    try {
      await moveStock({
        studioId,
        type: "renta",
        quantity: line.quantity,
        itemId: line.item_id,
        itemUnitId: line.item_unit_id,
        rentalId: rentalRow.id,
        registeredBy: actorId,
        reason: `Renta #${rentalRow.code}`,
      })
    } catch (err) {
      console.error("[inv-rental] moveStock falló:", { rentalId: rentalRow.id, line: line.id, err })
    }
  }

  await logActivity({
    studioId,
    actorId,
    entityType: "inv_rental",
    entityId: rentalRow.id,
    action: "inv_rental.created",
    metadata: {
      code: rentalRow.code,
      client_id: data.clientId,
      total: rentalRow.total,
      days,
      project_id: data.projectId,
    },
  })

  return rentalRow
}

// ============================================================================
// Record payment (con opcional integración a Finance)
// ============================================================================

export async function recordRentalPayment(
  studioId: string,
  actorId: string,
  data: RecordRentalPaymentInput,
) {
  const sb = untypedService()

  const { data: rental } = await sb
    .from("inv_rentals")
    .select("id, code, total, paid_amount, status, client_id, project_id")
    .eq("id", data.rentalId)
    .eq("studio_id", studioId)
    .maybeSingle()

  if (!rental) throw new Error("INV_RENTAL_NOT_FOUND")

  // Validar no sobrepago
  const currentPaid = d(rental.paid_amount)
  const newPay = d(data.monto)
  const total = d(rental.total)
  if (currentPaid.plus(newPay).gt(total.plus("0.01"))) {
    throw new Error("INV_RENTAL_PAYMENT_EXCEEDS")
  }

  const paidAt = data.paidAt ?? new Date().toISOString()

  // 1. Insert payment row + opcionalmente vincula fin_transactions
  let finTransactionId: string | null = null
  if (data.finAccountId) {
    // Crear fin_transactions.ingreso atómico (idempotente via external_reference)
    const externalRef = `inv_rental_payment:${rental.id}:${Date.now()}`
    const { data: tx } = await sb
      .from("fin_transactions")
      .insert({
        studio_id: studioId,
        tipo: "ingreso",
        monto: d(data.monto).toFixed(2),
        currency: "DOP", // rental currency TODO (rental no tiene currency column en schema actual)
        descripcion: `Pago renta ${rental.code}`,
        fecha: paidAt.slice(0, 10),
        cuenta_id: data.finAccountId,
        client_id: rental.client_id,
        external_reference: externalRef,
        tipo_ingreso: "cliente",
        estado: "activo",
        is_business: true,
        notas: data.notes,
      })
      .select("id")
      .single()
    finTransactionId = (tx as { id: string } | null)?.id ?? null
  }

  const { error: payErr } = await sb.from("inv_rental_payments").insert({
    studio_id: studioId,
    rental_id: data.rentalId,
    amount: d(data.monto).toFixed(2),
    method: data.method,
    reference: data.reference ?? null,
    paid_at: paidAt,
    notes: data.notes ?? null,
    registered_by: actorId,
    fin_transaction_id: finTransactionId,
  })

  if (payErr)
    throwServiceError("INV_RENTAL_PAYMENT_INSERT_FAILED", payErr, {
      studioId,
      rentalId: data.rentalId,
    })

  // 2. Update rental paid_amount
  const newTotalPaid = currentPaid.plus(newPay)
  const newStatus =
    newTotalPaid.gte(total) && rental.status === "activa"
      ? "activa" // se mantiene activa hasta que se devuelva. Status no cambia por pago solo.
      : rental.status

  const { error: rentalUpdateErr } = await sb
    .from("inv_rentals")
    .update({
      paid_amount: newTotalPaid.toFixed(2),
      status: newStatus,
    })
    .eq("id", data.rentalId)
    .eq("studio_id", studioId)

  if (rentalUpdateErr)
    throwServiceError("INV_RENTAL_UPDATE_FAILED", rentalUpdateErr, {
      studioId,
      rentalId: data.rentalId,
    })

  await logActivity({
    studioId,
    actorId,
    entityType: "inv_rental",
    entityId: data.rentalId,
    action: "inv_rental.payment_recorded",
    metadata: {
      monto: d(data.monto).toFixed(2),
      method: data.method,
      fin_transaction_id: finTransactionId,
      acumulado: newTotalPaid.toFixed(2),
    },
  })

  return { paidAmount: newTotalPaid.toFixed(2), finTransactionId }
}

// ============================================================================
// Return rental
// ============================================================================

export async function returnInvRental(
  studioId: string,
  actorId: string,
  data: ReturnInvRentalInput,
) {
  const sb = untypedService()
  const returnedAt = data.actualReturnDate ?? new Date().toISOString()

  const { data: rental } = await sb
    .from("inv_rentals")
    .select("id, code, status")
    .eq("id", data.rentalId)
    .eq("studio_id", studioId)
    .maybeSingle()

  if (!rental) throw new Error("INV_RENTAL_NOT_FOUND")
  if (rental.status === "devuelta") throw new Error("INV_RENTAL_ALREADY_RETURNED")

  // Cargar líneas
  const lineIds = data.items.map((i) => i.rentalItemId)
  const { data: lineRows } = await sb
    .from("inv_rental_items")
    .select("*")
    .in("id", lineIds)
    .eq("rental_id", data.rentalId)
    .eq("studio_id", studioId)

  const linesById = new Map<string, InvRentalItemRow>()
  for (const r of (lineRows ?? []) as InvRentalItemRow[]) linesById.set(r.id, r)

  for (const input of data.items) {
    const line = linesById.get(input.rentalItemId)
    if (!line) throw new Error("INV_RENTAL_LINE_NOT_FOUND")

    const newReturned = line.returned_quantity + input.returnedQuantity
    if (newReturned > line.quantity) {
      throw new Error("INV_RENTAL_RETURN_EXCEEDS_QUANTITY")
    }
    const lineStatus = newReturned >= line.quantity ? "devuelta" : "activa"

    const { error: updateErr } = await sb
      .from("inv_rental_items")
      .update({
        returned_quantity: newReturned,
        returned_at: lineStatus === "devuelta" ? returnedAt : line.returned_at,
        condition_in: input.conditionIn ?? line.condition_in,
        notes: input.notes ?? line.notes,
        status: lineStatus,
      })
      .eq("id", input.rentalItemId)

    if (updateErr) throwServiceError("INV_RENTAL_LINE_UPDATE_FAILED", updateErr)

    try {
      await moveStock({
        studioId,
        type: "devolucion_renta",
        quantity: input.returnedQuantity,
        itemId: line.item_id,
        itemUnitId: line.item_unit_id,
        rentalId: data.rentalId,
        registeredBy: actorId,
        reason: `Devolución renta #${rental.code}`,
      })
    } catch (err) {
      console.error("[inv-rental] devolucion moveStock falló:", err)
    }
  }

  // Recalcular status del rental
  const { data: allLines } = await sb
    .from("inv_rental_items")
    .select("status")
    .eq("rental_id", data.rentalId)
    .eq("studio_id", studioId)

  const allReturned = ((allLines ?? []) as Array<{ status: string }>).every(
    (l) => l.status === "devuelta",
  )

  if (allReturned) {
    await sb
      .from("inv_rentals")
      .update({
        status: "devuelta",
        actual_return_date: returnedAt,
        notes: data.notes ?? undefined,
      })
      .eq("id", data.rentalId)
      .eq("studio_id", studioId)
  }

  await logActivity({
    studioId,
    actorId,
    entityType: "inv_rental",
    entityId: data.rentalId,
    action: allReturned ? "inv_rental.returned" : "inv_rental.partial_return",
    metadata: { lines_returned: data.items.length },
  })

  return {
    rentalId: data.rentalId,
    fullyReturned: allReturned,
    returnedAt,
  }
}
