import "server-only"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { getProjectStatuses } from "@/server/services/project-status.service"
import { setProjectStatus } from "@/server/services/project-status.service"

/**
 * Intents semánticos del flujo del proyecto.
 * Mapean (vía keywords) al label custom del studio cuando hay match.
 * Si no hay match, la transición no se aplica (silencioso).
 */
export type ProjectIntent =
  | "consulta"
  | "reservado"
  | "sesion_realizada"
  | "esperando_seleccion"
  | "edicion"
  | "entregado"

const INTENT_KEYWORDS: Record<ProjectIntent, string[]> = {
  consulta: ["consulta", "inquiry", "lead", "inicial"],
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
 * Retorna null si ningún status del studio matchea.
 */
async function findStatusLabelByIntent(
  studioId: string,
  intent: ProjectIntent,
): Promise<string | null> {
  const statuses = await getProjectStatuses(studioId)
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

    await setProjectStatus(studioId, projectId, targetLabel)
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
 * Pago registrado → "Reservado" (1er pago) o "Sesión realizada" (2do+).
 * Cuenta los pagos completados del proyecto agregados sobre todas sus facturas.
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
  if (paymentsCount === 1) {
    await transitionProjectStatus(studioId, projectId, "reservado")
  } else if (paymentsCount >= 2) {
    await transitionProjectStatus(studioId, projectId, "sesion_realizada")
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
      const color = studio?.primary_color ?? "#7C3AED"
      const firstName = String(b.client_name ?? "").split(" ")[0] || ""
      const html = `
        <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
          <h1 style="font-size: 20px; margin: 0 0 8px;">¡Sesión confirmada${firstName ? `, ${escapeHtmlLocal(firstName)}` : ""}! 🎉</h1>
          <p style="color: #4b5563; margin: 0 0 16px;">
            Recibimos tu pago y tu sesión con <strong>${escapeHtmlLocal(studio?.name ?? "el estudio")}</strong>
            quedó <strong>confirmada</strong>. Te contactaremos con los detalles finales.
          </p>
          <p style="color: #6b7280; font-size: 13px; margin: 0;">¡Nos vemos pronto!</p>
        </div>`
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
