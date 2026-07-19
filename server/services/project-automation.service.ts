import "server-only"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { untypedService } from "@/server/supabase/untyped"
import { getProjectStatuses } from "@/server/services/project-status.service"
import { setProjectStatus } from "@/server/services/project-status.service"

/**
 * Intents semánticos del flujo del proyecto.
 * Mapean (vía keywords) al label custom del studio cuando hay match.
 * Si no hay match, la transición no se aplica (silencioso).
 */
export type ProjectIntent =
  | "consulta"
  | "pendiente_pago"
  | "reservado"
  | "sesion_realizada"
  | "esperando_seleccion"
  | "edicion"
  | "entregado"

const INTENT_KEYWORDS: Record<ProjectIntent, string[]> = {
  consulta: ["consulta", "inquiry", "lead", "inicial"],
  // "Pendiente de pago": reserva aceptada, aún sin pago. Se pone al aceptar; el
  // pago la mueve a "reservado". El match real es por auto_intent='pendiente_pago'
  // (findStatusLabelByIntent); estas keywords son fallback y van NORMALIZADAS
  // (normalize() quita espacios/acentos) para que hagan match sin chocar con otros.
  pendiente_pago: ["pendientedepago", "pendientepago", "porconfirmar", "sinpagar"],
  reservado: ["reserv", "booked", "agendad", "confirm", "abonad"],
  sesion_realizada: ["sesion", "shoot", "captur", "realiz"],
  esperando_seleccion: ["esperand", "selecc", "waiting"],
  edicion: ["edici", "edit", "post", "produc"],
  entregado: ["entreg", "delivered", "final", "complet"],
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_\s-]+/g, "")
}

/**
 * Resuelve el label del studio que mejor matchea con el intent.
 * 1º: estado con auto_intent asignado explícitamente en Settings.
 * 2º (fallback): keyword matching sobre el label.
 * Retorna null si ningún status del studio matchea.
 */
async function findStatusLabelByIntent(
  studioId: string,
  intent: ProjectIntent,
): Promise<string | null> {
  const statuses = await getProjectStatuses(studioId)

  const explicit = statuses.find(
    (s) => (s as { auto_intent?: string | null }).auto_intent === intent,
  )
  if (explicit) return explicit.label

  const keywords = INTENT_KEYWORDS[intent]
  // Ordenamos por position para preferir el "más temprano" cuando hay múltiples matches
  // (ej: si hay "Consulta inicial" y "Consulta seguimiento", queremos el primero).
  const sorted = [...statuses].sort((a, b) => a.position - b.position)
  for (const s of sorted) {
    const lbl = normalize(s.label)
    if (keywords.some((k) => lbl.includes(k))) return s.label
  }
  return null
}

/**
 * Aplica una transición de estado al proyecto.
 * - Si ya está en ese label, no hace nada.
 * - Si el studio no tiene un label que matchee, no hace nada.
 * - Loggea pero nunca lanza al caller (best-effort).
 */
export async function transitionProjectStatus(
  studioId: string,
  projectId: string,
  intent: ProjectIntent,
  opts?: { dispatch?: boolean },
): Promise<{ moved: boolean; toLabel: string | null }> {
  try {
    const targetLabel = await findStatusLabelByIntent(studioId, intent)
    if (!targetLabel) {
      console.warn(
        `[automation] no hay status del studio que matchee intent=${intent}`,
      )
      return { moved: false, toLabel: null }
    }

    const supabase = createSupabaseServiceClient()
    const { data: project } = await supabase
      .from("projects")
      .select("status")
      .eq("id", projectId)
      .eq("studio_id", studioId)
      .maybeSingle()

    const current = (project as { status: string } | null)?.status
    if (current === targetLabel) {
      return { moved: false, toLabel: targetLabel }
    }

    await setProjectStatus(studioId, projectId, targetLabel, opts)
    return { moved: true, toLabel: targetLabel }
  } catch (err) {
    console.error("[automation] transitionProjectStatus failed", {
      projectId,
      intent,
      err,
    })
    return { moved: false, toLabel: null }
  }
}

// ---------------------------------------------------------------------------
// Handlers de eventos del flujo
// ---------------------------------------------------------------------------

/** Cliente creado con booking → "Consulta inicial". */
export async function onClientCreated(
  studioId: string,
  projectId: string,
): Promise<void> {
  await transitionProjectStatus(studioId, projectId, "consulta")
}

/**
 * Pago registrado → "Reservado" (confirmado).
 * Pagar la reserva (o el balance) confirma la sesión; NUNCA la marca como
 * realizada. "Sesión realizada" solo se setea por un trigger explícito
 * (automatización update_project_status, cambio manual, o un trigger futuro
 * basado en la fecha de la sesión) — nunca por el conteo de pagos.
 */
export async function onPaymentRecorded(
  studioId: string,
  projectId: string,
): Promise<void> {
  const supabase = createSupabaseServiceClient()

  // Obtener IDs de facturas del proyecto
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id")
    .eq("studio_id", studioId)
    .eq("project_id", projectId)
    .is("deleted_at", null)

  const invoiceIds = ((invoices ?? []) as Array<{ id: string }>).map((i) => i.id)
  if (invoiceIds.length === 0) return

  // Contar pagos completados de esas facturas
  const { count } = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("studio_id", studioId)
    .in("invoice_id", invoiceIds)
    .eq("status", "completed")

  const paymentsCount = count ?? 0
  // Cualquier pago confirmado (reserva o balance) deja el proyecto en "Reservado".
  // transitionProjectStatus es idempotente: si ya está en "Reservado" no hace nada.
  // "Sesión realizada" NO se infiere por conteo de pagos (bug viejo): solo se setea
  // por automatización explícita / cambio manual / trigger por fecha de sesión.
  if (paymentsCount >= 1) {
    await transitionProjectStatus(studioId, projectId, "reservado")
  }

  // Flujo de booking: el PRIMER pago (depósito) confirma la sesión.
  // Best-effort — no bloquea el registro del pago si algo falla.
  if (paymentsCount >= 1) {
    try {
      await confirmBookingAfterPayment(studioId, projectId)
    } catch (err) {
      console.error("[onPaymentRecorded] confirmBookingAfterPayment failed", err)
    }
  }
}

/**
 * Al recibir el pago (depósito), confirma el booking de fotografía:
 *   - booking_request: awaiting_payment → confirmed
 *   - Google Calendar: evento provisional → confirmado (best-effort, requiere OAuth)
 *   - Notifica al cliente que su sesión quedó confirmada
 * Idempotente: solo actúa si el booking está en awaiting_payment.
 */
async function confirmBookingAfterPayment(
  studioId: string,
  projectId: string,
): Promise<void> {
  const supabase = createSupabaseServiceClient()

  // Buscar el booking_request del proyecto que esté esperando pago
  const { data: booking } = await supabase
    .from("booking_requests")
    .select("id, status, client_email, client_name")
    .eq("studio_id", studioId)
    .eq("project_id", projectId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = booking as any
  if (!b) return

  // Solo confirmamos si está en awaiting_payment (o approved como fallback).
  if (b.status !== "awaiting_payment" && b.status !== "approved") {
    return // ya confirmado / scheduled / cancelado — idempotente
  }

  await supabase
    .from("booking_requests")
    .update({ status: "confirmed" })
    .eq("id", b.id)
    .in("status", ["awaiting_payment", "approved"])

  // Google Calendar: confirmar el evento del proyecto (tentativo → confirmado).
  // Best-effort: si no hay OAuth de Google conectado, se ignora silenciosamente.
  try {
    const { confirmProjectCalendarEvent } = await import(
      "./google-calendar.service"
    )
    await confirmProjectCalendarEvent(studioId, projectId)
  } catch {
    // Sin Google Calendar conectado o función no disponible — no es fatal.
  }

  // Sistema de entregas: con el pago confirmado, crea/recalcula la entrega del
  // proyecto (fecha estimada, prioridad/riesgo, inicio del compromiso). El
  // compromiso solo se "activa" cuando además la sesión ya ocurrió; el cron
  // diario lo refresca. Best-effort.
  try {
    const { recomputeProjectDelivery } = await import("./delivery.service")
    await recomputeProjectDelivery(studioId, projectId)
  } catch (err) {
    console.error("[confirmBookingAfterPayment] recomputeProjectDelivery failed", err)
  }

  // Notificar al cliente: pago recibido + sesión confirmada
  try {
    if (b.client_email) {
      const { data: studioRow } = await supabase
        .from("studios")
        .select("name, primary_color, email")
        .eq("id", studioId)
        .maybeSingle()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const studio = studioRow as any
      const { enqueueEmail } = await import("./email.service")
      const { getEmailBranding } = await import("./email-template.service")
      const { wrapLuxuryEmail } = await import("@/lib/email/luxury-layout")
      const firstName = String(b.client_name ?? "").split(" ")[0] || ""
      const inner = `
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#A1A1A6">Sesión confirmada</p>
        <h1>¡Sesión confirmada${firstName ? `, ${escapeHtmlLocal(firstName)}` : ""}! 🎉</h1>
        <p>Recibimos tu pago y tu sesión con <strong>${escapeHtmlLocal(studio?.name ?? "el estudio")}</strong> quedó <strong>confirmada</strong>. Te contactaremos con los detalles finales para que todo salga perfecto.</p>
        <p style="font-size:13px;color:#6E6E73">¡Nos vemos pronto! ✨</p>`
      const branding = await getEmailBranding(studioId)
      const html = wrapLuxuryEmail(inner, {
        studioName: studio?.name ?? branding.studioName,
        logoUrl: branding.logoUrl,
        accent: branding.accent,
        footerHtml: branding.footerHtml,
        contactLine: branding.contactLine,
        whatsappUrl: branding.whatsappUrl,
        social: branding.social,
      })
      await enqueueEmail({
        studioId,
        toEmail: b.client_email,
        toName: b.client_name ?? null,
        subject: "Tu sesión está confirmada 🎉",
        bodyHtml: html,
        replyTo: studio?.email ?? null,
        templateSlug: "booking_confirmed",
        relatedEntityType: "booking_request",
        relatedEntityId: b.id,
      })
    }
  } catch (err) {
    console.error("[confirmBookingAfterPayment] notify client failed", err)
  }
}

function escapeHtmlLocal(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Galería vinculada a un cliente → "Esperando selección".
 * Busca el proyecto activo del cliente (más reciente, no cancelado).
 */
export async function onGalleryLinkedToClient(
  studioId: string,
  clientId: string,
  projectIdHint?: string | null,
): Promise<void> {
  const supabase = createSupabaseServiceClient()

  let projectId = projectIdHint ?? null
  if (!projectId) {
    const { data: projects } = await supabase
      .from("projects")
      .select("id, status, created_at")
      .eq("studio_id", studioId)
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
    projectId = ((projects ?? [])[0] as { id: string } | undefined)?.id ?? null
  }

  if (!projectId) return
  await transitionProjectStatus(studioId, projectId, "esperando_seleccion")
}

/**
 * Resuelve el projectId asociado a una galería (directo o vía client).
 */
async function resolveProjectIdFromGallery(
  studioId: string,
  galleryId: string,
): Promise<string | null> {
  const supabase = createSupabaseServiceClient()
  const { data: gallery } = await supabase
    .from("galleries")
    .select("project_id, client_id")
    .eq("id", galleryId)
    .eq("studio_id", studioId)
    .maybeSingle()

  const g = gallery as { project_id: string | null; client_id: string | null } | null
  if (!g) return null

  if (g.project_id) return g.project_id
  if (!g.client_id) return null

  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .eq("studio_id", studioId)
    .eq("client_id", g.client_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
  return ((projects ?? [])[0] as { id: string } | undefined)?.id ?? null
}

/**
 * Cliente dio favorite en una galería — telemetría/log only.
 * No mueve el status; un like aislado no significa "selección final".
 */
export async function onFavoriteReceived(
  studioId: string,
  galleryId: string,
): Promise<void> {
  const projectId = await resolveProjectIdFromGallery(studioId, galleryId)
  if (!projectId) return
  // Sin transición automática — el submit explícito es el trigger de "edición".
  // Mantenemos la función como hook para futuras telemetría/notificación.
}

/**
 * Cliente envió selección final → "En edición".
 * Disparado desde submitCollection cuando el cliente confirma su lista.
 */
export async function onSelectionSubmitted(
  studioId: string,
  galleryId: string,
): Promise<void> {
  const projectId = await resolveProjectIdFromGallery(studioId, galleryId)
  if (!projectId) return
  await transitionProjectStatus(studioId, projectId, "edicion")
}

// ---------------------------------------------------------------------------
// Pipeline de trabajo por cliente — etapas auto-generadas
// ---------------------------------------------------------------------------

export type WorkflowStage = "send_selection" | "send_prints"

/**
 * Crea (idempotente) una tarea de etapa del pipeline. SIN asignar (visible para
 * todo el panel). El índice único parcial (studio_id, entity_id, workflow_stage)
 * evita duplicados; si ya existe (23505), no hace nada.
 */
export async function createWorkflowTask(
  studioId: string,
  projectId: string,
  stage: WorkflowStage,
  opts: { title: string; description?: string; dueDate?: string | null },
): Promise<boolean> {
  const sb = untypedService()
  const { error } = await sb.from("tasks").insert({
    studio_id: studioId,
    title: opts.title,
    description: opts.description ?? null,
    due_date: opts.dueDate ?? null,
    priority: "high",
    status: "pendiente",
    entity_type: "project",
    entity_id: projectId,
    workflow_stage: stage,
    notify_assignee: false,
    created_by: null,
  })
  if (error) {
    if ((error as { code?: string }).code === "23505") return false // ya existe
    console.error("[pipeline] createWorkflowTask error", stage, error)
    return false
  }
  return true
}

/**
 * Galería de ENTREGA FINAL publicada → proyecto a "Entregado" + tarea
 * "Enviar impresiones". Best-effort, idempotente.
 */
export async function onFinalDeliveryPublished(
  studioId: string,
  projectId: string,
): Promise<void> {
  await transitionProjectStatus(studioId, projectId, "entregado")
  const days = await getPrintDeliveryDays(studioId, projectId)
  await createWorkflowTask(studioId, projectId, "send_prints", {
    title: "Enviar impresiones al cliente",
    description:
      "La galería de fotos finales está publicada. Coordina y envía las impresiones; al marcar esta tarea como completada, el cliente queda finalizado (si no le quedan otros proyectos pendientes).",
    dueDate: new Date(Date.now() + days * 86400000).toISOString().slice(0, 10),
  })
}

/**
 * Plazo para entregar las impresiones, en días desde que se publica la galería
 * final. Lo fija la categoría de la sesión (Configuración → Categorías); 21 si
 * no está configurada. Antes era un 3 fijo, que dejaba las quinceañeras y bodas
 * (2 a 4 semanas de plazo real) marcadas como atrasadas desde el primer día.
 */
async function getPrintDeliveryDays(studioId: string, projectId: string): Promise<number> {
  const DEFAULT_DAYS = 21
  try {
    const { data } = await untypedService()
      .from("projects")
      .select("service_category:service_categories(print_delivery_days)")
      .eq("studio_id", studioId)
      .eq("id", projectId)
      .maybeSingle()
    const cat = (data as any)?.service_category
    const days = (Array.isArray(cat) ? cat[0] : cat)?.print_delivery_days
    return typeof days === "number" && days > 0 ? days : DEFAULT_DAYS
  } catch {
    return DEFAULT_DAYS
  }
}

/**
 * Evalúa si el CLIENTE del proyecto queda "finalizado". Regla del usuario:
 * solo si NO le quedan proyectos pendientes — es decir, TODOS sus proyectos
 * vivos tienen su tarea "Enviar impresiones" completada. Setea clients.completed_at.
 */
export async function maybeFinalizeClient(
  studioId: string,
  projectId: string,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { data: project } = await supabase
    .from("projects")
    .select("client_id")
    .eq("id", projectId)
    .eq("studio_id", studioId)
    .maybeSingle()
  const clientId = (project as { client_id: string | null } | null)?.client_id
  if (!clientId) return

  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .eq("studio_id", studioId)
    .eq("client_id", clientId)
    .is("deleted_at", null)
  const projectIds = ((projects ?? []) as Array<{ id: string }>).map((p) => p.id)
  if (projectIds.length === 0) return

  const sb = untypedService()
  const { data: prints } = await sb
    .from("tasks")
    .select("entity_id, status")
    .eq("studio_id", studioId)
    .eq("workflow_stage", "send_prints")
    .eq("entity_type", "project")
    .in("entity_id", projectIds)
    .is("deleted_at", null)
  const done = new Set(
    ((prints ?? []) as Array<{ entity_id: string; status: string }>)
      .filter((t) => t.status === "completada")
      .map((t) => t.entity_id),
  )

  // Cliente finalizado solo si TODOS sus proyectos tienen impresiones completadas.
  if (!projectIds.every((id) => done.has(id))) return

  await sb
    .from("clients")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", clientId)
    .eq("studio_id", studioId)
    .is("completed_at", null)
}
