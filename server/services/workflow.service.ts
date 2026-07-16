import "server-only"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { untypedService } from "@/server/supabase/untyped"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { createWorkflowTask } from "./project-automation.service"
import {
  STAGE_LABELS,
  STAGE_ORDER,
  type ClientCard,
  type PipelineStage,
  type ProjectPipeline,
  type StageKey,
  type StageState,
} from "@/lib/workflow/types"

/**
 * Pipeline de trabajo por cliente. Unifica el seguimiento de cada cliente a lo
 * largo del flujo fotográfico en 6 etapas. Las etapas accionables
 * ("Enviar selección" / "Enviar impresiones") son tareas reales (tabla tasks con
 * workflow_stage); el resto se DERIVA del estado existente (sesión, selección,
 * galería final, cliente finalizado).
 */

export type {
  ClientCard,
  PipelineStage,
  ProjectPipeline,
  StageKey,
  StageState,
} from "@/lib/workflow/types"

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function deriveStages(input: {
  eventDate: string | null
  clientFinalized: boolean
  selectionSubmitted: boolean
  finalGalleryPublished: boolean
  sendSelTask?: { id: string; status: string; due_date: string | null } | null
  sendPrintsTask?: { id: string; status: string; due_date: string | null } | null
  estimatedDeliveryDate: string | null
}): PipelineStage[] {
  const today = todayStr()
  const {
    eventDate,
    clientFinalized,
    selectionSubmitted,
    finalGalleryPublished,
    sendSelTask,
    sendPrintsTask,
    estimatedDeliveryDate,
  } = input

  const done: Record<StageKey, boolean> = {
    session: !!eventDate && eventDate < today,
    send_selection: sendSelTask?.status === "completada" || selectionSubmitted,
    editing: finalGalleryPublished,
    final_gallery: finalGalleryPublished,
    send_prints: sendPrintsTask?.status === "completada",
    finalized: clientFinalized,
  }

  const order = STAGE_ORDER

  // Pipeline monótono: alcanzar una etapa posterior implica que las anteriores
  // ya ocurrieron. Ej.: si el cliente envió su selección, la sesión claramente
  // se hizo aunque su fecha sea futura — no la dejes "en curso" detrás.
  let laterDone = false
  for (let i = order.length - 1; i >= 0; i--) {
    if (done[order[i]]) laterDone = true
    else if (laterDone) done[order[i]] = true
  }

  const firstPending = order.find((k) => !done[k]) ?? null

  return order.map((key) => {
    const isDone = done[key]
    let state: StageState = isDone ? "done" : key === firstPending ? "current" : "todo"

    const task =
      key === "send_selection" ? sendSelTask : key === "send_prints" ? sendPrintsTask : null
    // Una tarea con due_date vencida y sin completar = overdue.
    if (!isDone && task && task.due_date && task.due_date < today && task.status !== "completada") {
      state = "overdue"
    }

    let date: string | null = null
    if (key === "session") date = eventDate
    else if (key === "final_gallery") date = estimatedDeliveryDate
    else if (task) date = task.due_date

    return { key, label: STAGE_LABELS[key], state, date, taskId: task?.id ?? null }
  })
}

/**
 * Devuelve el pipeline agrupado por cliente, ordenado por fecha de entrega
 * final (más próxima primero); los clientes finalizados van al final.
 */
export async function getClientPipelines(studioId: string): Promise<ClientCard[]> {
  const supabase = createSupabaseServerClient()
  const sb = untypedService()

  const [{ data: clientsRaw }, { data: projectsRaw }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, completed_at")
      .eq("studio_id", studioId)
      .is("deleted_at", null),
    supabase
      .from("projects")
      .select("id, name, client_id, event_date, status")
      .eq("studio_id", studioId)
      .is("deleted_at", null)
      .not("client_id", "is", null),
  ])

  const clients = (clientsRaw ?? []) as Array<{
    id: string
    name: string
    completed_at: string | null
  }>
  const projects = (projectsRaw ?? []) as Array<{
    id: string
    name: string
    client_id: string
    event_date: string | null
    status: string | null
  }>
  if (projects.length === 0) return []

  const projectIds = projects.map((p) => p.id)

  // client_deliveries.estimated_delivery_date y galleries.gallery_type no están
  // en los tipos generados (se acceden untyped en el resto del repo) → usar `sb`.
  const [{ data: delivRaw }, { data: galRaw }, { data: taskRaw }] = await Promise.all([
    sb
      .from("client_deliveries")
      .select("project_id, estimated_delivery_date")
      .eq("studio_id", studioId)
      .is("deleted_at", null)
      .in("project_id", projectIds),
    sb
      .from("galleries")
      .select("id, project_id, gallery_type, status, selection_submitted, delivery_ready_at")
      .eq("studio_id", studioId)
      .is("deleted_at", null)
      .in("project_id", projectIds),
    sb
      .from("tasks")
      .select("id, entity_id, workflow_stage, status, due_date")
      .eq("studio_id", studioId)
      .eq("entity_type", "project")
      .not("workflow_stage", "is", null)
      .is("deleted_at", null)
      .in("entity_id", projectIds),
  ])

  const deliveries = (delivRaw ?? []) as Array<{
    project_id: string
    estimated_delivery_date: string | null
  }>
  const galleries = (galRaw ?? []) as Array<{
    id: string
    project_id: string | null
    gallery_type: string | null
    status: string | null
    selection_submitted: boolean | null
    delivery_ready_at: string | null
  }>
  const tasks = (taskRaw ?? []) as Array<{
    id: string
    entity_id: string | null
    workflow_stage: string | null
    status: string
    due_date: string | null
  }>

  // En todo el sistema una galería está "entregada" si TIENE fotos de entrega o
  // si se marcó la fecha de envío (badge de /galleries, vista pública). El
  // pipeline solo miraba `delivery_ready_at`, que únicamente se escribe al pulsar
  // "Enviar al cliente": si la entrega se hizo subiendo las fotos y pasando el
  // link/Drive a mano, la edición se quedaba trabada. Mismo criterio aquí.
  const galleryIds = galleries.map((g) => g.id)
  const galleriesWithDeliveryPhotos = new Set<string>()
  if (galleryIds.length > 0) {
    const { data: dAssets } = await sb
      .from("gallery_assets")
      .select("gallery_id")
      .in("gallery_id", galleryIds)
      .in("delivery_track", ["social", "high_quality"])
      .is("deleted_at", null)
    for (const a of (dAssets ?? []) as Array<{ gallery_id: string }>) {
      galleriesWithDeliveryPhotos.add(a.gallery_id)
    }
  }

  const clientById = new Map(clients.map((c) => [c.id, c]))
  const estByProject = new Map<string, string | null>()
  for (const d of deliveries) {
    if (!estByProject.has(d.project_id)) estByProject.set(d.project_id, d.estimated_delivery_date)
  }

  const cardByClient = new Map<string, ClientCard>()

  for (const p of projects) {
    const client = clientById.get(p.client_id)
    if (!client) continue

    const pGalleries = galleries.filter((g) => g.project_id === p.id)
    const selectionSubmitted = pGalleries.some((g) => g.selection_submitted === true)
    const finalGalleryPublished = pGalleries.some(
      (g) =>
        g.status === "published" &&
        (!!g.delivery_ready_at || galleriesWithDeliveryPhotos.has(g.id)),
    )
    const pTasks = tasks.filter((t) => t.entity_id === p.id)
    const sendSelTask = pTasks.find((t) => t.workflow_stage === "send_selection") ?? null
    const sendPrintsTask = pTasks.find((t) => t.workflow_stage === "send_prints") ?? null
    const estimatedDeliveryDate = estByProject.get(p.id) ?? null

    const stages = deriveStages({
      eventDate: p.event_date,
      clientFinalized: client.completed_at != null,
      selectionSubmitted,
      finalGalleryPublished,
      sendSelTask,
      sendPrintsTask,
      estimatedDeliveryDate,
    })

    const current = stages.find((s) => s.state === "current" || s.state === "overdue")
    const overdueCount = stages.filter((s) => s.state === "overdue").length

    const projectPipeline: ProjectPipeline = {
      projectId: p.id,
      projectName: p.name,
      eventDate: p.event_date,
      estimatedDeliveryDate,
      stages,
      nextActionLabel: client.completed_at != null ? null : current?.label ?? null,
      overdueCount,
      status: p.status,
    }

    let card = cardByClient.get(p.client_id)
    if (!card) {
      card = {
        clientId: client.id,
        clientName: client.name,
        finalized: client.completed_at != null,
        earliestDelivery: null,
        totalOverdue: 0,
        projects: [],
        progress: 0,
      }
      cardByClient.set(p.client_id, card)
    }
    card.projects.push(projectPipeline)
    card.totalOverdue += overdueCount
    card.progress = Math.max(card.progress, stages.filter((s) => s.state === "done").length)
    if (
      estimatedDeliveryDate &&
      (!card.earliestDelivery || estimatedDeliveryDate < card.earliestDelivery)
    ) {
      card.earliestDelivery = estimatedDeliveryDate
    }
  }

  const cards = [...cardByClient.values()]
  // Orden: finalizados al final; el resto por AVANCE (lo más cerca de terminar
  // va primero) y, a igual avance, por la entrega más próxima.
  cards.sort((a, b) => {
    if (a.finalized !== b.finalized) return a.finalized ? 1 : -1
    if (a.progress !== b.progress) return b.progress - a.progress
    const da = a.earliestDelivery ?? "9999-12-31"
    const db = b.earliestDelivery ?? "9999-12-31"
    if (da !== db) return da.localeCompare(db)
    return a.clientName.localeCompare(b.clientName)
  })
  return cards
}

/**
 * CRON: genera las tareas de etapa que dependen del tiempo. Hoy: "Enviar
 * selección" para proyectos cuya sesión ya pasó (reciente) y que aún no tienen
 * la tarea ni la selección enviada. Refresca también la fecha estimada de
 * entrega. Procesa todos los studios. Idempotente.
 */
export async function processWorkflowStages(): Promise<{
  sessionTasksCreated: number
  scanned: number
}> {
  const supabase = createSupabaseServiceClient()
  const today = todayStr()
  const since = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10)

  const { data: projectsRaw } = await supabase
    .from("projects")
    .select("id, studio_id, event_date")
    .is("deleted_at", null)
    .not("event_date", "is", null)
    .lt("event_date", today)
    .gte("event_date", since)
  const cands = (projectsRaw ?? []) as Array<{
    id: string
    studio_id: string
    event_date: string
  }>
  if (cands.length === 0) return { sessionTasksCreated: 0, scanned: 0 }

  const projectIds = cands.map((p) => p.id)
  const sb = untypedService()

  const [{ data: existingRaw }, { data: subsRaw }] = await Promise.all([
    sb
      .from("tasks")
      .select("entity_id")
      .eq("workflow_stage", "send_selection")
      .eq("entity_type", "project")
      .is("deleted_at", null)
      .in("entity_id", projectIds),
    supabase
      .from("galleries")
      .select("project_id")
      .is("deleted_at", null)
      .eq("selection_submitted", true)
      .in("project_id", projectIds),
  ])
  const hasTask = new Set(
    ((existingRaw ?? []) as Array<{ entity_id: string }>).map((t) => t.entity_id),
  )
  const selectionDone = new Set(
    ((subsRaw ?? []) as Array<{ project_id: string | null }>)
      .map((g) => g.project_id)
      .filter((x): x is string => !!x),
  )

  const { recomputeProjectDelivery } = await import("./delivery.service")

  let created = 0
  for (const p of cands) {
    if (hasTask.has(p.id) || selectionDone.has(p.id)) continue
    const due = new Date(new Date(p.event_date).getTime() + 86400000)
      .toISOString()
      .slice(0, 10)
    const ok = await createWorkflowTask(p.studio_id, p.id, "send_selection", {
      title: "Enviar selección de fotos al cliente",
      description:
        "La sesión ya ocurrió. Comparte la galería de selección para que el cliente elija sus fotos.",
      dueDate: due,
    })
    if (ok) created++
    try {
      await recomputeProjectDelivery(p.studio_id, p.id)
    } catch {
      /* best-effort */
    }
  }

  return { sessionTasksCreated: created, scanned: cands.length }
}
