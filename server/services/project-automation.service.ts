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
