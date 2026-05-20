import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"
import { moveStock } from "./inv-stock-movement.service"
import type {
  CreateInvLoanInput,
  ReturnInvLoanInput,
} from "@/lib/validations/inv-loan.schema"

/**
 * Service de préstamos internos del módulo Inventory.
 *
 * Flow:
 *   - createInvLoan: crea inv_loans + inv_loan_items + emite movements
 *     'prestamo' por cada línea (atómicamente via moveStock RPC)
 *   - returnInvLoan: marca líneas devueltas, emite movements
 *     'devolucion_prestamo', recalcula status del loan (devuelto/parcial)
 *   - getInvLoans: lista filtrable por status, responsible, fecha
 *   - getInvLoanById: detalle con items + responsible + booking/project
 *
 * Correlación cross-módulo:
 *   Loan puede asociar bookingId / projectId del CRM. Esto permite tracking:
 *   "qué equipos están reservados para el booking del cliente X".
 *
 * NOTA sobre atomicidad: cada línea del loan emite un movement separado vía
 * moveStock. Si una línea falla a la mitad, el loan queda parcialmente creado.
 * Para producción real esto debería estar dentro de UNA transacción Postgres
 * (RPC que tome el loan completo). Por ahora aceptamos el riesgo en F3 inicial
 * — F3 final lo migrará a una stored function `create_inv_loan_with_items`.
 */

// ============================================================================
// Tipos
// ============================================================================

export type InvLoanRow = {
  id: string
  studio_id: string
  code: string
  responsible_id: string
  status: "activo" | "devuelto" | "parcial" | "vencido" | "perdido" | "danado"
  start_date: string
  expected_return_date: string
  actual_return_date: string | null
  notes: string | null
  signature_url: string | null
  registered_by: string
  booking_id: string | null
  project_id: string | null
  created_at: string
  updated_at: string
}

export type InvLoanItemRow = {
  id: string
  studio_id: string
  loan_id: string
  item_id: string | null
  item_unit_id: string | null
  quantity: number
  returned_quantity: number
  status: "activo" | "devuelto" | "parcial" | "vencido" | "perdido" | "danado"
  condition_out: string | null
  condition_in: string | null
  returned_at: string | null
  notes: string | null
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Genera un code legible para el loan: PR-YYYYMMDD-XXXX donde XXXX es random.
 * Único por (studio, code) — el UNIQUE constraint lo refuerza, retry si colisión.
 */
function generateLoanCode(): string {
  const now = new Date()
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "")
  const rnd = Math.floor(Math.random() * 10000).toString().padStart(4, "0")
  return `PR-${yyyymmdd}-${rnd}`
}

// ============================================================================
// Listado + detalle
// ============================================================================

export async function getInvLoans(
  studioId: string,
  opts: {
    status?: InvLoanRow["status"]
    responsibleId?: string
    bookingId?: string
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
    .from("inv_loans")
    .select(
      `*,
       responsible:inv_internal_responsibles(id, full_name, department),
       booking:bookings(id, event_date, event_type),
       project:projects(id, name)`,
      { count: "exact" },
    )
    .eq("studio_id", studioId)
    .order("start_date", { ascending: false })
    .range(from, to)

  if (opts.status) query = query.eq("status", opts.status)
  if (opts.responsibleId) query = query.eq("responsible_id", opts.responsibleId)
  if (opts.bookingId) query = query.eq("booking_id", opts.bookingId)
  if (opts.fromDate) query = query.gte("start_date", opts.fromDate)
  if (opts.toDate) query = query.lte("start_date", opts.toDate)

  const { data, count, error } = await query
  if (error) throwServiceError("INV_LOAN_OP_FAILED", error)

  return {
    items: (data ?? []) as Array<
      InvLoanRow & {
        responsible?: { id: string; full_name: string; department: string | null } | null
        booking?: { id: string; event_date: string; event_type: string } | null
        project?: { id: string; name: string } | null
      }
    >,
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize) || 1,
  }
}

export async function getInvLoanById(studioId: string, loanId: string) {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("inv_loans")
    .select(
      `*,
       responsible:inv_internal_responsibles(id, full_name, department, email, phone),
       booking:bookings(id, event_date, event_type, status),
       project:projects(id, name, status),
       items:inv_loan_items(
         *,
         item:inv_items(id, name, kind, brand, model),
         unit:inv_item_units(id, serial_number, internal_code)
       )`,
    )
    .eq("id", loanId)
    .eq("studio_id", studioId)
    .maybeSingle()

  if (error) throwServiceError("INV_LOAN_OP_FAILED", error)
  return data as
    | (InvLoanRow & {
        responsible?: unknown
        booking?: unknown
        project?: unknown
        items?: Array<InvLoanItemRow & { item?: unknown; unit?: unknown }>
      })
    | null
}

// ============================================================================
// Crear loan + emit stock movements
// ============================================================================

export async function createInvLoan(
  studioId: string,
  actorId: string,
  data: CreateInvLoanInput,
) {
  const sb = untypedService()

  // 1. Insertar el loan parent. Reintentamos hasta 3 veces si el `code`
  //    aleatorio colisiona con UNIQUE (studio_id, code).
  let loanRow: InvLoanRow | null = null
  let attempts = 0
  while (!loanRow && attempts < 3) {
    attempts++
    const code = generateLoanCode()
    const { data: row, error } = await sb
      .from("inv_loans")
      .insert({
        studio_id: studioId,
        code,
        responsible_id: data.responsibleId,
        status: "activo",
        start_date: data.startDate,
        expected_return_date: data.expectedReturnDate,
        notes: data.notes ?? null,
        signature_url: data.signatureUrl ?? null,
        booking_id: data.bookingId ?? null,
        project_id: data.projectId ?? null,
        registered_by: actorId,
      })
      .select("*")
      .maybeSingle()

    if (error) {
      // 23505 = unique violation. Si es por code, retry. Si por otra cosa, throw.
      if (error.code === "23505" && error.message?.includes("code")) {
        continue
      }
      throwServiceError("INV_LOAN_CREATE_FAILED", error, { studioId })
    }
    loanRow = row as InvLoanRow
  }

  if (!loanRow) {
    throw new Error("INV_LOAN_CODE_GENERATION_FAILED")
  }

  // 2. Insertar las líneas
  const itemsPayload = data.items.map((line) => ({
    studio_id: studioId,
    loan_id: loanRow!.id,
    item_id: line.itemId ?? null,
    item_unit_id: line.itemUnitId ?? null,
    quantity: line.quantity,
    condition_out: line.conditionOut ?? null,
    notes: line.notes ?? null,
    status: "activo",
  }))

  const { data: insertedItems, error: itemsErr } = await sb
    .from("inv_loan_items")
    .insert(itemsPayload)
    .select("*")

  if (itemsErr) {
    // Rollback manual: eliminar el loan parent
    await sb.from("inv_loans").delete().eq("id", loanRow.id).eq("studio_id", studioId)
    throwServiceError("INV_LOAN_ITEMS_CREATE_FAILED", itemsErr, {
      studioId,
      loanId: loanRow.id,
    })
  }

  // 3. Emitir 1 movement por cada línea (atómico via moveStock RPC)
  //    Si alguna falla, el loan queda creado pero con líneas sin movement.
  //    En F3 final esto debe envolverse en una stored function.
  const lines = (insertedItems ?? []) as Array<InvLoanItemRow & { item_id: string | null; item_unit_id: string | null }>
  for (const line of lines) {
    try {
      await moveStock({
        studioId,
        type: "prestamo",
        quantity: line.quantity,
        itemId: line.item_id,
        itemUnitId: line.item_unit_id,
        loanId: loanRow.id,
        registeredBy: actorId,
        reason: `Préstamo #${loanRow.code}`,
        newResponsibleId: data.responsibleId,
      })
    } catch (err) {
      console.error("[inv-loan] moveStock falló en createInvLoan, línea queda inconsistente:", {
        loanId: loanRow.id,
        line: line.id,
        err,
      })
      // No re-throw: el loan queda creado con esa línea sin movement. F3 final lo arregla.
    }
  }

  await logActivity({
    studioId,
    actorId,
    entityType: "inv_loan",
    entityId: loanRow.id,
    action: "inv_loan.created",
    metadata: {
      code: loanRow.code,
      responsible_id: data.responsibleId,
      item_count: data.items.length,
      booking_id: data.bookingId,
    },
  })

  return loanRow
}

// ============================================================================
// Return: devolver items de un loan
// ============================================================================

export async function returnInvLoan(
  studioId: string,
  actorId: string,
  data: ReturnInvLoanInput,
) {
  const sb = untypedService()
  const returnedAt = data.actualReturnDate ?? new Date().toISOString()

  // 1. Validar que el loan existe en el studio
  const { data: loan } = await sb
    .from("inv_loans")
    .select("id, studio_id, code, status")
    .eq("id", data.loanId)
    .eq("studio_id", studioId)
    .maybeSingle()

  if (!loan) throw new Error("INV_LOAN_NOT_FOUND")
  if (loan.status === "devuelto") throw new Error("INV_LOAN_ALREADY_RETURNED")

  // 2. Cargar las líneas que se van a devolver
  const itemIds = data.items.map((i) => i.loanItemId)
  const { data: lineRows } = await sb
    .from("inv_loan_items")
    .select("*")
    .in("id", itemIds)
    .eq("loan_id", data.loanId)
    .eq("studio_id", studioId)

  const linesById = new Map<string, InvLoanItemRow>()
  for (const r of (lineRows ?? []) as InvLoanItemRow[]) linesById.set(r.id, r)

  // 3. Procesar cada línea
  for (const input of data.items) {
    const line = linesById.get(input.loanItemId)
    if (!line) throw new Error("INV_LOAN_ITEM_NOT_FOUND")

    const newReturned = line.returned_quantity + input.returnedQuantity
    if (newReturned > line.quantity) {
      throw new Error("INV_LOAN_RETURN_EXCEEDS_QUANTITY")
    }
    const lineStatus: InvLoanItemRow["status"] =
      newReturned >= line.quantity ? "devuelto" : "parcial"

    const { error: updateErr } = await sb
      .from("inv_loan_items")
      .update({
        returned_quantity: newReturned,
        returned_at: lineStatus === "devuelto" ? returnedAt : line.returned_at,
        condition_in: input.conditionIn ?? line.condition_in,
        notes: input.notes ?? line.notes,
        status: lineStatus,
      })
      .eq("id", input.loanItemId)

    if (updateErr) throwServiceError("INV_LOAN_LINE_UPDATE_FAILED", updateErr)

    // Emit movement 'devolucion_prestamo'
    try {
      await moveStock({
        studioId,
        type: "devolucion_prestamo",
        quantity: input.returnedQuantity,
        itemId: line.item_id,
        itemUnitId: line.item_unit_id,
        loanId: data.loanId,
        registeredBy: actorId,
        reason: `Devolución de préstamo #${loan.code}`,
      })
    } catch (err) {
      console.error("[inv-loan] moveStock devolucion falló:", { loanId: data.loanId, err })
    }
  }

  // 4. Recalcular status del loan
  const { data: allLines } = await sb
    .from("inv_loan_items")
    .select("status")
    .eq("loan_id", data.loanId)
    .eq("studio_id", studioId)

  const allReturned = ((allLines ?? []) as Array<{ status: string }>).every(
    (l) => l.status === "devuelto",
  )
  const newLoanStatus = allReturned ? "devuelto" : "parcial"

  const { error: loanUpdateErr } = await sb
    .from("inv_loans")
    .update({
      status: newLoanStatus,
      actual_return_date: allReturned ? returnedAt : null,
      notes: data.notes ?? undefined,
    })
    .eq("id", data.loanId)
    .eq("studio_id", studioId)

  if (loanUpdateErr) throwServiceError("INV_LOAN_UPDATE_FAILED", loanUpdateErr)

  await logActivity({
    studioId,
    actorId,
    entityType: "inv_loan",
    entityId: data.loanId,
    action: allReturned ? "inv_loan.returned" : "inv_loan.partial_return",
    metadata: { item_count: data.items.length },
  })

  return { loanId: data.loanId, status: newLoanStatus, returnedAt }
}
