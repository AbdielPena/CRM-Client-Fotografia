import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import {
  TEMPLATE_CATALOG,
  type TemplateSlug,
} from "@/server/services/email-template.service"

/**
 * Bandeja de correos salientes: todo lo que el sistema envió (o intentó
 * enviar) a los clientes, leído de email_queue y categorizado por la
 * categoría de su plantilla (engagement, gallery, delivery, …).
 */

export type OutgoingCategory =
  | "client"
  | "booking"
  | "contract"
  | "invoice"
  | "gallery"
  | "delivery"
  | "engagement"
  | "otros"

export const OUTGOING_CATEGORY_LABELS: Record<OutgoingCategory, string> = {
  engagement: "Engagement",
  gallery: "Galerías",
  delivery: "Entregas",
  contract: "Contratos",
  invoice: "Facturas",
  booking: "Reservas",
  client: "Clientes",
  otros: "Otros",
}

export function categoryForSlug(slug: string | null): OutgoingCategory {
  if (!slug) return "otros"
  const entry = TEMPLATE_CATALOG[slug as TemplateSlug]
  return (entry?.category as OutgoingCategory | undefined) ?? "otros"
}

export type OutgoingNotification = {
  id: string
  toEmail: string
  toName: string | null
  subject: string
  templateSlug: string | null
  templateLabel: string | null
  category: OutgoingCategory
  status: string
  sentAt: string | null
  failedAt: string | null
  lastError: string | null
  createdAt: string
  relatedEntityType: string | null
  relatedEntityId: string | null
}

export type OutgoingDetail = OutgoingNotification & {
  bodyHtml: string
  bodyText: string | null
  fromEmail: string | null
  fromName: string | null
}

type QueueRow = {
  id: string
  to_email: string
  to_name: string | null
  subject: string
  template_slug: string | null
  status: string
  sent_at: string | null
  failed_at: string | null
  last_error: string | null
  created_at: string
  related_entity_type: string | null
  related_entity_id: string | null
}

function mapRow(r: QueueRow): OutgoingNotification {
  const category = categoryForSlug(r.template_slug)
  const tpl = r.template_slug
    ? TEMPLATE_CATALOG[r.template_slug as TemplateSlug]
    : undefined
  return {
    id: r.id,
    toEmail: r.to_email,
    toName: r.to_name,
    subject: r.subject,
    templateSlug: r.template_slug,
    templateLabel: tpl?.label ?? null,
    category,
    status: r.status,
    sentAt: r.sent_at,
    failedAt: r.failed_at,
    lastError: r.last_error,
    createdAt: r.created_at,
    relatedEntityType: r.related_entity_type,
    relatedEntityId: r.related_entity_id,
  }
}

export async function listOutgoingNotifications(
  studioId: string,
  opts: { category?: OutgoingCategory | "all"; page?: number; pageSize?: number } = {},
): Promise<{ items: OutgoingNotification[]; total: number; counts: Record<string, number> }> {
  const sb = untypedService()
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 30))

  // Traemos los últimos N (cap razonable) y filtramos por categoría en memoria —
  // la categoría vive en el código (TEMPLATE_CATALOG), no en una columna.
  const { data } = await sb
    .from("email_queue")
    .select(
      "id, to_email, to_name, subject, template_slug, status, sent_at, failed_at, last_error, created_at, related_entity_type, related_entity_id",
    )
    .eq("studio_id", studioId)
    .order("created_at", { ascending: false })
    .limit(500)

  const all = ((data ?? []) as QueueRow[]).map(mapRow)

  const counts: Record<string, number> = { all: all.length }
  for (const n of all) counts[n.category] = (counts[n.category] ?? 0) + 1

  const filtered =
    !opts.category || opts.category === "all"
      ? all
      : all.filter((n) => n.category === opts.category)

  // Agrupar por cliente: los correos del mismo cliente quedan contiguos (para
  // que la UI pinte un encabezado por cliente), y los clientes se ordenan por
  // su correo más reciente. Dentro de cada cliente, lo más reciente primero.
  const clientKeyOf = (n: OutgoingNotification) =>
    (n.toName?.trim() || n.toEmail || "—").toLowerCase()
  const latestByClient = new Map<string, string>()
  for (const n of filtered) {
    const k = clientKeyOf(n)
    const d = n.sentAt ?? n.createdAt
    const prev = latestByClient.get(k)
    if (!prev || d > prev) latestByClient.set(k, d)
  }
  filtered.sort((a, b) => {
    const ka = clientKeyOf(a)
    const kb = clientKeyOf(b)
    if (ka !== kb) {
      const la = latestByClient.get(ka) ?? ""
      const lb = latestByClient.get(kb) ?? ""
      if (la !== lb) return lb.localeCompare(la) // cliente con correo más reciente primero
      return ka.localeCompare(kb)
    }
    return (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt)
  })

  const start = (page - 1) * pageSize
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    counts,
  }
}

// ============================================================================
// Vista organizada: Clientes (por sesión) + Del sistema (por tipo)
// ============================================================================

export type OrgSession = {
  projectId: string | null
  projectName: string | null
  eventDate: string | null
  items: OutgoingNotification[]
  lastAt: string
}
export type OrgClient = {
  key: string
  clientName: string
  clientEmail: string
  total: number
  lastAt: string
  sessions: OrgSession[]
}
export type OrgSystemGroup = {
  category: OutgoingCategory
  label: string
  items: OutgoingNotification[]
}
export type OrganizedOutgoing = {
  clients: OrgClient[]
  system: OrgSystemGroup[]
  clientCount: number
  systemCount: number
}

/**
 * Correos enviados organizados en dos bloques:
 *  - **Clientes**: correos cuyo destinatario es un cliente del estudio,
 *    agrupados por cliente y, dentro, por su sesión (proyecto). Resuelve el
 *    proyecto de cada correo siguiendo su entidad relacionada (gallery/invoice/
 *    contract/booking_request/form_response → su project_id; o project directo).
 *  - **Del sistema**: el resto (avisos al estudio, invitaciones a colaboradores,
 *    leads, pruebas), agrupados por tipo/categoría.
 */
export async function getOutgoingNotificationsOrganized(
  studioId: string,
): Promise<OrganizedOutgoing> {
  const sb = untypedService()

  const { data } = await sb
    .from("email_queue")
    .select(
      "id, to_email, to_name, subject, template_slug, status, sent_at, failed_at, last_error, created_at, related_entity_type, related_entity_id",
    )
    .eq("studio_id", studioId)
    .order("created_at", { ascending: false })
    .limit(500)
  const all = ((data ?? []) as QueueRow[]).map(mapRow)

  // Email interno del estudio → sus avisos van a "Del sistema".
  const { data: studioRow } = await sb
    .from("studios")
    .select("email")
    .eq("id", studioId)
    .maybeSingle()
  const studioEmail = ((studioRow as { email: string | null } | null)?.email ?? "")
    .trim()
    .toLowerCase()

  // Resolver project_id + client_id por entidad relacionada (lote por tipo).
  const idsByType: Record<string, Set<string>> = {}
  for (const n of all) {
    if (n.relatedEntityType && n.relatedEntityId) {
      ;(idsByType[n.relatedEntityType] ??= new Set()).add(n.relatedEntityId)
    }
  }
  const entityProject = new Map<string, string | null>()
  const entityClient = new Map<string, string | null>()
  const resolveVia = async (type: string, table: string, hasClient: boolean) => {
    const ids = idsByType[type]
    if (!ids || ids.size === 0) return
    const cols = hasClient ? "id, project_id, client_id" : "id, project_id"
    const { data: rows } = await sb.from(table).select(cols).in("id", [...ids])
    for (const r of (rows ?? []) as Array<{
      id: string
      project_id: string | null
      client_id?: string | null
    }>) {
      entityProject.set(`${type}:${r.id}`, r.project_id ?? null)
      if (hasClient) entityClient.set(`${type}:${r.id}`, r.client_id ?? null)
    }
  }
  await Promise.all([
    resolveVia("gallery", "galleries", true),
    resolveVia("invoice", "invoices", true),
    resolveVia("booking_request", "booking_requests", true),
    resolveVia("contract", "contracts", false),
    resolveVia("form_response", "form_responses", false),
  ])

  // Proyectos (directos + vía entidad) → nombre, fecha, client_id.
  const projectIds = new Set<string>()
  for (const n of all) {
    if (n.relatedEntityType === "project" && n.relatedEntityId) projectIds.add(n.relatedEntityId)
  }
  for (const v of entityProject.values()) if (v) projectIds.add(v)
  const projectMap = new Map<
    string,
    { name: string | null; eventDate: string | null; clientId: string | null }
  >()
  if (projectIds.size > 0) {
    const { data: projRows } = await sb
      .from("projects")
      .select("id, name, event_date, client_id")
      .in("id", [...projectIds])
    for (const p of (projRows ?? []) as Array<{
      id: string
      name: string | null
      event_date: string | null
      client_id: string | null
    }>) {
      projectMap.set(p.id, { name: p.name, eventDate: p.event_date, clientId: p.client_id })
    }
  }

  const projectIdForEmail = (n: OutgoingNotification): string | null => {
    if (!n.relatedEntityType || !n.relatedEntityId) return null
    if (n.relatedEntityType === "project") return n.relatedEntityId
    return entityProject.get(`${n.relatedEntityType}:${n.relatedEntityId}`) ?? null
  }
  const clientIdForEmail = (n: OutgoingNotification): string | null => {
    if (!n.relatedEntityType || !n.relatedEntityId) return null
    if (n.relatedEntityType === "client") return n.relatedEntityId
    const direct = entityClient.get(`${n.relatedEntityType}:${n.relatedEntityId}`)
    if (direct) return direct
    const pid = projectIdForEmail(n)
    return pid ? (projectMap.get(pid)?.clientId ?? null) : null
  }

  // Clientes (id → nombre/email) para los client_id resueltos.
  const clientIds = new Set<string>()
  for (const n of all) {
    const cid = clientIdForEmail(n)
    if (cid) clientIds.add(cid)
  }
  const clientById = new Map<string, { name: string | null; email: string | null }>()
  if (clientIds.size > 0) {
    const { data: clientRows } = await sb
      .from("clients")
      .select("id, name, email")
      .in("id", [...clientIds])
    for (const c of (clientRows ?? []) as Array<{
      id: string
      name: string | null
      email: string | null
    }>) {
      clientById.set(c.id, { name: c.name, email: c.email })
    }
  }

  const SYSTEM_TYPES = new Set(["lead", "project_collaborator"])
  // Es "del sistema" si: va al email interno del estudio, es un aviso *_studio,
  // es de lead/colaborador, o no se resuelve ningún cliente.
  const isSystemEmail = (n: OutgoingNotification, clientId: string | null): boolean => {
    if (studioEmail && (n.toEmail || "").trim().toLowerCase() === studioEmail) return true
    if (n.templateSlug && n.templateSlug.toLowerCase().includes("studio")) return true
    if (n.relatedEntityType && SYSTEM_TYPES.has(n.relatedEntityType)) return true
    return !clientId
  }

  const clientsMap = new Map<string, OrgClient>()
  const systemMap = new Map<OutgoingCategory, OrgSystemGroup>()
  let clientCount = 0
  let systemCount = 0

  for (const n of all) {
    const at = n.sentAt ?? n.createdAt
    const clientId = clientIdForEmail(n)
    if (!clientId || isSystemEmail(n, clientId)) {
      systemCount++
      let g = systemMap.get(n.category)
      if (!g) {
        g = { category: n.category, label: OUTGOING_CATEGORY_LABELS[n.category], items: [] }
        systemMap.set(n.category, g)
      }
      g.items.push(n)
      continue
    }
    clientCount++
    const c = clientById.get(clientId)
    let cg = clientsMap.get(clientId)
    if (!cg) {
      cg = {
        key: clientId,
        clientName: c?.name || n.toName || n.toEmail,
        clientEmail: c?.email || n.toEmail,
        total: 0,
        lastAt: at,
        sessions: [],
      }
      clientsMap.set(clientId, cg)
    }
    cg.total++
    if (at > cg.lastAt) cg.lastAt = at
    const pid = projectIdForEmail(n)
    const sessKey = pid ?? "__none__"
    let sg = cg.sessions.find((s) => (s.projectId ?? "__none__") === sessKey)
    if (!sg) {
      const pm = pid ? projectMap.get(pid) : null
      sg = {
        projectId: pid,
        projectName: pm?.name ?? null,
        eventDate: pm?.eventDate ?? null,
        items: [],
        lastAt: at,
      }
      cg.sessions.push(sg)
    }
    sg.items.push(n)
    if (at > sg.lastAt) sg.lastAt = at
  }

  const clients = [...clientsMap.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt))
  for (const c of clients) {
    c.sessions.sort((a, b) => b.lastAt.localeCompare(a.lastAt))
    for (const s of c.sessions) {
      s.items.sort((a, b) => (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt))
    }
  }
  const ORDER: OutgoingCategory[] = [
    "booking",
    "gallery",
    "delivery",
    "contract",
    "invoice",
    "engagement",
    "client",
    "otros",
  ]
  const system = [...systemMap.values()].sort(
    (a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category),
  )
  for (const g of system) {
    g.items.sort((a, b) => (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt))
  }

  return { clients, system, clientCount, systemCount }
}

export async function getOutgoingNotification(
  studioId: string,
  id: string,
): Promise<OutgoingDetail | null> {
  const sb = untypedService()
  const { data } = await sb
    .from("email_queue")
    .select(
      "id, to_email, to_name, subject, body_html, body_text, from_email, from_name, template_slug, status, sent_at, failed_at, last_error, created_at, related_entity_type, related_entity_id",
    )
    .eq("studio_id", studioId)
    .eq("id", id)
    .maybeSingle()
  if (!data) return null
  const r = data as QueueRow & {
    body_html: string
    body_text: string | null
    from_email: string | null
    from_name: string | null
  }
  return {
    ...mapRow(r),
    bodyHtml: r.body_html,
    bodyText: r.body_text,
    fromEmail: r.from_email,
    fromName: r.from_name,
  }
}
