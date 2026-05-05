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
  const accent = s?.primary_color ?? "#0D0E14"

  const portalLogin = `${appUrl()}/portal/login?email=${encodeURIComponent(clientEmail)}&code=${encodeURIComponent(accessCode)}`
  const portalShort = `${appUrl()}/portal/login`

  // Resolver plantilla del studio (si la editó) o usar el HTML hardcoded por defecto
  const defaultBodyHtml = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;background:#fafafa;padding:24px;color:#18181b">
    <div style="background:white;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7">
      <div style="background:linear-gradient(135deg,${accent},${accent}cc);padding:28px 24px;color:white">
        <h1 style="margin:0;font-size:20px;font-weight:600">Tu portal privado</h1>
        <p style="margin:6px 0 0;opacity:.85;font-size:14px">${escapeHtml(studioName)}</p>
      </div>

      <div style="padding:28px 24px">
        <p style="margin:0 0 12px">Hola <strong>${escapeHtml(clientName)}</strong>,</p>
        <p style="margin:0 0 16px;line-height:1.55">
          Te creamos un acceso privado donde vas a poder ver tus
          <strong>galerías</strong>, <strong>fotos editadas</strong>,
          <strong>contratos</strong>, <strong>facturas</strong>,
          <strong>pagos</strong> y <strong>reservas</strong> en un solo lugar.
        </p>

        <div style="background:#f4f4f5;border-radius:12px;padding:16px;text-align:center;margin:20px 0">
          <p style="margin:0;font-size:11px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:.05em">
            Tu código de acceso
          </p>
          <p style="margin:8px 0 0;font-family:ui-monospace,SFMono-Regular,monospace;font-size:28px;font-weight:700;letter-spacing:.2em;color:#18181b">
            ${escapeHtml(accessCode)}
          </p>
        </div>

        <div style="text-align:center;margin:20px 0">
          <a href="${portalLogin}" style="display:inline-block;background:${accent};color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">
            Entrar a tu portal →
          </a>
        </div>

        <p style="margin:16px 0 0;font-size:13px;color:#71717a;line-height:1.55">
          También podés entrar manualmente en
          <a href="${portalShort}" style="color:${accent};text-decoration:none">${portalShort.replace(/^https?:\/\//, "")}</a>
          con tu email (<strong>${escapeHtml(clientEmail)}</strong>) y el código de arriba.
        </p>
      </div>

      <div style="background:#fafafa;padding:16px 24px;border-top:1px solid #e4e4e7;text-align:center">
        <p style="margin:0;font-size:12px;color:#a1a1aa">
          Este email fue enviado por ${escapeHtml(studioName)}.
          Si no esperabas este mensaje, podés ignorarlo.
        </p>
      </div>
    </div>
  </div>`

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
