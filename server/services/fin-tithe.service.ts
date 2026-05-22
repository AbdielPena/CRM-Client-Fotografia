import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"
import { d } from "@/lib/decimal"

/**
 * Service de diezmo (10% sobre ingresos marcados como `aplica_diezmo=true`).
 *
 * Filosofía: el dueño del studio marca cada ingreso que cuenta para el diezmo
 * (fin_transactions.aplica_diezmo=true). El sistema auto-calcula el 10% al
 * cierre del mes y crea un registro en fin_tithe para tracking.
 *
 * Si el dueño paga el diezmo, marca el registro como pagado (genera
 * fin_transactions.gasto opcional con link).
 *
 * Patrón:
 *   - autoComputeMonthlyTithe: cron mensual día 28 — agrupa por mes,
 *     suma base_calculo, inserta fin_tithe con monto_diezmo=base*0.10
 *     (idempotente vía UNIQUE(studio_id, fecha) en YYYY-MM-01)
 *   - markTithePaid: registra el pago y opcionalmente crea fin_transactions
 */

export type FinTitheRow = {
  id: string
  studio_id: string
  fecha: string // primer día del mes computado
  base_calculo: number | string
  monto_diezmo: number | string
  pagado: boolean
  fecha_pago: string | null
  transaction_id: string | null
  notas: string | null
  created_at: string
  updated_at: string
}

export async function getFinTitheRecords(
  studioId: string,
  opts: { page?: number; pageSize?: number } = {},
) {
  const { page = 1, pageSize = 30 } = opts
  const sb = untypedServer()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, count, error } = await sb
    .from("fin_tithe")
    .select(
      `*,
       transaction:fin_transactions(id, descripcion, fecha)`,
      { count: "exact" },
    )
    .eq("studio_id", studioId)
    .order("fecha", { ascending: false })
    .range(from, to)

  if (error)
    throwServiceError("FIN_TITHE_LIST_FAILED", error, { studioId })

  return {
    items: (data ?? []) as Array<
      FinTitheRow & {
        transaction?: {
          id: string
          descripcion: string
          fecha: string
        } | null
      }
    >,
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize) || 1,
  }
}

/**
 * Computa base_calculo = SUM(monto) de fin_transactions.tipo='ingreso'
 * con aplica_diezmo=true en el periodo dado.
 *
 * @param studioId
 * @param period "YYYY-MM"
 * @returns base_calculo + cantidad de transactions
 */
export async function computeTitheBaseForPeriod(
  studioId: string,
  period: string,
): Promise<{ baseCalculo: number; transactionsCount: number }> {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error("INVALID_PERIOD_FORMAT")
  }

  const sb = untypedServer()
  const periodStart = `${period}-01`
  const [year, month] = period.split("-").map(Number)
  const nextMonth =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`

  const { data, error } = await sb
    .from("fin_transactions")
    .select("monto")
    .eq("studio_id", studioId)
    .eq("tipo", "ingreso")
    .eq("aplica_diezmo", true)
    .gte("fecha", periodStart)
    .lt("fecha", nextMonth)
    .is("deleted_at", null)

  if (error)
    throwServiceError("FIN_TITHE_COMPUTE_FAILED", error, { studioId, period })

  const rows = (data ?? []) as Array<{ monto: number | string }>
  const baseCalculo = rows.reduce((acc, r) => acc + Number(r.monto), 0)
  return { baseCalculo, transactionsCount: rows.length }
}

/**
 * Crea o actualiza el registro de diezmo para un mes específico.
 * Idempotente: si ya existe registro para (studio_id, primer día del mes),
 * lo actualiza con el nuevo base_calculo (en caso que se hayan agregado
 * transactions retroactivas).
 */
export async function upsertTitheForPeriod(
  studioId: string,
  actorId: string,
  period: string,
): Promise<FinTitheRow> {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error("INVALID_PERIOD_FORMAT")
  }

  const sb = untypedService()
  const fecha = `${period}-01`
  const { baseCalculo, transactionsCount } = await computeTitheBaseForPeriod(
    studioId,
    period,
  )

  const montoDiezmo = d(baseCalculo).times(0.1).toNumber()

  // Buscar registro existente
  const { data: existing } = await sb
    .from("fin_tithe")
    .select("id, pagado")
    .eq("studio_id", studioId)
    .eq("fecha", fecha)
    .maybeSingle()

  let row: FinTitheRow
  if (existing) {
    // No tocar si ya está pagado
    if (existing.pagado) {
      return existing as unknown as FinTitheRow
    }
    const { data: updated, error: updErr } = await sb
      .from("fin_tithe")
      .update({
        base_calculo: d(baseCalculo).toFixed(2),
        monto_diezmo: d(montoDiezmo).toFixed(2),
      })
      .eq("id", existing.id)
      .select("*")
      .single()

    if (updErr)
      throwServiceError("FIN_TITHE_UPDATE_FAILED", updErr, {
        studioId,
        period,
      })
    row = updated as FinTitheRow
  } else {
    const { data: inserted, error: insErr } = await sb
      .from("fin_tithe")
      .insert({
        studio_id: studioId,
        fecha,
        base_calculo: d(baseCalculo).toFixed(2),
        monto_diezmo: d(montoDiezmo).toFixed(2),
        pagado: false,
      })
      .select("*")
      .single()

    if (insErr)
      throwServiceError("FIN_TITHE_INSERT_FAILED", insErr, {
        studioId,
        period,
      })
    row = inserted as FinTitheRow
  }

  await logActivity({
    studioId,
    actorId,
    entityType: "fin_tithe",
    entityId: row.id,
    action: "fin_tithe.computed",
    metadata: {
      period,
      base_calculo: baseCalculo,
      monto_diezmo: montoDiezmo,
      transactions_count: transactionsCount,
    },
  })

  return row
}

/**
 * Marca un registro de diezmo como pagado y opcionalmente crea
 * la fin_transactions.gasto correspondiente.
 */
export async function markTithePaid(
  studioId: string,
  actorId: string,
  data: {
    titheId: string
    fechaPago: string
    cuentaId?: string
    categoriaId?: string
    notas?: string
    createTransaction?: boolean
  },
) {
  const sb = untypedService()

  const { data: tithe } = await sb
    .from("fin_tithe")
    .select("id, monto_diezmo, fecha, pagado")
    .eq("id", data.titheId)
    .eq("studio_id", studioId)
    .maybeSingle()

  if (!tithe) throw new Error("FIN_TITHE_NOT_FOUND")
  if (tithe.pagado) throw new Error("FIN_TITHE_ALREADY_PAID")

  let transactionId: string | null = null
  if (data.createTransaction !== false) {
    const { data: txn, error: txnErr } = await sb
      .from("fin_transactions")
      .insert({
        studio_id: studioId,
        tipo: "gasto",
        descripcion: `Diezmo ${tithe.fecha.slice(0, 7)}`,
        monto: tithe.monto_diezmo,
        currency: "DOP",
        fecha: data.fechaPago,
        cuenta_id: data.cuentaId ?? null,
        categoria_id: data.categoriaId ?? null,
        aplica_diezmo: false,
        is_business: false,
        external_reference: `fin_tithe:${tithe.id}`,
      })
      .select("id")
      .maybeSingle()

    if (txnErr) {
      if (txnErr.code !== "23505") {
        throwServiceError("FIN_TITHE_TRANSACTION_FAILED", txnErr, {
          studioId,
          titheId: data.titheId,
        })
      }
    }
    transactionId = txn?.id ?? null
  }

  const { error: updErr } = await sb
    .from("fin_tithe")
    .update({
      pagado: true,
      fecha_pago: data.fechaPago,
      transaction_id: transactionId,
      notas: data.notas ?? null,
    })
    .eq("id", data.titheId)
    .eq("studio_id", studioId)

  if (updErr)
    throwServiceError("FIN_TITHE_PAY_FAILED", updErr, {
      studioId,
      titheId: data.titheId,
    })

  await logActivity({
    studioId,
    actorId,
    entityType: "fin_tithe",
    entityId: data.titheId,
    action: "fin_tithe.paid",
    metadata: {
      fecha_pago: data.fechaPago,
      monto: tithe.monto_diezmo,
      transaction_id: transactionId,
    },
  })
}

/**
 * Cron mensual: para cada studio activo, computa el diezmo del mes anterior.
 *
 * Llamar día 28 del mes siguiente (no día 1 para esperar transactions
 * retroactivas/ajustes del cierre de mes).
 */
export async function autoComputeMonthlyTithe(opts: {
  period?: string // YYYY-MM, default = mes anterior
} = {}) {
  const sb = untypedService()

  const period =
    opts.period ??
    (() => {
      const now = new Date()
      now.setMonth(now.getMonth() - 1)
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
        2,
        "0",
      )}`
    })()

  // Listar studios activos
  const { data: studios, error } = await sb
    .from("studios")
    .select("id")
    .is("deleted_at", null)

  if (error) throwServiceError("FIN_TITHE_CRON_LIST_FAILED", error)

  const results: Array<{
    studioId: string
    titheId?: string
    error?: string
  }> = []

  for (const s of (studios ?? []) as Array<{ id: string }>) {
    try {
      const row = await upsertTitheForPeriod(s.id, "system", period)
      results.push({ studioId: s.id, titheId: row.id })
    } catch (err) {
      results.push({
        studioId: s.id,
        error: err instanceof Error ? err.message : "Unknown",
      })
    }
  }

  return results
}
