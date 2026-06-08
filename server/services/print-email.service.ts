/**
 * Email al cliente cuando se habilita la selección de impresiones
 * (al publicar la galería de entrega final, si el plan incluye impresos).
 */

import "server-only"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { enqueueEmail } from "@/server/services/email.service"
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
  const accent = studio?.primary_color ?? "#b08a3e"

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

  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;background:#faf7f2;padding:24px;color:#2a2017">
    <div style="background:white;border-radius:18px;overflow:hidden;border:1px solid #ece3d4">
      <div style="background:linear-gradient(135deg,${accent},${accent}cc);padding:28px 24px;color:white">
        <h1 style="margin:0;font-size:21px;font-weight:600">Elige tus fotos para impresión 🖼️</h1>
        <p style="margin:6px 0 0;opacity:.9;font-size:14px">${escapeHtml(studioName)}</p>
      </div>
      <div style="padding:28px 24px">
        <p style="margin:0 0 12px">Hola <strong>${escapeHtml(client.name ?? "")}</strong>,</p>
        <p style="margin:0 0 16px;line-height:1.6">
          ¡Tus fotos editadas ya están listas! Ahora puedes elegir desde tu galería
          cuáles quieres para <strong>portada de álbum, marcos e impresiones</strong>,
          según lo incluido en tu plan.
        </p>
        ${summaryLis ? `<div style="margin:0 0 16px;background:#faf7f2;border-radius:10px;padding:14px 16px">
          <p style="margin:0 0 6px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#9a7b45">Tu plan incluye</p>
          <ul style="margin:0;padding-left:18px;font-size:14px;color:#4a3c2a">${summaryLis}</ul>
        </div>` : ""}
        <div style="text-align:center;margin:22px 0">
          <a href="${galleryUrl}" style="display:inline-block;background:${accent};color:white;text-decoration:none;padding:13px 26px;border-radius:999px;font-weight:600;font-size:14px">
            Seleccionar mis impresiones →
          </a>
        </div>
        <p style="margin:0;font-size:12.5px;color:#8a7a64;text-align:center">
          Puedes ajustar tu selección hasta enviarla.
        </p>
      </div>
      <div style="background:#faf7f2;padding:14px 24px;border-top:1px solid #ece3d4;text-align:center">
        <p style="margin:0;font-size:11.5px;color:#b0a48e">Enviado por ${escapeHtml(studioName)}</p>
      </div>
    </div>
  </div>`

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
