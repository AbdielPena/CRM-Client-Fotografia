import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"
import { d } from "@/lib/decimal"
import { createFinTransaction } from "./fin-transaction.service"

/**
 * Service de Préstamos Otorgados (lo que TÚ prestaste a alguien).
 *
 * Espejo de fin_debts pero con flujo invertido:
 *   - createLoan: insert + opcionalmente fin_transactions.gasto (sale plata)
 *   - recordLoanPayment: cuando el deudor te paga, fin_transactions.ingreso
 *     entra y saldo_pendiente baja.
 */

export type FinLoanRow = {
  id: string
  studio_id: string
  deudor: string
  monto_original: number | string
  saldo_pendiente: number | string
  currency: string
  fecha_inicio: string | null
  estado: "activo" | "cobrado" | "perdido" | "cancelado"
  metadata: unknown
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export async function getFinLoans(
  studioId: string,
  opts: { estado?: FinLoanRow["estado"]; search?: string; page?: number; pageSize?: number } = {},
) {
  const { page = 1, pageSize = 50 } = opts
  const sb = untypedServer()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = sb
    .from("fin_loans")
    .select("*", { count: "exact" })
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("fecha_inicio", { ascending: false, nullsFirst: false })
    .range(from, to)

  if (opts.estado) query = query.eq("estado", opts.estado)
  if (opts.search && opts.search.trim()) {
    query = query.ilike("deudor", `%${opts.search.trim()}%`)
  }

  const { data, count, error } = await query
  if (error) throwServiceError("FIN_LOAN_OP_FAILED", error)

  return {
    items: (data ?? []) as FinLoanRow[],
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize) || 1,
  }
}

export async function createFinLoan(
  studioId: string,
  actorId: string,
  data: {
    deudor: string
    montoOriginal: number
    currency?: string
    fechaInicio?: string
    cuentaSalida?: string // si provisto, crea fin_transactions.gasto
  },
) {
  const sb = untypedService()
  const monto = d(data.montoOriginal).toFixed(2)

  // 1. Crea loan
  const { data: row, error } = await sb
    .from("fin_loans")
    .insert({
      studio_id: studioId,
      deudor: data.deudor,
      monto_original: monto,
      saldo_pendiente: monto,
      currency: data.currency ?? "DOP",
      fecha_inicio: data.fechaInicio ?? new Date().toISOString().slice(0, 10),
      estado: "activo",
    })
    .select("*")
    .single()

  if (error) throwServiceError("FIN_LOAN_CREATE_FAILED", error, { studioId })

  const loan = row as FinLoanRow

  // 2. Si cuenta de salida → fin_transactions.gasto
  let transactionId: string | null = null
  if (data.cuentaSalida) {
    const tx = await createFinTransaction(studioId, actorId, {
      tipo: "gasto",
      monto: data.montoOriginal,
      currency: loan.currency,
      descripcion: `Préstamo otorgado a ${data.deudor}`,
      fecha: loan.fecha_inicio ?? new Date().toISOString().slice(0, 10),
      cuentaId: data.cuentaSalida,
      externalReference: `loan_disbursed:${loan.id}`,
      tipoIngreso: undefined,
      aplicaDiezmo: false,
      isBusiness: true,
    })
    transactionId = tx.id
  }

  await logActivity({
    studioId,
    actorId,
    entityType: "fin_loan",
    entityId: loan.id,
    action: "fin_loan.created",
    metadata: {
      deudor: loan.deudor,
      monto: loan.monto_original,
      transaction_id: transactionId,
    },
  })

  return loan
}

export async function recordLoanPayment(
  studioId: string,
  actorId: string,
  data: {
    loanId: string
    monto: number
    fecha: string
    cuentaEntrada?: string // si provisto, crea fin_transactions.ingreso
    notas?: string
  },
) {
  const sb = untypedService()
  const { data: existing } = await sb
    .from("fin_loans")
    .select("*")
    .eq("id", data.loanId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()

  if (!existing) throw new Error("FIN_LOAN_NOT_FOUND")
  const loan = existing as FinLoanRow

  if (loan.estado === "cobrado") throw new Error("FIN_LOAN_ALREADY_COLLECTED")
  if (loan.estado === "cancelado") throw new Error("FIN_LOAN_CANCELLED")

  const pay = d(data.monto)
  const newSaldo = d(loan.saldo_pendiente).minus(pay)
  if (newSaldo.lt("-0.01")) throw new Error("FIN_LOAN_PAYMENT_EXCEEDS")

  let transactionId: string | null = null
  if (data.cuentaEntrada) {
    const tx = await createFinTransaction(studioId, actorId, {
      tipo: "ingreso",
      monto: data.monto,
      currency: loan.currency,
      descripcion: `Cobro préstamo a ${loan.deudor}`,
      fecha: data.fecha,
      cuentaId: data.cuentaEntrada,
      externalReference: `loan_payment:${loan.id}:${Date.now()}`,
      tipoIngreso: "prestamo",
      aplicaDiezmo: false,
      isBusiness: true,
      notas: data.notas,
    })
    transactionId = tx.id
  }

  await sb.from("fin_loan_payments").insert({
    studio_id: studioId,
    loan_id: loan.id,
    monto: pay.toFixed(2),
    fecha: data.fecha,
    cuenta_id: data.cuentaEntrada ?? null,
    transaction_id: transactionId,
  })

  const newEstado = newSaldo.lte("0.01") ? "cobrado" : "activo"
  await sb
    .from("fin_loans")
    .update({
      saldo_pendiente: newSaldo.toFixed(2),
      estado: newEstado,
    })
    .eq("id", loan.id)
    .eq("studio_id", studioId)

  await logActivity({
    studioId,
    actorId,
    entityType: "fin_loan",
    entityId: loan.id,
    action: "fin_loan.payment_recorded",
    metadata: {
      monto: pay.toFixed(2),
      saldo_resultante: newSaldo.toFixed(2),
      transaction_id: transactionId,
    },
  })

  return { loanId: loan.id, saldoRemaining: newSaldo.toFixed(2), estado: newEstado }
}
