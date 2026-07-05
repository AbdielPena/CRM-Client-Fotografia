/**
 * Email al cliente cuando se habilita la selección de impresiones
 * (al publicar la galería de entrega final, si el plan incluye impresos).
 */

import "server-only"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { enqueueEmail } from "@/server/services/email.service"
import { getEmailBranding } from "@/server/services/email-template.service"
import { wrapLuxuryEmail } from "@/lib/email/luxury-layout"
import { normalizeEntitlements } from "@/lib/print/entitlements"

function appUrl(): string {
  return (process.env["NEXT_PUBLIC_APP_URL"] ?? "https://my.abbypixel.com").replace(/\/+$/, "")
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export async function onPrintSelectionEnabled(galleryId: string): Promise<void> {
  const sb = createSupabaseServiceClient()
  const { data: gRow } = await sb
    .from("galleries")
    .select("id, studio_id, client_id, name, package_id")
    .eq("id", galleryId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = gRow as any
  if (!g?.client_id) return

  const { data: clientRow } = await sb
    .from("clients")
    .select("name, email")
    .eq("id", g.client_id)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = clientRow as any
  if (!client?.email) return

  const { data: studioRow } = await sb
    .from("studios")
    .select("name, email, primary_color")
    .eq("id", g.studio_id)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const studio = studioRow as any
  const studioName = studio?.name ?? "Tu fotógrafo"

  // Entitlements para el resumen
  let summaryLis = ""
  if (g.package_id) {
    const { data: pkg } = await sb
      .from("packages")
      .select("print_entitlements")
      .eq("id", g.package_id)
      .maybeSingle()
    const e = normalizeEntitlements((pkg as { print_entitlements?: unknown } | null)?.print_entitlements)
    const parts: string[] = []
    if (e.covers > 0) parts.push(`${e.covers} portada${e.covers === 1 ? "" : "s"} de álbum`)
    for (const f of e.frames) parts.push(`${f.qty} marco${f.qty === 1 ? "" : "s"} ${escapeHtml(f.size)}`)
    for (const [size, qty] of Object.entries(e.prints)) parts.push(`${qty} impresión${qty === 1 ? "" : "es"} ${escapeHtml(size)}`)
    summaryLis = parts.map((p) => `<li style="margin:4px 0">${p}</li>`).join("")
  }

  // Link a la galería (token de compartir activo) o al portal.
  let galleryUrl = `${appUrl()}/portal/login`
  const { data: tokRow } = await sb
    .from("gallery_share_tokens")
    .select("token")
    .eq("gallery_id", galleryId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const token = (tokRow as { token?: string } | null)?.token
  if (token) galleryUrl = `${appUrl()}/g/${token}`

  // Contenido interno + marco luxury minimalista compartido (logo + footer).
  const inner = `
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#A1A1A6">Impresiones</p>
  <h1>Elige tus fotos para impresión 🖼️</h1>
  <p>Hola <strong>${escapeHtml(client.name ?? "")}</strong>,</p>
  <p>¡Tus fotos editadas ya están listas! Ahora puedes elegir desde tu galería cuáles quieres para <strong>portada de álbum, marcos e impresiones</strong>, según lo incluido en tu plan.</p>
  ${summaryLis ? `<div style="margin:0 0 16px;background:#F7F7F9;border:1px solid #ECECEF;border-radius:12px;padding:16px 18px">
    <p style="margin:0 0 6px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#A1A1A6">Tu plan incluye</p>
    <ul style="margin:0;padding-left:18px;font-size:14px;color:#52525b">${summaryLis}</ul>
  </div>` : ""}
  <p style="text-align:center;margin:26px 0 6px"><a class="btn" href="${galleryUrl}">Seleccionar mis impresiones</a></p>
  <p style="margin:8px 0 0;font-size:12.5px;color:#A1A1A6;text-align:center">Puedes ajustar tu selección hasta enviarla.</p>
  <div style="margin:20px 0 0;padding:14px 16px;background:#F7F7F9;border:1px solid #ECECEF;border-radius:12px">
    <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#3f3f46">Entrega de impresiones</p>
    <p style="margin:0;font-size:12.5px;line-height:1.55;color:#52525b">La entrega de impresiones se realiza directamente en el estudio. Si deseas envío, este tendrá un costo adicional y estará sujeto a disponibilidad, ubicación y tiempos de entrega.</p>
  </div>`

  const branding = await getEmailBranding(g.studio_id)
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
    studioId: g.studio_id,
    toEmail: client.email,
    toName: client.name ?? undefined,
    fromEmail: studio?.email ?? null,
    fromName: studioName,
    replyTo: studio?.email ?? null,
    subject: `Elige tus fotos para impresión — ${g.name}`,
    bodyHtml: html,
    relatedEntityType: "gallery",
    relatedEntityId: galleryId,
  })
}
