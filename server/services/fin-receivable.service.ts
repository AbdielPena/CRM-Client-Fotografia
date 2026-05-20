import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"
import { d } from "@/lib/decimal"
import { createFinTransaction } from "./fin-transaction.service"
import type {
  CreateFinReceivableInput,
  RecordReceivablePaymentInput,
} from "@/lib/validations/fin-receivable.schema"

/**
 * Service de Cuentas por Cobrar (CxC) — fin_receivables.
 *
 * Casos de uso:
 *   - Registrar cobro pendiente de un cliente (puede o no estar vinculado al CRM)
 *   - Vincular el receivable a una invoice del CRM (FK opcional)
 *   - Recibir un pago: incrementa monto_cobrado + (opcionalmente) crea
 *     fin_transactions.income atómico que actualiza balance de la cuenta
 *   - Marcar como cobrada cuando monto_cobrado >= monto
 *   - Detectar vencidas: fecha_venc < hoy y estado='pendiente'
 *
 * Estados:
 *   pendiente → parcial → cobrada (happy path)
 *   pendiente → vencida (auto, cron sets if past due) → parcial → cobrada
 *   cualquiera → cancelada
 */

// ============================================================================
// Tipos
// ============================================================================

export type FinReceivableRow = {
  id: string
  studio_id: string
  client_id: string | null
  cliente: string
  invoice_id: string | null
  monto: number | string
  currency: string
  fecha_emision: string | null
  fecha_venc: string | null
  estado: "pendiente" | "parcial" | "cobrada" | "cancelada" | "vencida"
  monto_cobrado: number | string
  notas: string | null
  metadata: unknown
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// ============================================================================
// Listado + detalle
// ============================================================================

export async function getFinReceivables(
  studioId: string,
  opts: {
    estado?: FinReceivableRow["estado"]
    clientId?: string
    overdueOnly?: boolean
    search?: string
    page?: number
    pageSize?: number
  } = {},
) {
  const { page = 1, pageSize = 50 } = opts
  const sb = untypedServer()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = sb
    .from("fin_receivables")
    .select(
      `*,
       client:clients(id, name, email),
       invoice:invoices(id, invoice_number, ncf, total)`,
      { count: "exact" },
    )
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("fecha_venc", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to)

  if (opts.estado) query = query.eq("estado", opts.estado)
  if (opts.clientId) query = query.eq("client_id", opts.clientId)
  if (opts.overdueOnly) {
    const today = new Date().toISOString().slice(0, 10)
    query = query
      .in("estado", ["pendiente", "parcial", "vencida"])
      .lt("fecha_venc", today)
  }
  if (opts.search && opts.search.trim()) {
    const term = `%${opts.search.trim()}%`
    query = query.or(`cliente.ilike.${term},notas.ilike.${term}`)
  }

  const { data, count, error } = await query
  if (error) throwServiceError("FIN_RECV_OP_FAILED", error)

  return {
    items: (data ?? []) as Array<
      FinReceivableRow & {
        client?: { id: string; name: string; email: string | null } | null
        invoice?: { id: string; invoice_number: string; ncf: string | null; total: number } | null
      }
    >,
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize) || 1,
  }
}

export async function getFinReceivableById(studioId: string, receivableId: string) {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("fin_receivables")
    .select(
      `*,
       client:clients(id, name, email, phone),
       invoice:invoices(id, invoice_number, ncf, total, status)`,
    )
    .eq("id", receivableId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()

  if (error) throwServiceError("FIN_RECV_OP_FAILED", error)
  return data as
    | (FinReceivableRow & {
        client?: { id: string; name: string; email: string | null; phone: string | null } | null
        invoice?: unknown
      })
    | null
}

// ============================================================================
// CRUD
// ============================================================================

export async function createFinReceivable(
  studioId: string,
  actorId: string,
  data: CreateFinReceivableInput,
) {
  const sb = untypedService()

  const payload = {
    studio_id: studioId,
    client_id: data.clientId ?? null,
    cliente: data.cliente,
    invoice_id: data.invoiceId ?? null,
    monto: d(data.monto).toFixed(2),
    currency: data.currency ?? "DOP",
    fecha_emision: data.fechaEmision ?? null,
    fecha_venc: data.fechaVenc ?? null,
    notas: data.notas ?? null,
    estado: "pendiente",
    monto_cobrado: "0.00",
  }

  const { data: row, error } = await sb
    .from("fin_receivables")
    .insert(payload)
    .select("*")
    .single()

  if (error)
    throwServiceError("FIN_RECV_CREATE_FAILED", error, { studioId })

  const recv = row as FinReceivableRow
  await logActivity({
    studioId,
    actorId,
    entityType: "fin_receivable",
    entityId: recv.id,
    action: "fin_receivable.created",
    metadata: {
      cliente: recv.cliente,
      monto: recv.monto,
      currency: recv.currency,
      invoice_id: recv.invoice_id,
    },
  })

  return recv
}

/**
 * Registra un pago contra el receivable.
 *
 * Flow:
 *   1. Load receivable + verify estado válido (no cobrada/cancelada)
 *   2. Valida: monto + monto_cobrado <= monto total (no sobrepagar)
 *   3. Si cuentaId: crea fin_transactions.ingreso atómico (vincula balance)
 *      con external_reference='receivable:<id>:<timestamp>' para dedup
 *   4. Update receivable.monto_cobrado += monto
 *   5. Recalcula estado: cobrada si == monto, parcial si < monto
 *   6. activity_log "fin_receivable.payment_recorded"
 */
export async function recordReceivablePayment(
  studioId: string,
  actorId: string,
  data: RecordReceivablePaymentInput,
): Promise<{
  receivable: FinReceivableRow
  transactionId: string | null
}> {
  const sb = untypedService()

  // 1. Load + validate
  const { data: existing } = await sb
    .from("fin_receivables")
    .select("*")
    .eq("id", data.receivableId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()

  if (!existing) throw new Error("FIN_RECV_NOT_FOUND")
  const recv = existing as FinReceivableRow

  if (recv.estado === "cobrada") throw new Error("FIN_RECV_ALREADY_PAID")
  if (recv.estado === "cancelada") throw new Error("FIN_RECV_CANCELLED")

  // 2. Verifica que no exceda
  const previousPaid = d(recv.monto_cobrado)
  const newPayment = d(data.monto)
  const newTotal = previousPaid.plus(newPayment)
  const totalDebt = d(recv.monto)
  if (newTotal.gt(totalDebt.plus("0.01"))) {
    throw new Error("FIN_RECV_PAYMENT_EXCEEDS")
  }

  // 3. Si tiene cuentaId, crea transaction (mueve dinero a esa cuenta)
  let transactionId: string | null = null
  if (data.cuentaId) {
    const tx = await createFinTransaction(studioId, actorId, {
      tipo: "ingreso",
      monto: data.monto,
      currency: recv.currency,
      descripcion: `Pago CxC ${recv.cliente} ${recv.invoice_id ? "(invoice)" : ""}`.trim(),
      fecha: data.fecha,
      cuentaId: data.cuentaId,
      clientId: recv.client_id ?? undefined,
      invoiceId: recv.invoice_id ?? undefined,
      externalReference: `receivable:${recv.id}:${Date.now()}`,
      tipoIngreso: "cliente",
      aplicaDiezmo: false,
      isBusiness: true,
      notas: data.notas,
    })
    transactionId = tx.id
  }

  // 4. Update receivable
  const newEstado: FinReceivableRow["estado"] = newTotal.gte(totalDebt)
    ? "cobrada"
    : "parcial"

  const { data: updated, error: updateErr } = await sb
    .from("fin_receivables")
    .update({
      monto_cobrado: newTotal.toFixed(2),
      estado: newEstado,
    })
    .eq("id", recv.id)
    .eq("studio_id", studioId)
    .select("*")
    .single()

  if (updateErr)
    throwServiceError("FIN_RECV_UPDATE_FAILED", updateErr, { studioId })

  await logActivity({
    studioId,
    actorId,
    entityType: "fin_receivable",
    entityId: recv.id,
    action: "fin_receivable.payment_recorded",
    metadata: {
      monto_pago: data.monto,
      monto_cobrado_acumulado: newTotal.toFixed(2),
      estado_resultante: newEstado,
      transaction_id: transactionId,
    },
  })

  return { receivable: updated as FinReceivableRow, transactionId }
}

/**
 * Cancela un receivable (marca como cancelada). No crea reversal de
 * transactions previas — el user debe anular esas manualmente si applies.
 */
export async function cancelFinReceivable(
  studioId: string,
  actorId: string,
  receivableId: string,
  reason?: string | null,
) {
  const sb = untypedService()
  const { error } = await sb
    .from("fin_receivables")
    .update({ estado: "cancelada" })
    .eq("id", receivableId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)

  if (error)
    throwServiceError("FIN_RECV_CANCEL_FAILED", error, {
      studioId,
      receivableId,
    })

  await logActivity({
    studioId,
    actorId,
    entityType: "fin_receivable",
    entityId: receivableId,
    action: "fin_receivable.cancelled",
    metadata: reason ? { reason } : undefined,
  })
}

/**
 * Soft delete (mover a papelera).
 */
export async function deleteFinReceivable(
  studioId: string,
  actorId: string,
  receivableId: string,
) {
  const sb = untypedService()
  const { error } = await sb
    .from("fin_receivables")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", receivableId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)

  if (error)
    throwServiceError("FIN_RECV_DELETE_FAILED", error, {
      studioId,
      receivableId,
    })

  await logActivity({
    studioId,
    actorId,
    entityType: "fin_receivable",
    entityId: receivableId,
    action: "fin_receivable.deleted",
  })
}
