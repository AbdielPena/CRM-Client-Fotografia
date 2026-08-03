import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { enqueueEmail } from "@/server/services/email.service"
import { getEmailBranding } from "@/server/services/email-template.service"
import { wrapLuxuryEmail } from "@/lib/email/luxury-layout"

import type { AmendChange } from "./contract-amend.service"

/**
 * Aviso al cliente de que su contrato cambió y hay que volver a firmarlo.
 *
 * Lo importante de este correo no es que diga "hubo un cambio": es que muestre
 * QUÉ cambió, antes y después, uno debajo del otro. Un cliente que ve el número
 * viejo tachado y el nuevo al lado entiende en dos segundos y firma; uno que
 * solo lee "actualizamos tu contrato" escribe preguntando o no firma.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export async function sendContractAmendedEmail(params: {
  studioId: string
  contractId: string
  summary: string
  changes: AmendChange[]
  signUrl: string
}): Promise<boolean> {
  const sb = untypedService()

  const { data: cRaw } = await sb
    .from("contracts")
    .select(
      "id, title, project:projects ( name, client:clients ( name, email ) ), studio:studios ( name, email )",
    )
    .eq("id", params.contractId)
    .maybeSingle()
  if (!cRaw) return false

  const c = cRaw as Record<string, unknown>
  const one = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

  const project = one(
    c.project as { name?: string; client?: unknown } | Array<{ name?: string; client?: unknown }>,
  )
  const client = one(
    project?.client as
      | { name?: string; email?: string }
      | Array<{ name?: string; email?: string }>,
  )
  const studio = one(
    c.studio as { name?: string; email?: string } | Array<{ name?: string; email?: string }>,
  )
  if (!client?.email || !studio) return false

  const firstName = (client.name ?? "").trim().split(/\s+/)[0] || "¡Hola!"
  const branding = await getEmailBranding(params.studioId)

  const filasCambios = params.changes
    .map(
      (ch) => `
      <tr>
        <td style="padding:12px 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#A1A1A6" colspan="3">${escapeHtml(ch.campo)}</td>
      </tr>
      <tr>
        <td style="padding:0 0 14px;font-size:16px;color:#8E8E93;text-decoration:line-through">${escapeHtml(ch.antes)}</td>
        <td style="padding:0 12px 14px;font-size:15px;color:#A1A1A6">→</td>
        <td style="padding:0 0 14px;font-size:18px;font-weight:600;color:#1C1C1C">${escapeHtml(ch.despues)}</td>
      </tr>`,
    )
    .join("")

  const bloqueCambios = params.changes.length
    ? `<div style="margin:26px 0;padding:6px 24px 10px;background:#F7F7F9;border:1px solid #ECECEF;border-radius:16px">
         <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${filasCambios}</table>
       </div>`
    : ""

  const inner = `
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#A1A1A6">Cambio en tu contrato</p>
    <h1>Actualizamos tu contrato, ${escapeHtml(firstName)}</h1>
    <p>${escapeHtml(params.summary)}</p>
    ${bloqueCambios}
    <p>Como el documento cambió, necesitamos <strong>tu firma otra vez</strong> para dejarlo válido. Es el mismo enlace de siempre y toma menos de un minuto.</p>
    <p style="text-align:center;margin:24px 0 6px"><a class="btn" href="${escapeHtml(params.signUrl)}">Revisar y firmar</a></p>
    <p style="font-size:13px;color:#6E6E73">Tu firma anterior queda guardada en nuestro archivo. Si algo no te cuadra, respóndenos a este correo antes de firmar — lo revisamos contigo. ✨</p>`

  const html = wrapLuxuryEmail(inner, {
    studioName: studio.name ?? branding.studioName,
    logoUrl: branding.logoUrl,
    accent: branding.accent,
    footerHtml: branding.footerHtml,
    contactLine: branding.contactLine,
    whatsappUrl: branding.whatsappUrl,
    social: branding.social,
  })

  await enqueueEmail({
    studioId: params.studioId,
    toEmail: client.email,
    toName: client.name ?? null,
    subject: "Tu contrato cambió — necesitamos tu firma",
    bodyHtml: html,
    replyTo: studio.email ?? null,
    templateSlug: "contract_amended",
    relatedEntityType: "contract",
    relatedEntityId: params.contractId,
  })

  return true
}
