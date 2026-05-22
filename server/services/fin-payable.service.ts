import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"
import { d } from "@/lib/decimal"
import { createFinTransaction } from "./fin-transaction.service"

/**
 * Service de Cuentas por Pagar (CxP — espejo de fin_receivables).
 * Lo que TÚ le debes a alguien (proveedores, suplidores, freelancers).
 *
 * Cuando pagas un CxP con vinculación a cuenta:
 *   → crea fin_transactions.gasto atómico
 *   → balance de la cuenta baja
 *   → external_reference='payable_payment:<id>:<ts>' (audit trail idempotente)
 */

export type FinPayableRow = {
  id: string
  studio_id: string
  beneficiary_id: string | null
  acreedor: string
  monto: number | string
  currency: string
  fecha_emision: string | null
  fecha_venc: string | null
  estado: "pendiente" | "parcial" | "pagada" | "cancelada" | "vencida"
  monto_pagado: number | string
  notas: string | null
  metadata: unknown
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export async function getFinPayables(
  studioId: string,
  opts: {
    estado?: FinPayableRow["estado"]
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
    .from("fin_payables")
    .select(
      `*,
       beneficiary:fin_beneficiaries(id, nombre)`,
      { count: "exact" },
    )
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("fecha_venc", { ascending: true, nullsFirst: false })
    .range(from, to)

  if (opts.estado) query = query.eq("estado", opts.estado)
  if (opts.overdueOnly) {
    const today = new Date().toISOString().slice(0, 10)
    query = query
      .in("estado", ["pendiente", "parcial", "vencida"])
      .lt("fecha_venc", today)
  }
  if (opts.search && opts.search.trim()) {
    const term = `%${opts.search.trim()}%`
    query = query.or(`acreedor.ilike.${term},notas.ilike.${term}`)
  }

  const { data, count, error } = await query
  if (error) throwServiceError("FIN_PAYABLE_OP_FAILED", error)

  return {
    items: (data ?? []) as Array<
      FinPayableRow & { beneficiary?: { id: string; nombre: string } | null }
    >,
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize) || 1,
  }
}

export async function createFinPayable(
  studioId: string,
  actorId: string,
  data: {
    acreedor: string
    monto: number
    currency?: string
    fechaEmision?: string
    fechaVenc?: string
    beneficiaryId?: string
    notas?: string
  },
) {
  const sb = untypedService()
  const { data: row, error } = await sb
    .from("fin_payables")
    .insert({
      studio_id: studioId,
      acreedor: data.acreedor,
      beneficiary_id: data.beneficiaryId ?? null,
      monto: d(data.monto).toFixed(2),
      currency: data.currency ?? "DOP",
      fecha_emision: data.fechaEmision ?? null,
      fecha_venc: data.fechaVenc ?? null,
      estado: "pendiente",
      monto_pagado: "0.00",
      notas: data.notas ?? null,
    })
    .select("*")
    .single()

  if (error) throwServiceError("FIN_PAYABLE_CREATE_FAILED", error, { studioId })
  const recv = row as FinPayableRow

  await logActivity({
    studioId,
    actorId,
    entityType: "fin_payable",
    entityId: recv.id,
    action: "fin_payable.created",
    metadata: { acreedor: recv.acreedor, monto: recv.monto },
  })

  return recv
}

export async function recordPayablePayment(
  studioId: string,
  actorId: string,
  data: {
    payableId: string
    monto: number
    fecha: string
    cuentaId?: string
    notas?: string
  },
) {
  const sb = untypedService()
  const { data: existing } = await sb
    .from("fin_payables")
    .select("*")
    .eq("id", data.payableId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()

  if (!existing) throw new Error("FIN_PAYABLE_NOT_FOUND")
  const recv = existing as FinPayableRow

  if (recv.estado === "pagada") throw new Error("FIN_PAYABLE_ALREADY_PAID")
  if (recv.estado === "cancelada") throw new Error("FIN_PAYABLE_CANCELLED")

  const pay = d(data.monto)
  const prevPaid = d(recv.monto_pagado)
  const newPaid = prevPaid.plus(pay)
  if (newPaid.gt(d(recv.monto).plus("0.01"))) {
    throw new Error("FIN_PAYABLE_PAYMENT_EXCEEDS")
  }

  // Crea fin_transactions.gasto si vincula cuenta
  let transactionId: string | null = null
  if (data.cuentaId) {
    const tx = await createFinTransaction(studioId, actorId, {
      tipo: "gasto",
      monto: data.monto,
      currency: recv.currency,
      descripcion: `Pago CxP ${recv.acreedor}`,
      fecha: data.fecha,
      cuentaId: data.cuentaId,
      externalReference: `payable_payment:${recv.id}:${Date.now()}`,
      aplicaDiezmo: false,
      isBusiness: true,
      notas: data.notas,
    })
    transactionId = tx.id
  }

  // Update payable
  const newEstado: FinPayableRow["estado"] = newPaid.gte(d(recv.monto))
    ? "pagada"
    : "parcial"
  await sb
    .from("fin_payables")
    .update({
      monto_pagado: newPaid.toFixed(2),
      estado: newEstado,
    })
    .eq("id", recv.id)
    .eq("studio_id", studioId)

  await logActivity({
    studioId,
    actorId,
    entityType: "fin_payable",
    entityId: recv.id,
    action: "fin_payable.payment_recorded",
    metadata: {
      monto_pago: pay.toFixed(2),
      acumulado: newPaid.toFixed(2),
      estado_resultante: newEstado,
      transaction_id: transactionId,
    },
  })

  return {
    payableId: recv.id,
    montoPagado: newPaid.toFixed(2),
    estado: newEstado,
    transactionId,
  }
}
