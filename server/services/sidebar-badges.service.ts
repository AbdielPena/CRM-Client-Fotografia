import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { countOpenBookingRequests } from "./booking-request.service"

/**
 * Contadores de "novedad" por sección para los badges del sidebar.
 * Devuelve un mapa href → número. Cada cuenta es best-effort: si una falla,
 * cae a 0 y no rompe el layout.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Galerías de selección con la selección ya enviada por el cliente y que aún
 * NO tienen una entrega final publicada → te falta procesarlas. Se limpia solo
 * cuando publicas la galería de entrega final del mismo proyecto.
 */
async function countPendingSelections(sb: Sb, studioId: string): Promise<number> {
  const { data: sel } = await sb
    .from("galleries")
    .select("id, project_id")
    .eq("studio_id", studioId)
    .eq("gallery_type", "selection")
    .eq("selection_submitted", true)
    .eq("status", "published")
    .is("deleted_at", null)
  const rows = (sel ?? []) as Array<{ id: string; project_id: string | null }>
  if (rows.length === 0) return 0

  const projectIds = Array.from(
    new Set(rows.map((r) => r.project_id).filter((p): p is string => !!p)),
  )
  let delivered = new Set<string>()
  if (projectIds.length > 0) {
    const { data: fin } = await sb
      .from("galleries")
      .select("project_id")
      .eq("studio_id", studioId)
      .not("delivery_ready_at", "is", null)
      .eq("status", "published")
      .is("deleted_at", null)
      .in("project_id", projectIds)
    delivered = new Set(
      ((fin ?? []) as Array<{ project_id: string | null }>)
        .map((r) => r.project_id)
        .filter((p): p is string => !!p),
    )
  }
  return rows.filter((r) => !r.project_id || !delivered.has(r.project_id)).length
}

/** Tareas vencidas o que vencen hoy, sin completar. */
async function countTasksDue(sb: Sb, studioId: string, today: string): Promise<number> {
  const { count } = await sb
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .lte("due_date", today)
    .in("status", ["pendiente", "en_progreso"])
  return count ?? 0
}

/** Etapas del pipeline (tareas con workflow_stage) vencidas y sin completar. */
async function countOverdueStages(sb: Sb, studioId: string, today: string): Promise<number> {
  const { count } = await sb
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .not("workflow_stage", "is", null)
    .lt("due_date", today)
    .in("status", ["pendiente", "en_progreso"])
  return count ?? 0
}

/** Conversaciones de correo con mensajes sin leer. */
async function countUnreadMail(sb: Sb, studioId: string): Promise<number> {
  const { count } = await sb
    .from("mail_threads")
    .select("id", { count: "exact", head: true })
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .gt("unread_count", 0)
  return count ?? 0
}

/** Canales de chat con mensajes nuevos desde la última lectura del usuario. */
async function countUnreadChat(sb: Sb, studioId: string, userId: string): Promise<number> {
  const { data } = await sb
    .from("chat_channel_members")
    .select("last_read_at, channel:chat_channels(last_message_at, studio_id, is_archived)")
    .eq("user_id", userId)
  type Ch = { last_message_at: string | null; studio_id: string; is_archived: boolean }
  const rows = (data ?? []) as Array<{ last_read_at: string | null; channel: Ch | Ch[] | null }>
  let n = 0
  for (const r of rows) {
    const ch = Array.isArray(r.channel) ? r.channel[0] : r.channel
    if (!ch || ch.is_archived || ch.studio_id !== studioId || !ch.last_message_at) continue
    if (!r.last_read_at || new Date(ch.last_message_at) > new Date(r.last_read_at)) n++
  }
  return n
}

export async function getSidebarBadges(
  studioId: string,
  userId: string,
): Promise<Record<string, number>> {
  const sb = untypedService()
  const today = todayStr()

  const [bookings, galleries, tasks, deliveries, mail, chat] = await Promise.all([
    countOpenBookingRequests(studioId).catch(() => 0),
    countPendingSelections(sb, studioId).catch(() => 0),
    countTasksDue(sb, studioId, today).catch(() => 0),
    countOverdueStages(sb, studioId, today).catch(() => 0),
    countUnreadMail(sb, studioId).catch(() => 0),
    countUnreadChat(sb, studioId, userId).catch(() => 0),
  ])

  return {
    "/bookings": bookings,
    "/galleries": galleries,
    "/tasks": tasks,
    "/deliveries": deliveries,
    "/mail/inbox": mail,
    "/chat": chat,
  }
}
