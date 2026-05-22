import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"
import { d } from "@/lib/decimal"
import { createFinTransaction } from "./fin-transaction.service"
import type {
  CreateFinDebtInput,
  RecordDebtPaymentInput,
} from "@/lib/validations/fin-debt.schema"

/**
 * Service de Deudas (CxP a largo plazo con cuotas).
 *
 * Diferencia con fin_payables: payables es CxP transaccional (factura a pagar);
 * fin_debts es deuda estructurada (préstamo bancario, financiamiento, plan de pago).
 *
 * Tracking:
 *   - monto_original: total inicial
 *   - saldo_pendiente: lo que aún se debe
 *   - cuotas_total / cuotas_pagadas: para préstamos en cuotas fijas
 *   - tasa_interes: % anual (informativo, no afecta cómputo)
 *   - fecha_proximo_pago: para alertas/recordatorios
 *
 * Cada debt_payment baja el saldo_pendiente. Si saldo_pendiente == 0 → estado='pagada'.
 */

export type FinDebtRow = {
  id: string
  studio_id: string
  acreedor: string
  monto_original: number | string
  saldo_pendiente: number | string
  cuotas_total: number | null
  cuotas_pagadas: number
  monto_cuota: number | string | null
  tasa_interes: number | string | null
  currency: string
  fecha_inicio: string | null
  fecha_proximo_pago: string | null
  estado: "activa" | "pagada" | "reestructurada" | "cancelada"
  metadata: unknown
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export async function getFinDebts(
  studioId: string,
  opts: {
    estado?: FinDebtRow["estado"]
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
    .from("fin_debts")
    .select("*", { count: "exact" })
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("fecha_proximo_pago", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to)

  if (opts.estado) query = query.eq("estado", opts.estado)
  if (opts.search && opts.search.trim()) {
    const term = `%${opts.search.trim()}%`
    query = query.ilike("acreedor", term)
  }

  const { data, count, error } = await query
  if (error) throwServiceError("FIN_DEBT_OP_FAILED", error)

  return {
    items: (data ?? []) as FinDebtRow[],
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize) || 1,
  }
}

export async function getFinDebtById(studioId: string, debtId: string) {
  const sb = untypedServer()
  const { data: debt, error } = await sb
    .from("fin_debts")
    .select("*")
    .eq("id", debtId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()

  if (error) throwServiceError("FIN_DEBT_OP_FAILED", error)
  if (!debt) return null

  const { data: payments } = await sb
    .from("fin_debt_payments")
    .select("*")
    .eq("debt_id", debtId)
    .eq("studio_id", studioId)
    .order("fecha", { ascending: false })

  return { ...(debt as FinDebtRow), payments: (payments ?? []) as unknown[] }
}

export async function createFinDebt(
  studioId: string,
  actorId: string,
  data: CreateFinDebtInput,
) {
  const sb = untypedService()
  const monto = d(data.montoOriginal).toFixed(2)
  const payload = {
    studio_id: studioId,
    acreedor: data.acreedor,
    monto_original: monto,
    saldo_pendiente: monto, // empieza igual al original
    cuotas_total: data.cuotasTotal ?? null,
    cuotas_pagadas: 0,
    monto_cuota: data.montoCuota != null ? d(data.montoCuota).toFixed(2) : null,
    tasa_interes: data.tasaInteres != null ? d(data.tasaInteres).toFixed(2) : null,
    currency: data.currency ?? "DOP",
    fecha_inicio: data.fechaInicio ?? null,
    fecha_proximo_pago: data.fechaProximoPago ?? null,
    estado: "activa",
  }

  const { data: row, error } = await sb
    .from("fin_debts")
    .insert(payload)
    .select("*")
    .single()

  if (error) throwServiceError("FIN_DEBT_CREATE_FAILED", error, { studioId })

  const debt = row as FinDebtRow
  await logActivity({
    studioId,
    actorId,
    entityType: "fin_debt",
    entityId: debt.id,
    action: "fin_debt.created",
    metadata: { acreedor: debt.acreedor, monto_original: debt.monto_original },
  })

  return debt
}

/**
 * Registra un pago contra la deuda.
 * Si cuentaId → crea fin_transactions.gasto atómico (sale dinero de la cuenta).
 * Disminuye saldo_pendiente + incrementa cuotas_pagadas.
 * Si saldo_pendiente llega a 0 → estado='pagada'.
 */
export async function recordDebtPayment(
  studioId: string,
  actorId: string,
  data: RecordDebtPaymentInput,
) {
  const sb = untypedService()

  const { data: existing } = await sb
    .from("fin_debts")
    .select("*")
    .eq("id", data.debtId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()

  if (!existing) throw new Error("FIN_DEBT_NOT_FOUND")
  const debt = existing as FinDebtRow

  if (debt.estado === "pagada") throw new Error("FIN_DEBT_ALREADY_PAID")
  if (debt.estado === "cancelada") throw new Error("FIN_DEBT_CANCELLED")

  const pay = d(data.monto)
  const newSaldo = d(debt.saldo_pendiente).minus(pay)
  if (newSaldo.lt("-0.01")) throw new Error("FIN_DEBT_PAYMENT_EXCEEDS")

  // 1. Crea fin_transactions.gasto si cuentaId
  let transactionId: string | null = null
  if (data.cuentaId) {
    const tx = await createFinTransaction(studioId, actorId, {
      tipo: "gasto",
      monto: data.monto,
      currency: debt.currency,
      descripcion: `Pago deuda ${debt.acreedor}`,
      fecha: data.fecha,
      cuentaId: data.cuentaId,
      externalReference: `debt_payment:${debt.id}:${Date.now()}`,
      aplicaDiezmo: false,
      isBusiness: true,
      notas: data.notas,
    })
    transactionId = tx.id
  }

  // 2. Insert debt_payments row
  await sb.from("fin_debt_payments").insert({
    studio_id: studioId,
    debt_id: debt.id,
    monto: pay.toFixed(2),
    fecha: data.fecha,
    cuenta_id: data.cuentaId ?? null,
    transaction_id: transactionId,
    notas: data.notas ?? null,
  })

  // 3. Update saldo + cuotas
  const newEstado: FinDebtRow["estado"] = newSaldo.lte("0.01") ? "pagada" : "activa"
  await sb
    .from("fin_debts")
    .update({
      saldo_pendiente: newSaldo.toFixed(2),
      cuotas_pagadas: debt.cuotas_pagadas + 1,
      estado: newEstado,
    })
    .eq("id", debt.id)
    .eq("studio_id", studioId)

  await logActivity({
    studioId,
    actorId,
    entityType: "fin_debt",
    entityId: debt.id,
    action: "fin_debt.payment_recorded",
    metadata: {
      monto: pay.toFixed(2),
      saldo_resultante: newSaldo.toFixed(2),
      estado_resultante: newEstado,
      transaction_id: transactionId,
    },
  })

  return {
    debtId: debt.id,
    saldoRemaining: newSaldo.toFixed(2),
    estado: newEstado,
    transactionId,
  }
}
