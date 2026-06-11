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

  const start = (page - 1) * pageSize
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    counts,
  }
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
