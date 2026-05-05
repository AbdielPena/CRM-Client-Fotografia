/**
 * Email automático al cliente cuando una entrega pasa a 'delivered'.
 */

import "server-only"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { enqueueEmail } from "@/server/services/email.service"
import { resolveTemplate } from "@/server/services/email-template.service"

function appUrl(): string {
  return (process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export async function onDeliveryDelivered(deliveryId: string): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { data: row } = await supabase
    .from("client_deliveries")
    .select(
      "id, studio_id, client_id, title, description, files, external_links",
    )
    .eq("id", deliveryId)
    .maybeSingle()
  if (!row) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = row as any

  const { data: clientRow } = await supabase
    .from("clients")
    .select("name, email")
    .eq("id", r.client_id)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = clientRow as any
  if (!client?.email) return

  const { data: studioRow } = await supabase
    .from("studios")
    .select("name, email, primary_color")
    .eq("id", r.studio_id)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const studio = studioRow as any
  const studioName = studio?.name ?? "Tu fotógrafo"
  const studioEmail = studio?.email ?? null
  const accent = studio?.primary_color ?? "#0D0E14"

  const portalUrl = `${appUrl()}/portal/login`
  const filesCount = (r.files as unknown[] | null)?.length ?? 0
  const linksCount = (r.external_links as unknown[] | null)?.length ?? 0

  const summaryParts: string[] = []
  if (filesCount > 0)
    summaryParts.push(`${filesCount} archivo${filesCount === 1 ? "" : "s"}`)
  if (linksCount > 0)
    summaryParts.push(`${linksCount} enlace${linksCount === 1 ? "" : "s"}`)
  const summary = summaryParts.length > 0 ? summaryParts.join(" + ") : "tu material"

  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;background:#fafafa;padding:24px;color:#18181b">
    <div style="background:white;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7">
      <div style="background:linear-gradient(135deg,${accent},${accent}cc);padding:28px 24px;color:white">
        <h1 style="margin:0;font-size:20px;font-weight:600">¡Tu entrega está lista!</h1>
        <p style="margin:6px 0 0;opacity:.85;font-size:14px">${escapeHtml(studioName)}</p>
      </div>
      <div style="padding:28px 24px">
        <p style="margin:0 0 12px">Hola <strong>${escapeHtml(client.name ?? "")}</strong>,</p>
        <p style="margin:0 0 16px;line-height:1.55">
          Tu entrega <strong>${escapeHtml(r.title ?? "")}</strong> ya está disponible
          en tu portal privado: ${escapeHtml(summary)} listos para ti.
        </p>
        ${r.description
          ? `<p style="margin:0 0 16px;font-size:13px;color:#52525b;background:#fafafa;padding:12px;border-radius:8px">${escapeHtml(String(r.description))}</p>`
          : ""}
        <div style="text-align:center;margin:20px 0">
          <a href="${portalUrl}" style="display:inline-block;background:${accent};color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">
            Ver entrega →
          </a>
        </div>
      </div>
      <div style="background:#fafafa;padding:14px 24px;border-top:1px solid #e4e4e7;text-align:center">
        <p style="margin:0;font-size:11.5px;color:#a1a1aa">
          Enviado por ${escapeHtml(studioName)}
        </p>
      </div>
    </div>
  </div>`

  // Resolver plantilla del studio o usar default hardcoded
  const tpl = await resolveTemplate(
    r.studio_id,
    "delivery_ready",
    {
      client_name: client.name ?? "",
      delivery_title: r.title ?? "",
      portal_url: portalUrl,
      studio_name: studioName,
    },
    {
      subject: `${r.title} — tu entrega está lista`,
      bodyHtml: html,
    },
  )

  await enqueueEmail({
    studioId: r.studio_id,
    toEmail: client.email,
    toName: client.name ?? undefined,
    fromEmail: studioEmail,
    fromName: tpl.fromName ?? studioName,
    replyTo: tpl.replyTo ?? studioEmail,
    subject: tpl.subject,
    bodyHtml: tpl.bodyHtml,
    relatedEntityType: "delivery",
    relatedEntityId: r.id,
  })

  // Notif in-app al studio (registro del envío)
  await supabase.from("notifications").insert({
    studio_id: r.studio_id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type: "delivery_ready" as any,
    title: "Entrega enviada",
    body: `Notificaste al cliente que "${r.title}" está lista.`,
    related_entity_type: "delivery",
    related_entity_id: r.id,
  })
}
