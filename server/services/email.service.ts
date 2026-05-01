import 'server-only'

import { createSupabaseServiceClient } from '@/server/supabase/service'
import { sendEmail as sendViaSmtp } from './smtp.service'
import type { Database } from '@/types/supabase'

type EmailInsert = Database['public']['Tables']['email_queue']['Insert']
type EmailUpdate = Database['public']['Tables']['email_queue']['Update']

export type EnqueueEmailInput = {
  studioId: string
  toEmail: string
  toName?: string | null
  subject: string
  bodyHtml: string
  bodyText?: string | null
  fromEmail?: string | null
  fromName?: string | null
  replyTo?: string | null
  templateSlug?: string | null
  relatedEntityType?: string | null
  relatedEntityId?: string | null
  scheduledFor?: Date | null
  metadata?: Record<string, unknown>
}

/**
 * Encola un email. El worker (edge function `email-worker`) drena la cola
 * cada N minutos y llama al proveedor real (Resend).
 *
 * Usamos service-role porque:
 *  - En contextos públicos (p.ej. tras un submit del form anon), el invoker
 *    es anon y no tiene INSERT sobre email_queue.
 *  - En contextos admin el staff sí puede, pero usar el mismo path simplifica.
 */
export async function enqueueEmail(input: EnqueueEmailInput): Promise<string> {
  const supabase = createSupabaseServiceClient()
  const row: EmailInsert = {
    studio_id: input.studioId,
    to_email: input.toEmail.trim().toLowerCase(),
    to_name: input.toName ?? null,
    subject: input.subject,
    body_html: input.bodyHtml,
    body_text: input.bodyText ?? stripHtml(input.bodyHtml),
    from_email: input.fromEmail ?? null,
    from_name: input.fromName ?? null,
    reply_to: input.replyTo ?? null,
    template_slug: input.templateSlug ?? null,
    related_entity_type: input.relatedEntityType ?? null,
    related_entity_id: input.relatedEntityId ?? null,
    scheduled_for: (input.scheduledFor ?? new Date()).toISOString(),
    status: 'pending',
    metadata: (input.metadata ?? {}) as EmailInsert['metadata'],
  }

  const { data, error } = await supabase
    .from('email_queue')
    .insert(row)
    .select('id')
    .single()

  if (error) throw new Error(`[enqueueEmail] ${error.message}`)
  const queueId = (data as { id: string }).id

  // En dev o cuando SMTP está configurado: intentar envío inmediato.
  // Marca la fila como 'sent' o 'failed' según el resultado, así la cola
  // sirve como audit log. Si falla, el worker puede reintentar después.
  await tryImmediateSend(queueId, input)

  return queueId
}

/**
 * Envío inmediato (best-effort). No bloquea al caller si falla;
 * la fila queda en email_queue con status 'failed' o 'pending' para retry.
 */
async function tryImmediateSend(queueId: string, input: EnqueueEmailInput): Promise<void> {
  const smtpReady = !!process.env.SMTP_HOST && !!process.env.SMTP_USER
  if (!smtpReady) return // deja la fila pending para que el worker la tome

  const result = await sendViaSmtp({
    studioId: input.studioId,
    to: input.toEmail,
    toName: input.toName ?? null,
    subject: input.subject,
    html: input.bodyHtml,
    text: input.bodyText ?? null,
    fromEmail: input.fromEmail ?? null,
    fromName: input.fromName ?? null,
    replyTo: input.replyTo ?? null,
  })

  const supabase = createSupabaseServiceClient()
  const patch: EmailUpdate = result.ok
    ? {
        status: 'sent',
        sent_at: new Date().toISOString(),
        provider: 'smtp',
        provider_message_id: result.messageId ?? null,
      }
    : {
        status: 'failed',
        failed_at: new Date().toISOString(),
        last_error: result.error ?? 'unknown error',
      }

  await supabase.from('email_queue').update(patch).eq('id', queueId)
}

/** Helper mínimo para generar body_text cuando solo tenemos HTML. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ──────────────────────────────────────────────────────────────────────
// Renderers para los 3 emails del flujo de booking. V1 — hardcoded.
// En V2 leerán desde email_templates y harán interpolación {{var}}.
// ──────────────────────────────────────────────────────────────────────

const brand = (studioName: string, color: string = '#111827') => `
  <div style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #111827;">
    <div style="border-left: 4px solid ${color}; padding-left: 16px; margin-bottom: 32px;">
      <p style="margin: 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280;">StudioFlow</p>
      <p style="margin: 2px 0 0; font-size: 16px; font-weight: 600;">${escapeHtml(studioName)}</p>
    </div>
`

const brandClose = `
    <hr style="margin: 32px 0; border: none; border-top: 1px solid #e5e7eb;" />
    <p style="margin: 0; font-size: 11px; color: #9ca3af;">Este correo fue enviado automáticamente por StudioFlow.</p>
  </div>
`

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderBookingReceivedForStudio(params: {
  studioName: string
  primaryColor?: string
  clientName: string
  clientEmail: string
  clientPhone?: string | null
  packageName: string
  eventDate: string
  eventTime?: string | null
  eventLocation?: string | null
  adminLink: string
}) {
  const {
    studioName,
    primaryColor = '#111827',
    clientName,
    clientEmail,
    clientPhone,
    packageName,
    eventDate,
    eventTime,
    eventLocation,
    adminLink,
  } = params

  const subject = `📬 Nueva solicitud de booking — ${clientName}`
  const html = `
${brand(studioName, primaryColor)}
  <h1 style="margin: 0 0 8px; font-size: 22px;">Tienes una nueva solicitud</h1>
  <p style="margin: 0 0 24px; color: #4b5563;">Alguien completó el formulario público de reserva. Aquí están los detalles:</p>

  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; width: 140px;">Cliente</td><td style="padding: 8px 0; font-weight: 500;">${escapeHtml(clientName)}</td></tr>
    <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Email</td><td style="padding: 8px 0;">${escapeHtml(clientEmail)}</td></tr>
    ${clientPhone ? `<tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Teléfono</td><td style="padding: 8px 0;">${escapeHtml(clientPhone)}</td></tr>` : ''}
    <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Paquete</td><td style="padding: 8px 0;">${escapeHtml(packageName)}</td></tr>
    <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Fecha del evento</td><td style="padding: 8px 0;">${escapeHtml(eventDate)}${eventTime ? ` · ${escapeHtml(eventTime)}` : ''}</td></tr>
    ${eventLocation ? `<tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Ubicación</td><td style="padding: 8px 0;">${escapeHtml(eventLocation)}</td></tr>` : ''}
  </table>

  <div style="margin-top: 28px;">
    <a href="${escapeHtml(adminLink)}" style="display: inline-block; padding: 10px 20px; background: ${escapeHtml(primaryColor)}; color: #fff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">Revisar solicitud</a>
  </div>
${brandClose}
`
  return { subject, html }
}

export function renderBookingApprovedForClient(params: {
  studioName: string
  primaryColor?: string
  clientName: string
  packageName: string
  eventDate: string
  depositAmount?: number | null
  depositCurrency?: string | null
  reserveDueInDays?: number | null
  replyToEmail?: string | null
  contractSignUrl?: string | null
}) {
  const {
    studioName,
    primaryColor = '#111827',
    clientName,
    packageName,
    eventDate,
    depositAmount,
    depositCurrency,
    reserveDueInDays,
    replyToEmail,
    contractSignUrl,
  } = params

  const subject = `✅ Tu solicitud con ${studioName} fue aprobada`
  const depositLine =
    depositAmount && depositCurrency
      ? `<p style="margin: 0 0 12px;">Para asegurar tu fecha, necesitamos un depósito de <strong>${depositCurrency} ${depositAmount.toLocaleString()}</strong>${reserveDueInDays ? ` en los próximos <strong>${reserveDueInDays} días</strong>` : ''}.</p>`
      : ''
  const replyLine = replyToEmail
    ? `<p style="margin: 0 0 12px;">Responde a este email o escríbenos a <a href="mailto:${escapeHtml(replyToEmail)}" style="color: ${escapeHtml(primaryColor)};">${escapeHtml(replyToEmail)}</a> para coordinar el pago.</p>`
    : ''
  const contractCta = contractSignUrl
    ? `<p style="margin: 16px 0 24px; text-align: center;"><a href="${escapeHtml(contractSignUrl)}" style="display: inline-block; background: ${escapeHtml(primaryColor)}; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">Firmar contrato</a></p>`
    : ''

  const html = `
${brand(studioName, primaryColor)}
  <h1 style="margin: 0 0 8px; font-size: 22px;">¡Gran noticia, ${escapeHtml(clientName)}!</h1>
  <p style="margin: 0 0 24px; color: #4b5563;">Hemos aprobado tu solicitud para el paquete <strong>${escapeHtml(packageName)}</strong> el <strong>${escapeHtml(eventDate)}</strong>.</p>
  ${depositLine}
  ${contractCta}
  ${replyLine}
  <p style="margin: 24px 0 0; color: #4b5563;">Estamos emocionados de trabajar contigo.</p>
${brandClose}
`
  return { subject, html }
}

export function renderFormInvitationForClient(params: {
  studioName: string
  primaryColor?: string
  clientName: string
  formTitle: string
  formUrl: string
  replyToEmail?: string | null
}) {
  const {
    studioName,
    primaryColor = '#111827',
    clientName,
    formTitle,
    formUrl,
    replyToEmail,
  } = params

  const subject = `${studioName} — ${formTitle}`
  const replyLine = replyToEmail
    ? `<p style="margin: 0 0 12px; color: #6b7280; font-size: 13px;">¿Dudas? Responde a este email o escríbenos a <a href="mailto:${escapeHtml(replyToEmail)}" style="color: ${escapeHtml(primaryColor)};">${escapeHtml(replyToEmail)}</a>.</p>`
    : ''

  const html = `
${brand(studioName, primaryColor)}
  <h1 style="margin: 0 0 8px; font-size: 22px;">Hola ${escapeHtml(clientName)}</h1>
  <p style="margin: 0 0 16px; color: #4b5563;">Para que tu sesión con <strong>${escapeHtml(studioName)}</strong> sea perfecta, necesitamos algunos datos más.</p>
  <p style="margin: 0 0 20px; color: #4b5563;">Toma 2-3 minutos y completa el formulario:</p>
  <p style="margin: 16px 0 24px; text-align: center;">
    <a href="${escapeHtml(formUrl)}" style="display: inline-block; background: ${escapeHtml(primaryColor)}; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">Completar ${escapeHtml(formTitle)}</a>
  </p>
  <p style="margin: 0 0 8px; color: #9ca3af; font-size: 12px;">Puedes guardar tu avance y volver después desde el mismo enlace.</p>
  ${replyLine}
${brandClose}
`
  return { subject, html }
}

export function renderBookingRejectedForClient(params: {
  studioName: string
  primaryColor?: string
  clientName: string
  packageName: string
  eventDate: string
  reason?: string | null
}) {
  const { studioName, primaryColor = '#111827', clientName, packageName, eventDate, reason } = params
  const subject = `Sobre tu solicitud con ${studioName}`
  const html = `
${brand(studioName, primaryColor)}
  <h1 style="margin: 0 0 8px; font-size: 22px;">Gracias por escribirnos, ${escapeHtml(clientName)}</h1>
  <p style="margin: 0 0 16px; color: #4b5563;">Lamentablemente, no podremos cubrir tu evento del <strong>${escapeHtml(eventDate)}</strong> con el paquete <strong>${escapeHtml(packageName)}</strong>.</p>
  ${reason ? `<div style="padding: 16px; background: #f9fafb; border-radius: 8px; border-left: 3px solid #d1d5db; margin-bottom: 16px;"><p style="margin: 0; color: #4b5563; font-size: 14px;">${escapeHtml(reason)}</p></div>` : ''}
  <p style="margin: 0 0 12px; color: #4b5563;">Agradecemos tu interés y esperamos poder ayudarte en otra oportunidad.</p>
${brandClose}
`
  return { subject, html }
}

// ──────────────────────────────────────────────────────────────────────
// Renderers para el flujo Pixieset (cliente registrado con proyecto)
// ──────────────────────────────────────────────────────────────────────

export function renderContractInvitation(params: {
  studioName: string
  primaryColor?: string
  clientName: string
  projectName: string
  eventType: string
  eventDate: string
  signingUrl: string
}) {
  const {
    studioName,
    primaryColor = '#7c3aed',
    clientName,
    projectName,
    eventType,
    eventDate,
    signingUrl,
  } = params

  const subject = `📝 Tu contrato de ${projectName} está listo para firmar`
  const html = `
${brand(studioName, primaryColor)}
  <h1 style="margin: 0 0 12px; font-size: 24px; font-weight: 700;">Hola ${escapeHtml(clientName)}, qué emoción 💜</h1>
  <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">
    Ya empezamos a preparar todo para tu <strong>${escapeHtml(eventType)}</strong> del <strong>${escapeHtml(eventDate)}</strong>.
    Aquí está el contrato de tu sesión <strong>${escapeHtml(projectName)}</strong> para que lo revises y firmes digitalmente.
  </p>

  <div style="padding: 20px; background: #faf5ff; border-radius: 12px; border: 1px solid #e9d5ff; margin: 24px 0;">
    <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Siguiente paso</p>
    <p style="margin: 0 0 16px; color: #111827; font-size: 15px; line-height: 1.5;">
      Haz clic en el botón para leer el contrato completo y firmarlo desde tu celular o computadora. Toma menos de 3 minutos.
    </p>
    <a href="${escapeHtml(signingUrl)}" style="display: inline-block; padding: 12px 24px; background: ${escapeHtml(primaryColor)}; color: #fff; text-decoration: none; border-radius: 10px; font-size: 15px; font-weight: 600;">Ver y firmar contrato →</a>
  </div>

  <p style="margin: 0 0 8px; color: #4b5563; font-size: 14px;">Después de firmar, recibirás automáticamente la factura de la reserva del 50% para apartar tu fecha oficialmente.</p>
  <p style="margin: 16px 0 0; color: #6b7280; font-size: 13px;">Si tienes dudas, respóndenos a este correo. Estamos para ayudarte.</p>
${brandClose}
`
  return { subject, html }
}

export function renderInvoiceReserve(params: {
  studioName: string
  primaryColor?: string
  clientName: string
  projectName: string
  eventType: string
  eventDate: string
  invoiceNumber: string
  totalFormatted: string // "DOP 15,000.00"
  dueDate?: string | null
  portalUrl: string
}) {
  const {
    studioName,
    primaryColor = '#7c3aed',
    clientName,
    projectName,
    eventType,
    eventDate,
    invoiceNumber,
    totalFormatted,
    dueDate,
    portalUrl,
  } = params

  const subject = `💳 Reserva tu ${eventType} — Factura ${invoiceNumber}`
  const html = `
${brand(studioName, primaryColor)}
  <h1 style="margin: 0 0 12px; font-size: 24px; font-weight: 700;">${escapeHtml(clientName)}, vamos a apartar tu fecha 📅</h1>
  <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">
    Para confirmar oficialmente tu <strong>${escapeHtml(eventType)}</strong> del <strong>${escapeHtml(eventDate)}</strong>,
    realiza el pago del <strong>50% de reserva</strong> de tu proyecto <strong>${escapeHtml(projectName)}</strong>.
  </p>

  <div style="padding: 24px; background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%); border-radius: 12px; border: 1px solid #e9d5ff; margin: 24px 0;">
    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 12px;">
      <div>
        <p style="margin: 0; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em;">Factura</p>
        <p style="margin: 2px 0 0; font-size: 15px; color: #111827; font-weight: 600;">${escapeHtml(invoiceNumber)}</p>
      </div>
      <div style="text-align: right;">
        <p style="margin: 0; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em;">Total</p>
        <p style="margin: 2px 0 0; font-size: 22px; color: ${escapeHtml(primaryColor)}; font-weight: 700;">${escapeHtml(totalFormatted)}</p>
      </div>
    </div>
    ${dueDate ? `<p style="margin: 12px 0 0; font-size: 13px; color: #6b7280;">📌 Pagar antes del <strong>${escapeHtml(dueDate)}</strong> para asegurar tu fecha.</p>` : ''}
  </div>

  <a href="${escapeHtml(portalUrl)}" style="display: inline-block; padding: 12px 24px; background: ${escapeHtml(primaryColor)}; color: #fff; text-decoration: none; border-radius: 10px; font-size: 15px; font-weight: 600;">Ver factura y pagar →</a>

  <p style="margin: 24px 0 8px; color: #4b5563; font-size: 14px; line-height: 1.6;">
    El 50% restante se factura automáticamente <strong>7 días antes</strong> del evento. Así te mantienes con todo claro, sin sorpresas.
  </p>
  <p style="margin: 16px 0 0; color: #6b7280; font-size: 13px;">Cualquier duda, respóndenos este correo directamente.</p>
${brandClose}
`
  return { subject, html }
}
