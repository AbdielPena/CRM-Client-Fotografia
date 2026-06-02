import "server-only"

import { createSupabaseServerClient } from "@/server/supabase/server"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { throwServiceError } from "@/lib/utils/api-error"

/**
 * Sistema inteligente de entregas. Calcula fecha estimada, prioridad y riesgo
 * de retraso anclados a la fecha de sesión, el cumpleaños de la quinceañera y
 * el tiempo de entrega del paquete. El cálculo de la fecha estimada y el inicio
 * del compromiso (sesión realizada + pago confirmado) viven en la RPC
 * `upsert_project_delivery`; aquí derivamos prioridad/riesgo/días en vivo.
 */

export type DeliveryStatus =
  | "pendiente"
  | "en_edicion"
  | "lista"
  | "entregada"
  | "retrasada"

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pendiente: "Pendiente",
  en_edicion: "En edición",
  lista: "Lista para entregar",
  entregada: "Entregada",
  retrasada: "Retrasada",
}

export type DeliveryPriority = "alta" | "media" | "baja"

export interface UpcomingDelivery {
  id: string
  projectId: string | null
  clientId: string | null
  clientName: string
  projectName: string
  eventType: string | null
  sessionDate: string | null
  birthday: string | null
  deliveryDays: number | null
  estimatedDeliveryDate: string | null
  commitmentStarted: boolean
  status: DeliveryStatus
  // Derivados
  daysUntilDelivery: number | null
  daysUntilBirthday: number | null
  priority: DeliveryPriority
  lateRisk: boolean // entrega estimada DESPUÉS del cumpleaños
  overdue: boolean
}

function startOfDay(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Días entre hoy y una fecha (YYYY-MM-DD). Positivo = futuro, negativo = pasado. */
function daysFromToday(dateStr: string | null, today = new Date()): number | null {
  if (!dateStr) return null
  const target = new Date(dateStr + "T00:00:00Z")
  if (Number.isNaN(target.getTime())) return null
  const ms = startOfDay(target) - startOfDay(today)
  return Math.round(ms / 86_400_000)
}

/**
 * Deriva prioridad/riesgo/días de una entrega. Reglas:
 *  - lateRisk: la fecha estimada cae DESPUÉS del cumpleaños.
 *  - Prioridad ALTA: retrasada, vencida, con riesgo de tardía, cumpleaños ≤ 5 días,
 *    o entrega estimada ≤ 3 días.
 *  - MEDIA: cumpleaños ≤ 14 días o entrega ≤ 7 días.
 *  - BAJA: el resto.
 */
export function deriveDeliveryComputed(input: {
  status: DeliveryStatus
  birthday: string | null
  estimatedDeliveryDate: string | null
  today?: Date
}): {
  daysUntilDelivery: number | null
  daysUntilBirthday: number | null
  priority: DeliveryPriority
  lateRisk: boolean
  overdue: boolean
} {
  const today = input.today ?? new Date()
  const daysUntilDelivery = daysFromToday(input.estimatedDeliveryDate, today)
  const daysUntilBirthday = daysFromToday(input.birthday, today)

  const lateRisk =
    !!input.estimatedDeliveryDate &&
    !!input.birthday &&
    new Date(input.estimatedDeliveryDate) > new Date(input.birthday)

  const overdue =
    input.status !== "entregada" &&
    daysUntilDelivery !== null &&
    daysUntilDelivery < 0

  let priority: DeliveryPriority = "baja"
  if (input.status === "entregada") {
    priority = "baja"
  } else if (
    input.status === "retrasada" ||
    overdue ||
    lateRisk ||
    (daysUntilBirthday !== null && daysUntilBirthday <= 5) ||
    (daysUntilDelivery !== null && daysUntilDelivery <= 3)
  ) {
    priority = "alta"
  } else if (
    (daysUntilBirthday !== null && daysUntilBirthday <= 14) ||
    (daysUntilDelivery !== null && daysUntilDelivery <= 7)
  ) {
    priority = "media"
  }

  return { daysUntilDelivery, daysUntilBirthday, priority, lateRisk, overdue }
}

const PRIORITY_RANK: Record<DeliveryPriority, number> = { alta: 0, media: 1, baja: 2 }

/**
 * Lista las entregas del studio (no entregadas primero, ordenadas por urgencia:
 * prioridad → deadline más próximo → estado).
 */
export async function listDeliveries(
  studioId: string,
  opts: { includeDelivered?: boolean } = {},
): Promise<UpcomingDelivery[]> {
  const supabase = createSupabaseServerClient()
  let query = supabase
    .from("client_deliveries")
    .select(
      `id, project_id, client_id, status, session_date, birthday, delivery_days,
       estimated_delivery_date, commitment_started_at,
       client:clients(name), project:projects(name, event_type)`,
    )
    .eq("studio_id", studioId)
    .is("deleted_at", null)

  if (!opts.includeDelivered) {
    query = query.neq("status", "entregada")
  }

  const { data, error } = await query
  if (error) throwServiceError("DELIVERY_LIST_FAILED", error, { studioId })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pickOne = (v: any) => (Array.isArray(v) ? (v[0] ?? null) : v)
  const today = new Date()

  const rows: UpcomingDelivery[] = ((data as unknown[]) ?? []).map((raw) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = raw as any
    const status = (r.status as DeliveryStatus) ?? "pendiente"
    const computed = deriveDeliveryComputed({
      status,
      birthday: r.birthday ?? null,
      estimatedDeliveryDate: r.estimated_delivery_date ?? null,
      today,
    })
    return {
      id: r.id,
      projectId: r.project_id ?? null,
      clientId: r.client_id ?? null,
      clientName: pickOne(r.client)?.name ?? "Cliente",
      projectName: pickOne(r.project)?.name ?? "Sesión",
      eventType: pickOne(r.project)?.event_type ?? null,
      sessionDate: r.session_date ?? null,
      birthday: r.birthday ?? null,
      deliveryDays: r.delivery_days ?? null,
      estimatedDeliveryDate: r.estimated_delivery_date ?? null,
      commitmentStarted: !!r.commitment_started_at,
      status,
      ...computed,
    }
  })

  // Orden por urgencia: prioridad, luego el deadline más próximo (min de
  // cumpleaños y entrega), luego nombre.
  const deadlineOf = (d: UpcomingDelivery): number => {
    const cands = [d.daysUntilBirthday, d.daysUntilDelivery].filter(
      (n): n is number => n !== null,
    )
    return cands.length ? Math.min(...cands) : Number.POSITIVE_INFINITY
  }
  rows.sort((a, b) => {
    if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority])
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    const da = deadlineOf(a)
    const db = deadlineOf(b)
    if (da !== db) return da - db
    return a.clientName.localeCompare(b.clientName)
  })

  return rows
}

/** Métricas para el dashboard. */
export async function getDeliveryStats(studioId: string): Promise<{
  upcoming: number
  overdue: number
  birthdaysSoon: number
  lateRisks: number
  dueThisWeek: number
}> {
  const all = await listDeliveries(studioId, { includeDelivered: false })
  return {
    upcoming: all.length,
    overdue: all.filter((d) => d.overdue || d.status === "retrasada").length,
    birthdaysSoon: all.filter(
      (d) => d.daysUntilBirthday !== null && d.daysUntilBirthday >= 0 && d.daysUntilBirthday <= 7,
    ).length,
    lateRisks: all.filter((d) => d.lateRisk).length,
    dueThisWeek: all.filter(
      (d) => d.daysUntilDelivery !== null && d.daysUntilDelivery >= 0 && d.daysUntilDelivery <= 7,
    ).length,
  }
}

/** Recalcula (idempotente) la entrega de un proyecto vía la RPC. Best-effort. */
export async function recomputeProjectDelivery(
  studioId: string,
  projectId: string,
): Promise<string | null> {
  const svc = createSupabaseServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (svc as any).rpc("upsert_project_delivery", {
    p_studio_id: studioId,
    p_project_id: projectId,
  })
  if (error) {
    console.error("[recomputeProjectDelivery] falló:", error.message)
    return null
  }
  return (data as string) ?? null
}

/** Cambia el estado de una entrega (y marca delivered_at si corresponde). */
export async function updateDeliveryStatus(
  studioId: string,
  deliveryId: string,
  status: DeliveryStatus,
): Promise<void> {
  const supabase = createSupabaseServerClient()
  const patch: { status: string; updated_at: string; delivered_at?: string } = {
    status,
    updated_at: new Date().toISOString(),
  }
  if (status === "entregada") patch.delivered_at = new Date().toISOString()
  const { error } = await supabase
    .from("client_deliveries")
    .update(patch)
    .eq("id", deliveryId)
    .eq("studio_id", studioId)
  if (error) throwServiceError("DELIVERY_UPDATE_FAILED", error, { studioId, deliveryId })
}
