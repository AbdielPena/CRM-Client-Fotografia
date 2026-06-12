/**
 * Emails relacionados al portal del cliente.
 * Se separa del client-portal.service.ts para evitar ciclos de import con
 * email/templates services.
 */

import "server-only"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { enqueueEmail } from "@/server/services/email.service"
import { resolveTemplate } from "@/server/services/email-template.service"

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function appUrl(): string {
  return (
    process.env["NEXT_PUBLIC_APP_URL"] ??
    "http://localhost:3000"
  ).replace(/\/+$/, "")
}

/**
 * Envía al cliente su código de acceso al portal privado.
 */
export async function sendClientPortalAccessEmail(params: {
  studioId: string
  clientId: string
  clientName: string
  clientEmail: string
  accessCode: string
}): Promise<void> {
  const { studioId, clientId, clientName, clientEmail, accessCode } = params

  // Cargar studio para From + branding
  const supabase = createSupabaseServiceClient()
  const { data: studio } = await supabase
    .from("studios")
    .select("name, email, logo_url, primary_color")
    .eq("id", studioId)
    .maybeSingle()
  const s = studio as
    | { name: string; email: string | null; logo_url: string | null; primary_color: string | null }
    | null
  const studioName = s?.name ?? "Tu fotógrafo"
  const studioEmail = s?.email ?? null

  const portalLogin = `${appUrl()}/portal/login?email=${encodeURIComponent(clientEmail)}&code=${encodeURIComponent(accessCode)}`
  const portalShort = `${appUrl()}/portal/login`

  // Contenido interno — el marco luxury minimalista (logo + footer) lo añade
  // `resolveTemplate`. Aquí solo el cuerpo, sin tarjeta ni colores.
  const defaultBodyHtml = `
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#A1A1A6">Acceso privado</p>
  <h1>Tu portal privado</h1>
  <p>Hola <strong>${escapeHtml(clientName)}</strong>,</p>
  <p>Te creamos un acceso privado donde vas a poder ver tus <strong>galerías</strong>, <strong>fotos editadas</strong>, <strong>contratos</strong>, <strong>facturas</strong>, <strong>pagos</strong> y <strong>reservas</strong> en un solo lugar.</p>

  <div style="margin:26px 0;padding:20px 24px;background:#F7F7F9;border:1px solid #ECECEF;border-radius:16px;text-align:center">
    <p style="margin:0;font-size:11px;font-weight:600;color:#A1A1A6;text-transform:uppercase;letter-spacing:.08em">Tu código de acceso</p>
    <p style="margin:8px 0 0;font-family:ui-monospace,SFMono-Regular,monospace;font-size:28px;font-weight:700;letter-spacing:.2em;color:#1C1C1C">${escapeHtml(accessCode)}</p>
  </div>

  <p style="text-align:center;margin:24px 0 6px"><a class="btn" href="${portalLogin}">Entrar a mi portal</a></p>

  <p style="margin:18px 0 0;font-size:13px;color:#6E6E73;line-height:1.6">
    También puedes entrar manualmente en <a href="${portalShort}">${portalShort.replace(/^https?:\/\//, "")}</a> con tu email (<strong>${escapeHtml(clientEmail)}</strong>) y el código de arriba.
  </p>`

  // Resolver plantilla del studio (si fue editada) o usar default
  const tpl = await resolveTemplate(
    studioId,
    "client_portal_access",
    {
      client_name: clientName,
      client_email: clientEmail,
      studio_name: studioName,
      access_code: accessCode,
      portal_url: portalShort,
    },
    {
      subject: `Tu acceso al portal de ${studioName}`,
      bodyHtml: defaultBodyHtml,
    },
  )

  await enqueueEmail({
    studioId,
    toEmail: clientEmail,
    toName: clientName,
    fromEmail: studioEmail,
    fromName: tpl.fromName ?? studioName,
    replyTo: tpl.replyTo ?? studioEmail,
    subject: tpl.subject,
    bodyHtml: tpl.bodyHtml,
    relatedEntityType: "client",
    relatedEntityId: clientId,
  })

  // Marcar timestamp de envío
  await supabase
    .from("clients")
    .update({ access_code_sent_at: new Date().toISOString() })
    .eq("id", clientId)
    .eq("studio_id", studioId)
}
