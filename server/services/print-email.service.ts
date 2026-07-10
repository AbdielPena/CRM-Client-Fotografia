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

// ---------------------------------------------------------------------------
// Proceso de impresiones: "selección recibida" y "impresiones listas".
// Cada uno manda el correo editable correspondiente + (si el canal de WhatsApp
// está conectado) espeja el aviso por WhatsApp. Best-effort e idempotente.
// ---------------------------------------------------------------------------

/**
 * Espeja un aviso de cara al cliente por WhatsApp (Cloud API transaccional).
 * Solo envía si el estudio tiene el canal conectado Y existe la plantilla de
 * Meta aprobada para ese `emailSlug`. Si no, no-op (el correo ya salió; el
 * WhatsApp manual sigue disponible desde el botón). Nunca lanza.
 */
async function mirrorPrintWhatsApp(
  studioId: string,
  clientPhone: string | null,
  firstName: string,
  emailSlug: string,
): Promise<boolean> {
  try {
    if (!clientPhone) return false
    const { WHATSAPP_BY_EMAIL_SLUG } = await import("@/lib/whatsapp/meta-templates")
    const tpl = WHATSAPP_BY_EMAIL_SLUG[emailSlug]
    if (!tpl) return false
    const { getWhatsAppStatus, sendTemplateMessage } = await import(
      "@/server/services/whatsapp/cloud-api.service"
    )
    const status = await getWhatsAppStatus(studioId)
    if (!status.connected) return false
    const r = await sendTemplateMessage(studioId, clientPhone, tpl.name, tpl.language, [
      firstName,
    ])
    return !!r.ok
  } catch (err) {
    console.error("[print] mirrorPrintWhatsApp", err)
    return false
  }
}

/**
 * Manda el correo (plantilla editable `slug`) de cara al cliente para un paso
 * del proceso de impresiones + espeja por WhatsApp. Devuelve qué se envió.
 * Con `expectStudioId` valida propiedad (para acciones del admin).
 */
async function sendPrintLifecycleEmail(
  galleryId: string,
  slug: "print_selection_received" | "prints_ready",
  expectStudioId?: string,
): Promise<{ emailed: boolean; waSent: boolean }> {
  const sb = createSupabaseServiceClient()
  const { data: gRow } = await sb
    .from("galleries")
    .select("id, studio_id, client_id, name")
    .eq("id", galleryId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = gRow as any
  if (!g) return { emailed: false, waSent: false }
  if (expectStudioId && g.studio_id !== expectStudioId) {
    return { emailed: false, waSent: false }
  }
  if (!g.client_id) return { emailed: false, waSent: false }

  const { data: clientRow } = await sb
    .from("clients")
    .select("name, email, phone")
    .eq("id", g.client_id)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = clientRow as any

  const { data: studioRow } = await sb
    .from("studios")
    .select("name, email")
    .eq("id", g.studio_id)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const studio = studioRow as any
  const studioName = studio?.name ?? "Tu fotógrafo"

  let emailed = false
  if (client?.email) {
    const catalog = TEMPLATE_CATALOG[slug]
    const { subject, bodyHtml, fromName, replyTo } = await resolveTemplate(
      g.studio_id,
      slug,
      {
        client_name: client.name ?? "",
        gallery_name: g.name ?? "",
        studio_name: studioName,
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
    emailed = true
  }

  const firstName = (client?.name ?? "").trim().split(/\s+/)[0] || ""
  const waSent = await mirrorPrintWhatsApp(g.studio_id, client?.phone ?? null, firstName, slug)
  return { emailed, waSent }
}

/**
 * El cliente ENVIÓ su selección de impresiones → confirmación al cliente
 * (correo `print_selection_received` + WhatsApp). Best-effort.
 */
export async function onPrintSelectionSubmitted(galleryId: string): Promise<void> {
  try {
    await sendPrintLifecycleEmail(galleryId, "print_selection_received")
  } catch (err) {
    console.error("[print] onPrintSelectionSubmitted", err)
  }
}

/**
 * Aviso "impresiones listas para retirar" → correo `prints_ready` + WhatsApp,
 * y marca `galleries.print_ready_at`. Disparado por el botón del estudio.
 */
export async function sendPrintsReadyNotification(
  galleryId: string,
  expectStudioId?: string,
): Promise<{ ok: boolean; emailed: boolean; waSent: boolean }> {
  const res = await sendPrintLifecycleEmail(galleryId, "prints_ready", expectStudioId)
  if (res.emailed || res.waSent) {
    try {
      // untypedService: print_ready_at no está en los tipos generados (columna nueva).
      const { untypedService } = await import("@/server/supabase/untyped")
      await untypedService()
        .from("galleries")
        .update({ print_ready_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", galleryId)
    } catch (err) {
      console.error("[print] set print_ready_at", err)
    }
  }
  return { ok: res.emailed || res.waSent, ...res }
}
