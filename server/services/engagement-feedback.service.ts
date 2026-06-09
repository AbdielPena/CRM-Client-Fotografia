import "server-only"

import { randomUUID } from "crypto"

import { untypedService } from "@/server/supabase/untyped"

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

/** Registra la calificación. Devuelve la URL de reseña pública si aplica. */
export async function submitFeedback(
  token: string,
  stars: number,
  comment?: string | null,
): Promise<{ ok: boolean; redirectUrl: string | null; goPublic: boolean }> {
  const sb = untypedService()
  const { data: fbRaw } = await sb
    .from("engagement_feedback")
    .select("id, studio_id")
    .eq("token", token)
    .maybeSingle()
  const fb = fbRaw as { id: string; studio_id: string } | null
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

  await sb
    .from("engagement_feedback")
    .update({
      stars,
      comment: comment ?? null,
      review_platform: platform,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", fb.id)

  return { ok: true, redirectUrl, goPublic }
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
