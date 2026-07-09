/**
 * Email al cliente cuando se habilita la selección de impresiones
 * (al publicar la galería de entrega final, si el plan incluye impresos).
 *
 * Usa una plantilla EDITABLE desde Ajustes → Correos (slug
 * `print_selection_ready`): el estudio puede cambiar asunto y cuerpo. El
 * resumen del plan y el link a la galería se inyectan como variables.
 */

import "server-only"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { enqueueEmail } from "@/server/services/email.service"
import {
  resolveTemplate,
  TEMPLATE_CATALOG,
} from "@/server/services/email-template.service"
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
    .select("id, studio_id, client_id, name, package_id, project_id")
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

  // Resumen del plan (bloque dinámico → variable {{plan_summary}}). El plan puede
  // estar en la galería o, si no lo heredó, en el proyecto.
  let planSummary = ""
  let summaryPackageId = g.package_id as string | null
  if (!summaryPackageId && g.project_id) {
    const { data: proj } = await sb
      .from("projects")
      .select("package_id")
      .eq("id", g.project_id)
      .maybeSingle()
    summaryPackageId = (proj as { package_id?: string | null } | null)?.package_id ?? null
  }
  if (summaryPackageId) {
    const { data: pkg } = await sb
      .from("packages")
      .select("print_entitlements")
      .eq("id", summaryPackageId)
      .maybeSingle()
    const e = normalizeEntitlements((pkg as { print_entitlements?: unknown } | null)?.print_entitlements)
    const parts: string[] = []
    if (e.covers > 0) parts.push(`${e.covers} portada${e.covers === 1 ? "" : "s"} de álbum`)
    for (const f of e.frames) parts.push(`${f.qty} marco${f.qty === 1 ? "" : "s"} ${escapeHtml(f.size)}`)
    for (const [size, qty] of Object.entries(e.prints)) {
      if (e.print_modes[size] === "auto") {
        parts.push(`Impresiones ${escapeHtml(size)} — todas tus fotos entregadas`)
      } else if (qty > 0) {
        parts.push(`${qty} impresión${qty === 1 ? "" : "es"} ${escapeHtml(size)}`)
      }
    }
    if (parts.length) {
      const lis = parts.map((p) => `<li style="margin:4px 0">${p}</li>`).join("")
      planSummary =
        `<div style="margin:0 0 16px;background:#F7F7F9;border:1px solid #ECECEF;border-radius:12px;padding:16px 18px">` +
        `<p style="margin:0 0 6px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#A1A1A6">Tu plan incluye</p>` +
        `<ul style="margin:0;padding-left:18px;font-size:14px;color:#52525b">${lis}</ul></div>`
    }
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

  const catalog = TEMPLATE_CATALOG.print_selection_ready
  const { subject, bodyHtml, fromName, replyTo } = await resolveTemplate(
    g.studio_id,
    "print_selection_ready",
    {
      client_name: client.name ?? "",
      gallery_name: g.name ?? "",
      studio_name: studioName,
      plan_summary: planSummary,
      gallery_link: galleryUrl,
    },
    { subject: catalog.defaultSubject, bodyHtml: catalog.defaultBodyHtml },
  )

  await enqueueEmail({
    studioId: g.studio_id,
    toEmail: client.email,
    toName: client.name ?? undefined,
    fromEmail: studio?.email ?? null,
    fromName: fromName ?? studioName,
    replyTo: replyTo ?? studio?.email ?? null,
    subject,
    bodyHtml,
    relatedEntityType: "gallery",
    relatedEntityId: galleryId,
  })
}
