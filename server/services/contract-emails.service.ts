/**
 * Emails y notificaciones por cada cambio de estado del contrato.
 *
 * Eventos cubiertos:
 *   - contract_sent           → al cliente: "tienes un contrato por firmar"
 *   - contract_viewed         → al studio: "el cliente abrió el contrato"
 *   - contract_signed_client  → al studio: "el cliente firmó, falta tu firma"
 *   - contract_signed_studio  → al cliente: "el estudio firmó, contrato completo"
 *   - contract_completed_copy → al cliente y al studio: copia HTML final
 *
 * Todas las llamadas son best-effort: si falla el email, NO se rompe el flujo
 * principal del contrato.
 */

import "server-only"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { enqueueEmail } from "@/server/services/email.service"
import {
  buildContractPlaceholders,
  injectSignatures,
  renderPlaceholders,
} from "@/server/services/contract-placeholders.service"
import { resolveTemplate, getEmailBranding } from "@/server/services/email-template.service"
import { wrapLuxuryEmail } from "@/lib/email/luxury-layout"

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

type ContractCtx = {
  id: string
  studio_id: string
  title: string
  signing_token: string | null
  signed_at: string | null
  signed_name: string | null
  signed_email: string | null
  signature_image_url: string | null
  studio_signed_at: string | null
  studio_signed_name: string | null
  studio_signature_image_url: string | null
  body_snapshot: string | null
  body_html: string | null
  // resueltos
  studioName: string
  studioEmail: string | null
  studioAccent: string
  clientName: string
  clientEmail: string | null
}

async function loadContractCtx(contractId: string): Promise<ContractCtx | null> {
  const supabase = createSupabaseServiceClient()
  const { data: c } = await supabase
    .from("contracts")
    .select(
      `id, studio_id, title, signing_token, signed_at, signed_name, signed_email,
       signature_image_url, studio_signed_at, studio_signed_name, studio_signature_image_url,
       body_snapshot, body_html,
       project:projects(client:clients(name, email))`,
    )
    .eq("id", contractId)
    .maybeSingle()
  if (!c) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = c as any

  const pickOne = <T>(v: T | T[] | null | undefined): T | null => {
    if (!v) return null
    return Array.isArray(v) ? (v[0] ?? null) : v
  }

  const project = pickOne(raw.project) as { client?: unknown } | null
  const client = project ? (pickOne(project.client) as { name?: string; email?: string } | null) : null

  const { data: studioRow } = await supabase
    .from("studios")
    .select("name, email, primary_color")
    .eq("id", raw.studio_id as string)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = studioRow as any

  return {
    id: raw.id,
    studio_id: raw.studio_id,
    title: raw.title,
    signing_token: raw.signing_token,
    signed_at: raw.signed_at,
    signed_name: raw.signed_name,
    signed_email: raw.signed_email,
    signature_image_url: raw.signature_image_url,
    studio_signed_at: raw.studio_signed_at,
    studio_signed_name: raw.studio_signed_name,
    studio_signature_image_url: raw.studio_signature_image_url,
    body_snapshot: raw.body_snapshot,
    body_html: raw.body_html,
    studioName: s?.name ?? "Studio",
    studioEmail: s?.email ?? null,
    studioAccent: s?.primary_color ?? "#0D0E14",
    clientName: client?.name ?? raw.signed_name ?? "Cliente",
    clientEmail: client?.email ?? raw.signed_email ?? null,
  }
}

/**
 * Contenido INTERNO del email (encabezado + mensaje + CTA). El marco luxury
 * minimalista (header con logo del estudio, tipografía, footer, redes) lo añade
 * `resolveTemplate` al envolver este HTML — por eso aquí devolvemos solo el
 * cuerpo, sin tarjeta ni barras de color. El botón usa `class="btn"`, que el
 * marco estiliza con el acento del estudio.
 */
function panel(
  ctx: ContractCtx,
  title: string,
  message: string,
  ctaLabel?: string,
  ctaHref?: string,
): string {
  return `
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#A1A1A6">${escapeHtml(ctx.title)}</p>
  <h1>${escapeHtml(title)}</h1>
  ${message}
  ${ctaLabel && ctaHref
    ? `<p style="text-align:center;margin:28px 0 6px"><a class="btn" href="${ctaHref}">${escapeHtml(ctaLabel)}</a></p>`
    : ""}`
}

async function notifyInApp(
  studioId: string,
  type: string,
  title: string,
  body: string,
  contractId: string,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  // Si el enum no incluye type, fallback a 'system'
  await supabase
    .from("notifications")
    .insert({
      studio_id: studioId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type: type as any,
      title,
      body,
      action_url: `/contracts/${contractId}`,
      related_entity_type: "contract",
      related_entity_id: contractId,
    })
    .then(() => {})
}

// ─── Eventos públicos ──────────────────────────────────────────────────────

export async function emailContractSent(contractId: string): Promise<void> {
  try {
    const ctx = await loadContractCtx(contractId)
    if (!ctx || !ctx.clientEmail || !ctx.signing_token) return

    const url = `${appUrl()}/sign/${ctx.signing_token}`
    const defaultBodyHtml = panel(
      ctx,
      "Tienes un contrato por firmar",
      `<p style="margin:0 0 12px">Hola <strong>${escapeHtml(ctx.clientName)}</strong>,</p>
       <p style="margin:0">${escapeHtml(ctx.studioName)} te envió el contrato <strong>${escapeHtml(ctx.title)}</strong> para que lo revises y firmes online. La firma es válida legalmente.</p>`,
      "Revisar y firmar",
      url,
    )
    const tpl = await resolveTemplate(
      ctx.studio_id,
      "contract_sent",
      {
        client_name: ctx.clientName,
        studio_name: ctx.studioName,
        contract_title: ctx.title,
        signing_url: url,
      },
      {
        subject: `Contrato por firmar — ${ctx.title}`,
        bodyHtml: defaultBodyHtml,
      },
    )
    await enqueueEmail({
      studioId: ctx.studio_id,
      toEmail: ctx.clientEmail,
      toName: ctx.clientName,
      fromEmail: ctx.studioEmail,
      fromName: tpl.fromName ?? ctx.studioName,
      replyTo: tpl.replyTo ?? ctx.studioEmail,
      subject: tpl.subject,
      bodyHtml: tpl.bodyHtml,
      relatedEntityType: "contract",
      relatedEntityId: ctx.id,
    })
  } catch (err) {
    console.error("[emailContractSent] failed", err)
  }
}

export async function emailContractViewed(contractId: string): Promise<void> {
  try {
    const ctx = await loadContractCtx(contractId)
    if (!ctx) return
    await notifyInApp(
      ctx.studio_id,
      "contract_viewed",
      "Cliente abrió el contrato",
      `${ctx.clientName} abrió "${ctx.title}". Está revisándolo.`,
      ctx.id,
    )
    if (ctx.studioEmail) {
      const defaultBodyHtml = panel(
        ctx,
        "El cliente abrió tu contrato",
        `<p style="margin:0">${escapeHtml(ctx.clientName)} abrió el contrato <strong>${escapeHtml(ctx.title)}</strong>. Te avisaremos apenas firme.</p>`,
        "Ver contrato",
        `${appUrl()}/contracts/${ctx.id}`,
      )
      const tpl = await resolveTemplate(
        ctx.studio_id,
        "contract_viewed_studio",
        { client_name: ctx.clientName, contract_title: ctx.title },
        {
          subject: `${ctx.clientName} abrió el contrato`,
          bodyHtml: defaultBodyHtml,
        },
      )
      await enqueueEmail({
        studioId: ctx.studio_id,
        toEmail: ctx.studioEmail,
        toName: ctx.studioName,
        fromEmail: ctx.studioEmail,
        fromName: tpl.fromName ?? "PixelOS",
        subject: tpl.subject,
        bodyHtml: tpl.bodyHtml,
        relatedEntityType: "contract",
        relatedEntityId: ctx.id,
      })
    }
  } catch (err) {
    console.error("[emailContractViewed] failed", err)
  }
}

export async function emailContractSignedByClient(contractId: string): Promise<void> {
  try {
    const ctx = await loadContractCtx(contractId)
    if (!ctx) return

    await notifyInApp(
      ctx.studio_id,
      "contract_signed",
      "Cliente firmó el contrato",
      `${ctx.signed_name ?? ctx.clientName} firmó "${ctx.title}". ${ctx.studio_signed_at ? "Contrato completo." : "Falta tu firma."}`,
      ctx.id,
    )

    if (ctx.studioEmail) {
      const pendingStudio = !ctx.studio_signed_at
      const defaultBodyHtml = panel(
        ctx,
        pendingStudio
          ? "Cliente firmó — falta tu firma"
          : "Contrato completamente firmado",
        `<p style="margin:0 0 12px"><strong>${escapeHtml(ctx.signed_name ?? ctx.clientName)}</strong> firmó <strong>${escapeHtml(ctx.title)}</strong>.</p>
         ${pendingStudio
           ? `<p style="margin:0">Entrá a tu panel y firmá como estudio para completar el contrato.</p>`
           : `<p style="margin:0">Ambas firmas están registradas. El contrato quedó completo.</p>`}`,
        pendingStudio ? "Firmar ahora" : "Ver contrato",
        `${appUrl()}/contracts/${ctx.id}`,
      )
      const tpl = await resolveTemplate(
        ctx.studio_id,
        "contract_signed_client_studio",
        {
          client_name: ctx.signed_name ?? ctx.clientName,
          contract_title: ctx.title,
          pending_studio_signature: pendingStudio
            ? "Falta tu firma para completar el contrato."
            : "Ambas firmas están registradas.",
        },
        {
          subject: pendingStudio
            ? `Cliente firmó — falta tu firma · ${ctx.title}`
            : `Contrato completo · ${ctx.title}`,
          bodyHtml: defaultBodyHtml,
        },
      )
      await enqueueEmail({
        studioId: ctx.studio_id,
        toEmail: ctx.studioEmail,
        toName: ctx.studioName,
        fromEmail: ctx.studioEmail,
        fromName: tpl.fromName ?? "PixelOS",
        subject: tpl.subject,
        bodyHtml: tpl.bodyHtml,
        relatedEntityType: "contract",
        relatedEntityId: ctx.id,
      })
    }
  } catch (err) {
    console.error("[emailContractSignedByClient] failed", err)
  }
}

export async function emailContractSignedByStudio(contractId: string): Promise<void> {
  try {
    const ctx = await loadContractCtx(contractId)
    if (!ctx || !ctx.clientEmail) return

    const defaultBodyHtml = panel(
      ctx,
      "El estudio firmó tu contrato",
      `<p style="margin:0 0 12px">Hola <strong>${escapeHtml(ctx.clientName)}</strong>,</p>
       <p style="margin:0">El estudio firmó <strong>${escapeHtml(ctx.title)}</strong>. ${ctx.signed_at ? "El contrato está completo. Te enviamos la copia final por separado." : "Falta tu firma para completarlo."}</p>`,
      ctx.signed_at ? "Ver desde tu portal" : "Firmar mi parte",
      ctx.signed_at
        ? `${appUrl()}/portal/login`
        : ctx.signing_token
          ? `${appUrl()}/sign/${ctx.signing_token}`
          : `${appUrl()}/portal/login`,
    )
    const tpl = await resolveTemplate(
      ctx.studio_id,
      "contract_signed_studio_client",
      {
        client_name: ctx.clientName,
        studio_name: ctx.studioName,
        contract_title: ctx.title,
      },
      {
        subject: `${ctx.studioName} firmó tu contrato — ${ctx.title}`,
        bodyHtml: defaultBodyHtml,
      },
    )
    await enqueueEmail({
      studioId: ctx.studio_id,
      toEmail: ctx.clientEmail,
      toName: ctx.clientName,
      fromEmail: ctx.studioEmail,
      fromName: tpl.fromName ?? ctx.studioName,
      replyTo: tpl.replyTo ?? ctx.studioEmail,
      subject: tpl.subject,
      bodyHtml: tpl.bodyHtml,
      relatedEntityType: "contract",
      relatedEntityId: ctx.id,
    })
  } catch (err) {
    console.error("[emailContractSignedByStudio] failed", err)
  }
}

/**
 * Cuando ambas firmas están presentes: enviar copia HTML final al cliente Y
 * al studio. Es el contrato definitivo con firmas inyectadas en su posición.
 */
export async function emailContractFinalCopy(contractId: string): Promise<void> {
  try {
    const ctx = await loadContractCtx(contractId)
    if (!ctx) return

    // Solo cuando AMBAS firmas existen
    if (!ctx.signed_at || !ctx.studio_signed_at) return

    const { vars } = await buildContractPlaceholders(ctx.id)
    const baseBody = ctx.body_snapshot ?? ctx.body_html ?? ""
    const rendered = renderPlaceholders(baseBody, vars)
    const finalHtml = injectSignatures(
      rendered,
      {
        imageUrl: ctx.signature_image_url,
        name: ctx.signed_name,
        signedAt: ctx.signed_at,
      },
      {
        imageUrl: ctx.studio_signature_image_url,
        name: ctx.studio_signed_name,
        signedAt: ctx.studio_signed_at,
      },
    )

    const portalUrl = `${appUrl()}/portal/login`

    // Contenido interno (sin tarjeta ni colores): el marco luxury lo añade
    // `resolveTemplate` para la copia al cliente. Para la copia al estudio —que
    // se envía directa, sin `resolveTemplate`— lo enmarcamos con `frameStudio`.
    const wrap = (greeting: string) => `
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#A1A1A6">${escapeHtml(ctx.studioName)}</p>
      <h1>Contrato firmado y completo</h1>
      ${greeting}
      <hr style="border:none;border-top:1px solid #ECECEF;margin:24px 0" />
      <div style="font-size:14px;line-height:1.65;color:#27272a">${finalHtml}</div>
      <hr style="border:none;border-top:1px solid #ECECEF;margin:24px 0" />
      <p style="margin:0;font-size:13px;color:#6E6E73;text-align:center">
        Disponible también en <a href="${portalUrl}">${portalUrl.replace(/^https?:\/\//, "")}</a>
      </p>`

    // Marco luxury para la copia directa al estudio (mismo branding que usa
    // resolveTemplate internamente).
    const studioBrand = await getEmailBranding(ctx.studio_id)
    const frameStudio = (inner: string) =>
      wrapLuxuryEmail(inner, {
        studioName: ctx.studioName,
        logoUrl: studioBrand.logoUrl,
        accent: studioBrand.accent,
        footerHtml: studioBrand.footerHtml,
        contactLine: studioBrand.contactLine,
        whatsappUrl: studioBrand.whatsappUrl,
        social: studioBrand.social,
      })

    const tpl = await resolveTemplate(
      ctx.studio_id,
      "contract_completed_copy",
      {
        client_name: ctx.clientName,
        contract_title: ctx.title,
        studio_name: ctx.studioName,
      },
      {
        subject: `Copia final del contrato — ${ctx.title}`,
        bodyHtml: wrap(
          `<p style="margin:0;font-size:14px">Hola <strong>${escapeHtml(ctx.clientName)}</strong>, te enviamos la copia final firmada por ambas partes para tu registro.</p>`,
        ),
      },
    )

    if (ctx.clientEmail) {
      await enqueueEmail({
        studioId: ctx.studio_id,
        toEmail: ctx.clientEmail,
        toName: ctx.clientName,
        fromEmail: ctx.studioEmail,
        fromName: tpl.fromName ?? ctx.studioName,
        replyTo: tpl.replyTo ?? ctx.studioEmail,
        subject: tpl.subject,
        bodyHtml: tpl.bodyHtml,
        relatedEntityType: "contract",
        relatedEntityId: ctx.id,
      })
    }

    if (ctx.studioEmail) {
      await enqueueEmail({
        studioId: ctx.studio_id,
        toEmail: ctx.studioEmail,
        toName: ctx.studioName,
        fromEmail: ctx.studioEmail,
        fromName: tpl.fromName ?? "PixelOS",
        subject: tpl.subject,
        bodyHtml: frameStudio(
          wrap(
            `<p style="margin:0;font-size:14px">Copia para tu registro. Cliente: <strong>${escapeHtml(ctx.clientName)}</strong>.</p>`,
          ),
        ),
        relatedEntityType: "contract",
        relatedEntityId: ctx.id,
      })
    }
  } catch (err) {
    console.error("[emailContractFinalCopy] failed", err)
  }
}
