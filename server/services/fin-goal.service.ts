import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"
import { d } from "@/lib/decimal"

/**
 * Service de Metas Financieras.
 *
 * Tracking simple: monto_objetivo + monto_actual. El user contribuye al goal
 * mediante goal_contributions (puede o no estar vinculado a una transaction
 * real — algunas metas son "mental tracking" sin afectar cuentas).
 *
 * Si reachedTarget → goal.estado='completada'.
 */

export type FinGoalRow = {
  id: string
  studio_id: string
  nombre: string
  monto_objetivo: number | string
  monto_actual: number | string
  currency: string
  fecha_objetivo: string | null
  cuenta_id: string | null
  estado: "activa" | "completada" | "pausada" | "cancelada"
  metadata: unknown
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export async function getFinGoals(
  studioId: string,
  opts: { estado?: FinGoalRow["estado"]; page?: number; pageSize?: number } = {},
) {
  const { page = 1, pageSize = 50 } = opts
  const sb = untypedServer()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = sb
    .from("fin_goals")
    .select("*", { count: "exact" })
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("fecha_objetivo", { ascending: true, nullsFirst: false })
    .range(from, to)

  if (opts.estado) query = query.eq("estado", opts.estado)

  const { data, count, error } = await query
  if (error) throwServiceError("FIN_GOAL_OP_FAILED", error)

  return {
    items: (data ?? []) as FinGoalRow[],
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize) || 1,
  }
}

export async function createFinGoal(
  studioId: string,
  actorId: string,
  data: {
    nombre: string
    montoObjetivo: number
    currency?: string
    fechaObjetivo?: string | null
    cuentaId?: string | null
  },
) {
  const sb = untypedService()
  const { data: row, error } = await sb
    .from("fin_goals")
    .insert({
      studio_id: studioId,
      nombre: data.nombre,
      monto_objetivo: d(data.montoObjetivo).toFixed(2),
      monto_actual: "0.00",
      currency: data.currency ?? "DOP",
      fecha_objetivo: data.fechaObjetivo ?? null,
      cuenta_id: data.cuentaId ?? null,
      estado: "activa",
    })
    .select("*")
    .single()

  if (error) throwServiceError("FIN_GOAL_CREATE_FAILED", error, { studioId })

  const goal = row as FinGoalRow
  await logActivity({
    studioId,
    actorId,
    entityType: "fin_goal",
    entityId: goal.id,
    action: "fin_goal.created",
    metadata: { nombre: goal.nombre, monto_objetivo: goal.monto_objetivo },
  })

  return goal
}

export async function addGoalContribution(
  studioId: string,
  actorId: string,
  data: {
    goalId: string
    monto: number
    fecha: string
    transactionId?: string
    notas?: string
  },
) {
  const sb = untypedService()
  const { data: goal } = await sb
    .from("fin_goals")
    .select("id, monto_objetivo, monto_actual, estado")
    .eq("id", data.goalId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()

  if (!goal) throw new Error("FIN_GOAL_NOT_FOUND")
  if (goal.estado === "cancelada") throw new Error("FIN_GOAL_CANCELLED")

  const newActual = d(goal.monto_actual).plus(d(data.monto))
  const objetivo = d(goal.monto_objetivo)
  const reached = newActual.gte(objetivo)

  await sb.from("fin_goal_contributions").insert({
    studio_id: studioId,
    goal_id: data.goalId,
    monto: d(data.monto).toFixed(2),
    fecha: data.fecha,
    transaction_id: data.transactionId ?? null,
    notas: data.notas ?? null,
  })

  await sb
    .from("fin_goals")
    .update({
      monto_actual: newActual.toFixed(2),
      estado: reached && goal.estado === "activa" ? "completada" : goal.estado,
    })
    .eq("id", data.goalId)
    .eq("studio_id", studioId)

  await logActivity({
    studioId,
    actorId,
    entityType: "fin_goal",
    entityId: data.goalId,
    action: reached ? "fin_goal.completed" : "fin_goal.contribution_added",
    metadata: {
      monto: d(data.monto).toFixed(2),
      acumulado: newActual.toFixed(2),
      objetivo: objetivo.toFixed(2),
    },
  })

  return {
    goalId: data.goalId,
    montoActual: newActual.toFixed(2),
    reached,
  }
}
