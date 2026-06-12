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

  const portalUrl = `${appUrl()}/portal/login`
  const filesCount = (r.files as unknown[] | null)?.length ?? 0
  const linksCount = (r.external_links as unknown[] | null)?.length ?? 0

  const summaryParts: string[] = []
  if (filesCount > 0)
    summaryParts.push(`${filesCount} archivo${filesCount === 1 ? "" : "s"}`)
  if (linksCount > 0)
    summaryParts.push(`${linksCount} enlace${linksCount === 1 ? "" : "s"}`)
  const summary = summaryParts.length > 0 ? summaryParts.join(" + ") : "tu material"

  // Contenido interno — el marco luxury minimalista (logo + footer) lo añade
  // `resolveTemplate`. Sin tarjeta ni barras de color aquí.
  const html = `
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#A1A1A6">Entrega lista</p>
  <h1>¡Tu entrega está lista! ✨</h1>
  <p>Hola <strong>${escapeHtml(client.name ?? "")}</strong>,</p>
  <p>Tu entrega <strong>${escapeHtml(r.title ?? "")}</strong> ya está disponible en tu portal privado: <strong>${escapeHtml(summary)}</strong> listos para ti.</p>
  ${r.description
    ? `<p style="margin:0 0 16px;padding:14px 16px;background:#F7F7F9;border:1px solid #ECECEF;border-radius:12px;font-size:13px;color:#52525b">${escapeHtml(String(r.description))}</p>`
    : ""}
  <p style="text-align:center;margin:28px 0 6px"><a class="btn" href="${portalUrl}">Ver mi entrega</a></p>`

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
