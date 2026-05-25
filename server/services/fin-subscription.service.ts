import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"
import { d } from "@/lib/decimal"

/**
 * Service de suscripciones recurrentes (gastos fijos automatizados).
 *
 * Ejemplos: Adobe CC, Lightroom, Spotify, hosting, dominio, seguros, etc.
 *
 * Funcionamiento:
 *   1. createFinSubscription registra el cargo recurrente con frecuencia
 *      (semanal/mensual/etc) y proxima_fecha = primera fecha de cobro
 *   2. processFinSubscriptionDueCharges (cron diario) busca subscriptions
 *      con proxima_fecha <= today, crea fin_subscription_charges + el
 *      fin_transactions.gasto correspondiente, y avanza proxima_fecha
 *      al siguiente periodo según frecuencia
 *
 * Idempotencia: la combinacion (subscription_id, fecha) tiene UNIQUE
 * para evitar duplicados si el cron corre 2 veces el mismo dia.
 */

export type FinSubscriptionRow = {
  id: string
  studio_id: string
  nombre: string
  monto: number | string
  currency: string
  frecuencia:
    | "semanal"
    | "quincenal"
    | "mensual"
    | "bimestral"
    | "trimestral"
    | "semestral"
    | "anual"
  dia_cobro: number | null
  cuenta_id: string | null
  tarjeta_id: string | null
  categoria_id: string | null
  proxima_fecha: string | null
  activa: boolean
  metadata: unknown
  created_at: string
  updated_at: string
  deleted_at: string | null
}

const FRECUENCIA_DAYS: Record<FinSubscriptionRow["frecuencia"], number> = {
  semanal: 7,
  quincenal: 15,
  mensual: 30,
  bimestral: 60,
  trimestral: 90,
  semestral: 180,
  anual: 365,
}

export async function getFinSubscriptions(
  studioId: string,
  opts: { activeOnly?: boolean; page?: number; pageSize?: number } = {},
) {
  const { activeOnly = true, page = 1, pageSize = 50 } = opts
  const sb = untypedServer()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = sb
    .from("fin_subscriptions")
    .select(
      `*,
       cuenta:fin_accounts(id, nombre, currency),
       tarjeta:fin_cards(id, descripcion),
       categoria:fin_categories(id, nombre)`,
      { count: "exact" },
    )
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("proxima_fecha", { ascending: true, nullsFirst: false })
    .range(from, to)

  if (activeOnly) query = query.eq("activa", true)

  const { data, count, error } = await query
  if (error) throwServiceError("FIN_SUB_LIST_FAILED", error, { studioId })

  return {
    items: (data ?? []) as Array<
      FinSubscriptionRow & {
        cuenta?: { id: string; nombre: string; currency: string } | null
        tarjeta?: { id: string; descripcion: string } | null
        categoria?: { id: string; nombre: string } | null
      }
    >,
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize) || 1,
  }
}

export async function getFinSubscriptionById(
  studioId: string,
  subscriptionId: string,
) {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("fin_subscriptions")
    .select(
      `*,
       cuenta:fin_accounts(id, nombre, currency),
       tarjeta:fin_cards(id, descripcion),
       categoria:fin_categories(id, nombre)`,
    )
    .eq("id", subscriptionId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()

  if (error)
    throwServiceError("FIN_SUB_GET_FAILED", error, { studioId, subscriptionId })

  if (!data) return null

  // Cargos historicos
  const { data: charges } = await sb
    .from("fin_subscription_charges")
    .select(
      `id, fecha, monto, pagado,
       transaction:fin_transactions(id, descripcion)`,
    )
    .eq("subscription_id", subscriptionId)
    .order("fecha", { ascending: false })
    .limit(50)

  return {
    ...data,
    charges: (charges ?? []) as Array<{
      id: string
      fecha: string
      monto: number | string
      pagado: boolean
      transaction?: { id: string; descripcion: string } | null
    }>,
  } as FinSubscriptionRow & {
    cuenta?: { id: string; nombre: string; currency: string } | null
    tarjeta?: { id: string; descripcion: string } | null
    categoria?: { id: string; nombre: string } | null
    charges: Array<{
      id: string
      fecha: string
      monto: number | string
      pagado: boolean
      transaction?: { id: string; descripcion: string } | null
    }>
  }
}

export async function createFinSubscription(
  studioId: string,
  actorId: string,
  data: {
    nombre: string
    monto: number
    currency?: string
    frecuencia: FinSubscriptionRow["frecuencia"]
    diaCobro?: number
    cuentaId?: string
    tarjetaId?: string
    categoriaId?: string
    proximaFecha: string
  },
) {
  const sb = untypedService()

  if (!data.nombre.trim()) throw new Error("FIN_SUB_NOMBRE_REQUIRED")
  if (data.monto <= 0) throw new Error("FIN_SUB_MONTO_REQUIRED")

  const { data: row, error } = await sb
    .from("fin_subscriptions")
    .insert({
      studio_id: studioId,
      nombre: data.nombre.trim(),
      monto: d(data.monto).toFixed(2),
      currency: (data.currency ?? "DOP").toUpperCase(),
      frecuencia: data.frecuencia,
      dia_cobro: data.diaCobro ?? null,
      cuenta_id: data.cuentaId ?? null,
      tarjeta_id: data.tarjetaId ?? null,
      categoria_id: data.categoriaId ?? null,
      proxima_fecha: data.proximaFecha,
      activa: true,
    })
    .select("*")
    .single()

  if (error) throwServiceError("FIN_SUB_CREATE_FAILED", error, { studioId })

  const subscription = row as FinSubscriptionRow
  await logActivity({
    studioId,
    actorId,
    entityType: "fin_subscription",
    entityId: subscription.id,
    action: "fin_subscription.created",
    metadata: {
      nombre: subscription.nombre,
      monto: subscription.monto,
      frecuencia: subscription.frecuencia,
    },
  })

  return subscription
}

export async function pauseFinSubscription(
  studioId: string,
  actorId: string,
  subscriptionId: string,
) {
  const sb = untypedService()
  const { error } = await sb
    .from("fin_subscriptions")
    .update({ activa: false })
    .eq("id", subscriptionId)
    .eq("studio_id", studioId)

  if (error)
    throwServiceError("FIN_SUB_PAUSE_FAILED", error, {
      studioId,
      subscriptionId,
    })

  await logActivity({
    studioId,
    actorId,
    entityType: "fin_subscription",
    entityId: subscriptionId,
    action: "fin_subscription.paused",
  })
}

export async function resumeFinSubscription(
  studioId: string,
  actorId: string,
  subscriptionId: string,
  proximaFecha: string,
) {
  const sb = untypedService()
  const { error } = await sb
    .from("fin_subscriptions")
    .update({ activa: true, proxima_fecha: proximaFecha })
    .eq("id", subscriptionId)
    .eq("studio_id", studioId)

  if (error)
    throwServiceError("FIN_SUB_RESUME_FAILED", error, {
      studioId,
      subscriptionId,
    })

  await logActivity({
    studioId,
    actorId,
    entityType: "fin_subscription",
    entityId: subscriptionId,
    action: "fin_subscription.resumed",
    metadata: { proxima_fecha: proximaFecha },
  })
}

/**
 * Procesa las suscripciones con proxima_fecha <= today.
 *
 * Para cada una:
 *   1. INSERT fin_subscription_charges (fecha, monto, pagado=true)
 *   2. INSERT fin_transactions tipo='gasto' (auto-link)
 *   3. UPDATE proxima_fecha = proxima_fecha + frecuencia_days
 *
 * Idempotente: si ya hay charge para (subscription_id, fecha) el INSERT
 * falla con 23505 y la suscripcion se skipea.
 *
 * Llamar desde cron diario (pg_cron o Supabase Edge Function).
 *
 * @returns Array de {subscriptionId, status, chargeId?} para logging.
 */
export async function processFinSubscriptionDueCharges(opts: {
  studioId?: string // si se pasa, procesa solo ese studio
  today?: string // YYYY-MM-DD, default hoy
}) {
  const sb = untypedService()
  const today = opts.today ?? new Date().toISOString().slice(0, 10)

  let query = sb
    .from("fin_subscriptions")
    .select("*")
    .eq("activa", true)
    .is("deleted_at", null)
    .lte("proxima_fecha", today)

  if (opts.studioId) query = query.eq("studio_id", opts.studioId)

  const { data: due, error } = await query
  if (error) throwServiceError("FIN_SUB_CRON_LIST_FAILED", error)

  const subscriptions = (due ?? []) as FinSubscriptionRow[]
  const results: Array<{
    subscriptionId: string
    status: "charged" | "skipped" | "failed"
    chargeId?: string
    error?: string
  }> = []

  for (const sub of subscriptions) {
    try {
      // 1) Crear charge
      const { data: charge, error: chErr } = await sb
        .from("fin_subscription_charges")
        .insert({
          studio_id: sub.studio_id,
          subscription_id: sub.id,
          fecha: today,
          monto: sub.monto,
          pagado: true,
        })
        .select("id")
        .maybeSingle()

      if (chErr) {
        if (chErr.code === "23505") {
          results.push({
            subscriptionId: sub.id,
            status: "skipped",
            error: "Charge ya existe (idempotencia)",
          })
          continue
        }
        throw chErr
      }
      if (!charge?.id) throw new Error("CHARGE_NOT_CREATED")

      // 2) Crear fin_transactions.gasto
      const { data: txn, error: txnErr } = await sb
        .from("fin_transactions")
        .insert({
          studio_id: sub.studio_id,
          tipo: "gasto",
          descripcion: `Suscripción: ${sub.nombre}`,
          monto: sub.monto,
          currency: sub.currency,
          fecha: today,
          cuenta_id: sub.cuenta_id,
          tarjeta_id: sub.tarjeta_id,
          categoria_id: sub.categoria_id,
          aplica_diezmo: false,
          is_business: true,
          external_reference: `fin_subscription_charge:${charge.id}`,
        })
        .select("id")
        .maybeSingle()

      if (txnErr) {
        // Si choca con external_reference UNIQUE, ya hay txn — link explicitamente
        if (txnErr.code === "23505") {
          // Buscar la txn existente para hacer el link
          const { data: existing } = await sb
            .from("fin_transactions")
            .select("id")
            .eq("external_reference", `fin_subscription_charge:${charge.id}`)
            .maybeSingle()
          if (existing?.id) {
            await sb
              .from("fin_subscription_charges")
              .update({ transaction_id: existing.id })
              .eq("id", charge.id)
          }
        } else {
          throw txnErr
        }
      } else if (txn?.id) {
        await sb
          .from("fin_subscription_charges")
          .update({ transaction_id: txn.id })
          .eq("id", charge.id)
      }

      // 3) Avanzar proxima_fecha
      const days = FRECUENCIA_DAYS[sub.frecuencia]
      const next = new Date(today)
      next.setDate(next.getDate() + days)
      await sb
        .from("fin_subscriptions")
        .update({ proxima_fecha: next.toISOString().slice(0, 10) })
        .eq("id", sub.id)

      await logActivity({
        studioId: sub.studio_id,
        actorId: "system",
        entityType: "fin_subscription",
        entityId: sub.id,
        action: "fin_subscription.charged",
        metadata: {
          charge_id: charge.id,
          fecha: today,
          monto: sub.monto,
        },
      })

      results.push({
        subscriptionId: sub.id,
        status: "charged",
        chargeId: charge.id,
      })
    } catch (err) {
      results.push({
        subscriptionId: sub.id,
        status: "failed",
        error: err instanceof Error ? err.message : "Unknown",
      })
    }
  }

  return results
}
