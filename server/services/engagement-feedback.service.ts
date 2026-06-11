import "server-only"

import { randomUUID } from "crypto"

import { untypedService } from "@/server/supabase/untyped"
import { enqueueEmail } from "./email.service"
import { resolveTemplate, TEMPLATE_CATALOG } from "./email-template.service"

/**
 * Engagement Hub Fase 4: feedback con estrellas + reseñas.
 * El cliente abre /fb/<token> (link {{review_link}} del email), califica:
 *   >= review_min_stars → redirige a Google/Facebook review
 *   <  review_min_stars → captura comentario interno (no público)
 */

function appUrl(): string {
  return (process.env["NEXT_PUBLIC_APP_URL"] ?? "https://my.abbypixel.com").replace(/\/+$/, "")
}

export function feedbackUrl(token: string): string {
  return `${appUrl()}/fb/${token}`
}

/** Crea (o reusa una pendiente) la solicitud de feedback de un cliente. */
export async function getOrCreateFeedbackToken(
  studioId: string,
  clientId: string,
  automationId?: string | null,
): Promise<string> {
  const sb = untypedService()
  const { data: existing } = await sb
    .from("engagement_feedback")
    .select("token")
    .eq("studio_id", studioId)
    .eq("client_id", clientId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing) return (existing as { token: string }).token

  const token = randomUUID().replace(/-/g, "")
  await sb.from("engagement_feedback").insert({
    studio_id: studioId,
    client_id: clientId,
    automation_id: automationId ?? null,
    token,
  })
  return token
}

export interface ReviewConfig {
  googleUrl: string | null
  facebookUrl: string | null
  minStars: number
}

export async function getReviewConfig(studioId: string): Promise<ReviewConfig> {
  const sb = untypedService()
  const { data } = await sb
    .from("engagement_config")
    .select("review_google_url, review_facebook_url, review_min_stars")
    .eq("studio_id", studioId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data as any
  return {
    googleUrl: r?.review_google_url ?? null,
    facebookUrl: r?.review_facebook_url ?? null,
    minStars: r?.review_min_stars ?? 4,
  }
}

export async function setReviewConfig(
  studioId: string,
  input: { googleUrl: string | null; facebookUrl: string | null },
): Promise<void> {
  const sb = untypedService()
  await sb.from("engagement_config").upsert(
    {
      studio_id: studioId,
      review_google_url: input.googleUrl,
      review_facebook_url: input.facebookUrl,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "studio_id" },
  )
}

export interface FeedbackPublicState {
  studioName: string
  status: string
  stars: number | null
  googleUrl: string | null
  facebookUrl: string | null
  minStars: number
}

/** Estado público de una solicitud de feedback (por token). */
export async function getFeedbackState(token: string): Promise<FeedbackPublicState | null> {
  const sb = untypedService()
  const { data: fbRaw } = await sb
    .from("engagement_feedback")
    .select("id, studio_id, status, stars")
    .eq("token", token)
    .maybeSingle()
  const fb = fbRaw as { id: string; studio_id: string; status: string; stars: number | null } | null
  if (!fb) return null
  const { data: studioRow } = await sb.from("studios").select("name").eq("id", fb.studio_id).maybeSingle()
  const cfg = await getReviewConfig(fb.studio_id)
  return {
    studioName: (studioRow as { name?: string } | null)?.name ?? "el estudio",
    status: fb.status,
    stars: fb.stars,
    googleUrl: cfg.googleUrl,
    facebookUrl: cfg.facebookUrl,
    minStars: cfg.minStars,
  }
}

/** Mínimo de caracteres del comentario para que la reseña se auto-publique. */
const MIN_PUBLISHABLE_COMMENT_LEN = 30

/** Transforma "María González Pérez" → "María G." (privacidad pública). */
export function publicDisplayName(fullName: string | null | undefined): string {
  if (!fullName) return "Cliente"
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  const first = parts[0]
  const lastInitial = (parts[parts.length - 1] ?? "").charAt(0).toUpperCase()
  return lastInitial ? `${first} ${lastInitial}.` : first
}

/**
 * Busca la foto representativa para la reseña pública.
 * Prioridad: última entrega del cliente con files/external_links → avatar del cliente.
 */
async function pickReviewPhoto(
  studioId: string,
  clientId: string,
): Promise<{ photoUrl: string | null; projectId: string | null; projectTitle: string | null }> {
  const sb = untypedService()
  // Última entrega del cliente con files
  const { data: delivRows } = await sb
    .from("client_deliveries")
    .select("project_id, files, external_links, delivered_at, created_at")
    .eq("studio_id", studioId)
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("delivered_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(5)
  const deliveries = (delivRows ?? []) as Array<{
    project_id: string | null
    files: unknown
    external_links: unknown
    delivered_at: string | null
  }>

  function firstUrl(field: unknown): string | null {
    if (!Array.isArray(field)) return null
    for (const item of field) {
      if (typeof item === "string") return item
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>
        const url = (o["url"] ?? o["src"] ?? o["href"] ?? o["thumbnail"]) as string | undefined
        if (typeof url === "string" && url) return url
      }
    }
    return null
  }

  let photoUrl: string | null = null
  let projectId: string | null = null
  for (const d of deliveries) {
    const url = firstUrl(d.files) ?? firstUrl(d.external_links)
    if (url) {
      photoUrl = url
      projectId = d.project_id
      break
    }
    if (!projectId) projectId = d.project_id
  }

  if (!photoUrl) {
    const { data: cliRow } = await sb
      .from("clients")
      .select("avatar_url")
      .eq("id", clientId)
      .maybeSingle()
    photoUrl = (cliRow as { avatar_url?: string | null } | null)?.avatar_url ?? null
  }

  let projectTitle: string | null = null
  if (projectId) {
    const { data: pr } = await sb.from("projects").select("name").eq("id", projectId).maybeSingle()
    projectTitle = (pr as { name?: string | null } | null)?.name ?? null
  }
  return { photoUrl, projectId, projectTitle }
}

/** Registra la calificación. Devuelve la URL de reseña pública si aplica. */
export async function submitFeedback(
  token: string,
  stars: number,
  comment?: string | null,
): Promise<{ ok: boolean; redirectUrl: string | null; goPublic: boolean; published: boolean }> {
  const sb = untypedService()
  const { data: fbRaw } = await sb
    .from("engagement_feedback")
    .select("id, studio_id, client_id")
    .eq("token", token)
    .maybeSingle()
  const fb = fbRaw as { id: string; studio_id: string; client_id: string | null } | null
  if (!fb) throw new Error("Token inválido")

  const cfg = await getReviewConfig(fb.studio_id)
  const goPublic = stars >= cfg.minStars
  let platform: "google" | "facebook" | "internal" = "internal"
  let redirectUrl: string | null = null
  if (goPublic) {
    if (cfg.googleUrl) {
      platform = "google"
      redirectUrl = cfg.googleUrl
    } else if (cfg.facebookUrl) {
      platform = "facebook"
      redirectUrl = cfg.facebookUrl
    }
  }

  // Auto-publicar en la web: estrellas ≥ umbral + comentario significativo.
  const trimmed = (comment ?? "").trim()
  const publishable = goPublic && trimmed.length >= MIN_PUBLISHABLE_COMMENT_LEN
  const nowIso = new Date().toISOString()

  type FeedbackPatch = {
    stars: number
    comment: string | null
    review_platform: "google" | "facebook" | "internal"
    status: "submitted"
    submitted_at: string
    published?: boolean
    published_at?: string
    display_name?: string
    photo_url?: string | null
    project_id?: string | null
    project_title?: string | null
  }

  const patch: FeedbackPatch = {
    stars,
    comment: trimmed || null,
    review_platform: platform,
    status: "submitted",
    submitted_at: nowIso,
  }

  if (publishable && fb.client_id) {
    const { data: cliRow } = await sb
      .from("clients")
      .select("name")
      .eq("id", fb.client_id)
      .maybeSingle()
    const fullName = (cliRow as { name?: string | null } | null)?.name ?? null
    const { photoUrl, projectId, projectTitle } = await pickReviewPhoto(fb.studio_id, fb.client_id)
    patch.published = true
    patch.published_at = nowIso
    patch.display_name = publicDisplayName(fullName)
    patch.photo_url = photoUrl
    patch.project_id = projectId
    patch.project_title = projectTitle
  }

  await sb.from("engagement_feedback").update(patch).eq("id", fb.id)

  return { ok: true, redirectUrl, goPublic, published: !!patch.published }
}

export interface FeedbackSummary {
  count: number
  avg: number
  recent: Array<{ stars: number | null; comment: string | null; platform: string | null; clientName: string; at: string | null }>
}

export async function getFeedbackSummary(studioId: string): Promise<FeedbackSummary> {
  const sb = untypedService()
  const { data } = await sb
    .from("engagement_feedback")
    .select("stars, comment, review_platform, submitted_at, client_id")
    .eq("studio_id", studioId)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false })
    .limit(20)
  const rows = (data ?? []) as Array<{
    stars: number | null
    comment: string | null
    review_platform: string | null
    submitted_at: string | null
    client_id: string | null
  }>
  const withStars = rows.filter((r) => r.stars != null)
  const avg = withStars.length ? withStars.reduce((a, r) => a + (r.stars ?? 0), 0) / withStars.length : 0

  // nombres de cliente
  const ids = [...new Set(rows.map((r) => r.client_id).filter(Boolean))] as string[]
  const names: Record<string, string> = {}
  if (ids.length) {
    const { data: cs } = await sb.from("clients").select("id, name").in("id", ids)
    for (const c of (cs ?? []) as Array<{ id: string; name: string }>) names[c.id] = c.name
  }

  return {
    count: withStars.length,
    avg,
    recent: rows.slice(0, 8).map((r) => ({
      stars: r.stars,
      comment: r.comment,
      platform: r.review_platform,
      clientName: r.client_id ? (names[r.client_id] ?? "Cliente") : "Cliente",
      at: r.submitted_at,
    })),
  }
}

/**
 * Envía el email "engagement_review_request" Y el WhatsApp "solicitud_resena"
 * al cliente con su link /fb/<token>. Lo dispara el hook de `setProjectStatus`
 * cuando el proyecto pasa a "completado". Es idempotente: reusa token pendiente.
 */
export async function sendReviewRequestEmail(
  studioId: string,
  clientId: string,
  projectId: string | null,
): Promise<void> {
  const sb = untypedService()
  const { data: clientRow } = await sb
    .from("clients")
    .select("name, email, phone")
    .eq("id", clientId)
    .maybeSingle()
  const client = clientRow as { name: string | null; email: string | null; phone: string | null } | null
  if (!client) return

  const { data: studioRow } = await sb.from("studios").select("name").eq("id", studioId).maybeSingle()
  const studioName = (studioRow as { name?: string } | null)?.name ?? ""

  const token = await getOrCreateFeedbackToken(studioId, clientId)
  const link = feedbackUrl(token)

  // ─── 1) Email ─────────────────────────────────────────────────────────
  if (client.email) {
    const vars = {
      client_name: client.name ?? "",
      review_link: link,
      studio_name: studioName,
    }
    const defaults = TEMPLATE_CATALOG.engagement_review_request
    const tpl = await resolveTemplate(studioId, "engagement_review_request", vars, {
      subject: defaults.defaultSubject,
      bodyHtml: defaults.defaultBodyHtml,
    })
    await enqueueEmail({
      studioId,
      toEmail: client.email,
      toName: client.name,
      subject: tpl.subject,
      bodyHtml: tpl.bodyHtml,
      fromName: tpl.fromName,
      replyTo: tpl.replyTo,
      templateSlug: "engagement_review_request",
      relatedEntityType: projectId ? "project" : "client",
      relatedEntityId: projectId ?? clientId,
    })
  }

  // ─── 2) WhatsApp (plantilla "solicitud_resena") ───────────────────────
  // Best-effort: si WA no está configurado o el cliente no tiene teléfono,
  // simplemente no se envía. No queremos romper el flujo principal.
  if (client.phone) {
    try {
      const { sendTemplateMessage } = await import("./whatsapp/cloud-api.service")
      await sendTemplateMessage(
        studioId,
        client.phone,
        "solicitud_resena",
        "es",
        [client.name ?? "amig@"],
      )
    } catch (err) {
      console.error("[engagement] WhatsApp review request failed", err)
    }
  }
}

export interface AdminReview {
  id: string
  stars: number | null
  comment: string | null
  displayName: string | null
  photoUrl: string | null
  projectTitle: string | null
  published: boolean
  publishedAt: string | null
  submittedAt: string | null
  reviewPlatform: string | null
  createdVia: string
}

/** Lista TODAS las reseñas del studio (panel admin). */
export async function listAllReviews(studioId: string, limit = 100): Promise<AdminReview[]> {
  const sb = untypedService()
  const { data } = await sb
    .from("engagement_feedback")
    .select(
      "id, stars, comment, display_name, photo_url, project_title, published, published_at, submitted_at, review_platform, created_via, status",
    )
    .eq("studio_id", studioId)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false })
    .limit(limit)
  return ((data ?? []) as Array<{
    id: string
    stars: number | null
    comment: string | null
    display_name: string | null
    photo_url: string | null
    project_title: string | null
    published: boolean
    published_at: string | null
    submitted_at: string | null
    review_platform: string | null
    created_via: string
  }>).map((r) => ({
    id: r.id,
    stars: r.stars,
    comment: r.comment,
    displayName: r.display_name,
    photoUrl: r.photo_url,
    projectTitle: r.project_title,
    published: r.published,
    publishedAt: r.published_at,
    submittedAt: r.submitted_at,
    reviewPlatform: r.review_platform,
    createdVia: r.created_via,
  }))
}

/** Crea reseña manual (created_via='manual'). Auto-publica por defecto. */
export async function createManualReview(
  studioId: string,
  input: {
    stars: number
    comment: string
    displayName: string
    photoUrl?: string | null
    projectTitle?: string | null
    published?: boolean
  },
): Promise<string> {
  const sb = untypedService()
  const nowIso = new Date().toISOString()
  const published = input.published ?? true
  const token = randomUUID().replace(/-/g, "")
  const { data, error } = await sb
    .from("engagement_feedback")
    .insert({
      studio_id: studioId,
      token,
      stars: input.stars,
      comment: input.comment.trim(),
      display_name: input.displayName.trim(),
      photo_url: input.photoUrl ?? null,
      project_title: input.projectTitle ?? null,
      review_platform: "internal",
      status: "submitted",
      submitted_at: nowIso,
      published,
      published_at: published ? nowIso : null,
      created_via: "manual",
    })
    .select("id")
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

/** Actualiza campos de una reseña (publish/unpublish/edit). */
export async function updateReview(
  studioId: string,
  id: string,
  patch: {
    stars?: number
    comment?: string
    displayName?: string
    photoUrl?: string | null
    projectTitle?: string | null
    published?: boolean
  },
): Promise<void> {
  const sb = untypedService()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbPatch: Record<string, any> = {}
  if (patch.stars != null) dbPatch.stars = patch.stars
  if (patch.comment != null) dbPatch.comment = patch.comment.trim()
  if (patch.displayName != null) dbPatch.display_name = patch.displayName.trim()
  if (patch.photoUrl !== undefined) dbPatch.photo_url = patch.photoUrl
  if (patch.projectTitle !== undefined) dbPatch.project_title = patch.projectTitle
  if (patch.published != null) {
    dbPatch.published = patch.published
    dbPatch.published_at = patch.published ? new Date().toISOString() : null
  }
  if (Object.keys(dbPatch).length === 0) return
  const { error } = await sb
    .from("engagement_feedback")
    .update(dbPatch)
    .eq("id", id)
    .eq("studio_id", studioId)
  if (error) throw error
}

/** Elimina reseña. */
export async function deleteReview(studioId: string, id: string): Promise<void> {
  const sb = untypedService()
  const { error } = await sb
    .from("engagement_feedback")
    .delete()
    .eq("id", id)
    .eq("studio_id", studioId)
  if (error) throw error
}

/**
 * Heurística: ¿este label de status indica "proyecto completado"?
 * Compara case/accent-insensitive contra variantes comunes en ES/EN.
 */
export function isCompletedStatusLabel(label: string | null | undefined): boolean {
  if (!label) return false
  const norm = label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
  return [
    "completado",
    "completada",
    "completed",
    "entregado",
    "entregada",
    "delivered",
    "finalizado",
    "finalizada",
    "terminado",
    "terminada",
    "done",
  ].includes(norm)
}
