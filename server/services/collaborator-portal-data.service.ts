/**
 * Datos del portal del colaborador: sus trabajos (asignaciones), sus pagos
 * (de proyecto + adicionales) y totales. Solo lectura para el colaborador; la
 * única mutación permitida es responder (aceptar/rechazar) sus invitaciones.
 * Todo filtra por `collaborator_id` (aislamiento).
 */

import "server-only"

import { untypedService } from "@/server/supabase/untyped"

export type ColabJob = {
  id: string
  projectId: string | null
  projectName: string
  clientName: string | null
  date: string | null
  time: string | null
  location: string | null
  role: string | null
  confirmStatus: string // pending | invited | confirmed | rejected | completed
  payStatus: string // pending | paid | cancelled
  agreedPay: number
  paymentMethod: string | null
  paidAt: string | null
  isPast: boolean
}

export type ColabExtraPayment = {
  id: string
  concept: string
  description: string | null
  amount: number
  status: string // pending | paid | cancelled
  method: string | null
  date: string | null
  paidAt: string | null
}

export type ColabDashboard = {
  jobs: ColabJob[]
  extras: ColabExtraPayment[]
  totals: {
    pendingTotal: number // por cobrar (proyectos pendientes + extras pendientes)
    paidTotal: number // recibido
    jobsUpcoming: number
    jobsDone: number
  }
}

function todayRD(): string {
  // YYYY-MM-DD en zona RD (evita el corrimiento de -1 día de new Date(dateOnly)).
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Santo_Domingo" })
}

export async function getCollaboratorDashboard(
  studioId: string,
  collaboratorId: string,
): Promise<ColabDashboard> {
  const sb = untypedService()
  const today = todayRD()

  const [{ data: assigns }, { data: pays }] = await Promise.all([
    sb
      .from("project_collaborators")
      .select(
        "id, project_id, role, agreed_pay, pay_status, confirm_status, service_date, payment_method, paid_at, " +
          "project:projects(name, event_date, event_time, location, client:clients(name))",
      )
      .eq("studio_id", studioId)
      .eq("collaborator_id", collaboratorId)
      .is("deleted_at", null)
      .order("service_date", { ascending: false }),
    sb
      .from("collaborator_payments")
      .select("id, concept, description, amount, status, payment_method, payment_date, paid_at")
      .eq("studio_id", studioId)
      .eq("collaborator_id", collaboratorId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ])

  const jobs: ColabJob[] = ((assigns ?? []) as Array<Record<string, unknown>>).map((r) => {
    const project = (r.project ?? null) as {
      name?: string
      event_date?: string | null
      event_time?: string | null
      location?: string | null
      client?: { name?: string } | { name?: string }[] | null
    } | null
    const client = Array.isArray(project?.client) ? project?.client[0] : project?.client
    const date = (r.service_date as string | null) ?? project?.event_date ?? null
    return {
      id: r.id as string,
      projectId: (r.project_id as string | null) ?? null,
      projectName: project?.name ?? "Sesión",
      clientName: client?.name ?? null,
      date,
      time: project?.event_time ?? null,
      location: project?.location ?? null,
      role: (r.role as string | null) ?? null,
      confirmStatus: (r.confirm_status as string) ?? "pending",
      payStatus: (r.pay_status as string) ?? "pending",
      agreedPay: Number(r.agreed_pay ?? 0),
      paymentMethod: (r.payment_method as string | null) ?? null,
      paidAt: (r.paid_at as string | null) ?? null,
      isPast: !!date && date < today,
    }
  })

  const extras: ColabExtraPayment[] = ((pays ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    concept: (r.concept as string) ?? "otro",
    description: (r.description as string | null) ?? null,
    amount: Number(r.amount ?? 0),
    status: (r.status as string) ?? "pending",
    method: (r.payment_method as string | null) ?? null,
    date: (r.payment_date as string | null) ?? null,
    paidAt: (r.paid_at as string | null) ?? null,
  }))

  let pendingTotal = 0
  let paidTotal = 0
  for (const j of jobs) {
    if (j.payStatus === "paid") paidTotal += j.agreedPay
    else if (j.payStatus === "pending") pendingTotal += j.agreedPay
  }
  for (const e of extras) {
    if (e.status === "paid") paidTotal += e.amount
    else if (e.status === "pending") pendingTotal += e.amount
  }

  return {
    jobs,
    extras,
    totals: {
      pendingTotal,
      paidTotal,
      jobsUpcoming: jobs.filter((j) => !j.isPast).length,
      jobsDone: jobs.filter((j) => j.isPast).length,
    },
  }
}

/**
 * El colaborador responde (acepta/rechaza) una de SUS asignaciones desde el
 * portal (autenticado por cookie, no por token). Verifica pertenencia.
 */
export async function respondToOwnAssignment(
  studioId: string,
  collaboratorId: string,
  assignmentId: string,
  action: "confirm" | "reject",
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const sb = untypedService()
  const { data: row } = await sb
    .from("project_collaborators")
    .select("id, confirm_status")
    .eq("id", assignmentId)
    .eq("studio_id", studioId)
    .eq("collaborator_id", collaboratorId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!row) return { ok: false, error: "Trabajo no encontrado" }
  const status = (row as { confirm_status: string }).confirm_status
  if (status === "confirmed" || status === "rejected") {
    return { ok: false, error: "Este trabajo ya tiene tu respuesta" }
  }
  const { error } = await sb
    .from("project_collaborators")
    .update({
      confirm_status: action === "confirm" ? "confirmed" : "rejected",
      responded_at: new Date().toISOString(),
      response_note: note?.slice(0, 500) ?? null,
    })
    .eq("id", assignmentId)
    .eq("studio_id", studioId)
    .eq("collaborator_id", collaboratorId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
