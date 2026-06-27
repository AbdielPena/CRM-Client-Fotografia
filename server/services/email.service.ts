import 'server-only'

import { createSupabaseServiceClient } from '@/server/supabase/service'
import { throwServiceError } from '@/lib/utils/api-error'
import { wrapLuxuryEmail, type LuxuryEmailOptions } from '@/lib/email/luxury-layout'
import type { Database } from '@/types/supabase'

type EmailInsert = Database['public']['Tables']['email_queue']['Insert']

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
 * Encola un email (status 'pending'). El DRENADOR interno
 * (`/api/internal/v1/email-drain`, disparado por un cron del VPS cada minuto)
 * lo envía por mailcow — sin Resend, todo interno. Sale en ≤60s.
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
    // mailcow autentica como UNA cuenta (mail@abbypixel.com) y rechaza enviar
    // "como" otra dirección → 553 sender not owned. Por eso NO seteamos From a
    // soporte@/correo-del-estudio: dejamos from_email=null (el worker usa su
    // remitente autenticado) y mandamos el correo del estudio como Reply-To,
    // así las respuestas del cliente llegan igual al estudio.
    from_email: null,
    from_name: input.fromName ?? null,
    reply_to: input.replyTo ?? input.fromEmail ?? null,
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

  if (error) throwServiceError("EMAIL_ENQUEUE_FAILED", error)
  const queueId = (data as { id: string }).id

  // El envío lo hace el DRENADOR interno (cron del VPS → /api/internal/v1/
  // email-drain → mailcow). Encolar = insertar 'pending'; sale en ≤60s. Es el
  // ÚNICO camino de envío (sin envío inmediato) para evitar carreras de
  // doble-envío con el drenador.
  return queueId
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

/**
 * Branding del estudio para el marco minimalista (logo, redes, WhatsApp, footer).
 * Lo provee el caller con `getEmailBranding(studioId)`. Opcional: si no se pasa,
 * el marco muestra el nombre del estudio en texto en lugar del logo.
 */
export type EmailBranding = Omit<LuxuryEmailOptions, 'studioName' | 'accent'>

/**
 * Envuelve el cuerpo del email en el marco luxury minimalista compartido
 * (header con logo del estudio, tipografía Inter, footer con redes/WhatsApp) —
 * el mismo que usan el resto de los correos del sistema.
 */
function frame(
  inner: string,
  p: { studioName: string; accent?: string | null; branding?: EmailBranding | null },
): string {
  return wrapLuxuryEmail(inner, {
    studioName: p.studioName,
    accent: p.accent ?? null,
    logoUrl: p.branding?.logoUrl ?? null,
    footerHtml: p.branding?.footerHtml ?? null,
    contactLine: p.branding?.contactLine ?? null,
    whatsappUrl: p.branding?.whatsappUrl ?? null,
    social: p.branding?.social ?? null,
  })
}

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
  branding?: EmailBranding | null
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
  const html = frame(`
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
`, { studioName, accent: primaryColor, branding: params.branding })
  return { subject, html }
}

/**
 * Email al estudio cuando llega un lead desde el formulario de contacto del
 * sitio web (abbypixel.com). Mismo marco luxury que el resto de correos.
 */
export function renderLeadReceivedForStudio(params: {
  studioName: string
  primaryColor?: string
  branding?: EmailBranding | null
  clientName: string
  clientEmail?: string | null
  clientPhone?: string | null
  category?: string | null
  tentativeDate?: string | null
  message?: string | null
  adminLink: string
}) {
  const {
    studioName,
    primaryColor = '#111827',
    clientName,
    clientEmail,
    clientPhone,
    category,
    tentativeDate,
    message,
    adminLink,
  } = params

  const subject = `🌱 Nuevo contacto del sitio web — ${clientName}`
  const row = (label: string, value: string) =>
    `<tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; width: 150px; vertical-align: top;">${label}</td><td style="padding: 8px 0; font-weight: 500;">${value}</td></tr>`
  const html = frame(`
  <h1 style="margin: 0 0 8px; font-size: 22px;">Nuevo contacto desde el sitio</h1>
  <p style="margin: 0 0 24px; color: #4b5563;">Alguien completó el formulario de contacto de abbypixel.com. Ya quedó registrado como lead en tu CRM:</p>

  <table style="width: 100%; border-collapse: collapse;">
    ${row('Nombre', escapeHtml(clientName))}
    ${clientEmail ? row('Email', escapeHtml(clientEmail)) : ''}
    ${clientPhone ? row('WhatsApp / Tel.', escapeHtml(clientPhone)) : ''}
    ${category ? row('Le interesa', escapeHtml(category)) : ''}
    ${tentativeDate ? row('Fecha tentativa', escapeHtml(tentativeDate)) : ''}
    ${message ? row('Mensaje', escapeHtml(message).replace(/\n/g, '<br/>')) : ''}
  </table>

  <div style="margin-top: 28px;">
    <a href="${escapeHtml(adminLink)}" style="display: inline-block; padding: 10px 20px; background: ${escapeHtml(primaryColor)}; color: #fff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">Ver lead en el CRM</a>
  </div>
`, { studioName, accent: primaryColor, branding: params.branding })
  return { subject, html }
}

export function renderBookingApprovedForClient(params: {
  studioName: string
  primaryColor?: string
  branding?: EmailBranding | null
  clientName: string
  packageName: string
  eventDate: string
  depositAmount?: number | null
  depositCurrency?: string | null
  reserveDueInDays?: number | null
  replyToEmail?: string | null
  contractSignUrl?: string | null
  sessionDetailsUrl?: string | null
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
    sessionDetailsUrl,
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
    ? `<p style="margin: 16px 0 24px; text-align: center;"><a href="${escapeHtml(contractSignUrl)}" style="display: inline-block; background: ${escapeHtml(primaryColor)}; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">Continuar con mi reserva</a></p>`
    : ''
  const sessionCta = sessionDetailsUrl
    ? `<p style="margin: 0 0 24px; text-align: center;"><a href="${escapeHtml(sessionDetailsUrl)}" style="display: inline-block; border: 1px solid ${escapeHtml(primaryColor)}; color: ${escapeHtml(primaryColor)}; text-decoration: none; padding: 11px 22px; border-radius: 8px; font-weight: 600; font-size: 14px;">Ver detalles de la sesión →</a></p>`
    : ''

  const html = frame(`
  <h1 style="margin: 0 0 8px; font-size: 22px;">¡Gran noticia, ${escapeHtml(clientName)}!</h1>
  <p style="margin: 0 0 24px; color: #4b5563;">Hemos aprobado tu solicitud para el plan <strong>${escapeHtml(packageName)}</strong> el <strong>${escapeHtml(eventDate)}</strong>.</p>
  <p style="margin: 0 0 16px; color: #4b5563;">Para confirmar tu sesión, continúa con estos pasos: revisa tu plan, completa el formulario y firma el contrato. Al final te mostraremos la factura para realizar el pago.</p>
  ${depositLine}
  ${contractCta}
  ${sessionCta}
  ${replyLine}
  <p style="margin: 24px 0 0; color: #4b5563;">Estamos emocionados de trabajar contigo.</p>
`, { studioName, accent: primaryColor, branding: params.branding })
  return { subject, html }
}

/**
 * Correo de bienvenida al CLIENTE apenas registra una solicitud (antes solo se
 * notificaba al estudio). Confirma recepción y que está en espera de aprobación.
 */
export function renderBookingReceivedForClient(params: {
  studioName: string
  primaryColor?: string
  branding?: EmailBranding | null
  clientName: string
  packageName: string
  eventDate: string
  replyToEmail?: string | null
}) {
  const {
    studioName,
    primaryColor = '#111827',
    clientName,
    packageName,
    eventDate,
    replyToEmail,
  } = params

  const subject = `Recibimos tu solicitud — ${studioName}`
  const replyLine = replyToEmail
    ? `<p style="margin: 0 0 12px; color: #6b7280; font-size: 13px;">¿Dudas? Responde a este email o escríbenos a <a href="mailto:${escapeHtml(replyToEmail)}" style="color: ${escapeHtml(primaryColor)};">${escapeHtml(replyToEmail)}</a>.</p>`
    : ''

  const html = frame(`
  <h1 style="margin: 0 0 8px; font-size: 22px;">¡Gracias por escribirnos, ${escapeHtml(clientName)}!</h1>
  <p style="margin: 0 0 16px; color: #4b5563;">Recibimos tu solicitud para el paquete <strong>${escapeHtml(packageName)}</strong> el <strong>${escapeHtml(eventDate)}</strong>. Qué alegría que quieras capturar este momento con nosotros.</p>
  <p style="margin: 0 0 16px; color: #4b5563;">Ya la estamos revisando con cariño. En breve te confirmaremos la disponibilidad y te enviaremos los siguientes pasos para asegurar tu fecha.</p>
  <p style="margin: 0 0 16px; color: #4b5563;">No tienes que hacer nada por ahora — nosotros te escribimos.</p>
  ${replyLine}
  <p style="margin: 24px 0 0; color: #4b5563;">Con cariño,<br/>El equipo de ${escapeHtml(studioName)}</p>
`, { studioName, accent: primaryColor, branding: params.branding })
  return { subject, html }
}

export function renderFormInvitationForClient(params: {
  studioName: string
  primaryColor?: string
  branding?: EmailBranding | null
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

  const html = frame(`
  <h1 style="margin: 0 0 8px; font-size: 22px;">Hola ${escapeHtml(clientName)}</h1>
  <p style="margin: 0 0 16px; color: #4b5563;">Para que tu sesión con <strong>${escapeHtml(studioName)}</strong> sea perfecta, necesitamos algunos datos más.</p>
  <p style="margin: 0 0 20px; color: #4b5563;">Toma 2-3 minutos y completa el formulario:</p>
  <p style="margin: 16px 0 24px; text-align: center;">
    <a href="${escapeHtml(formUrl)}" style="display: inline-block; background: ${escapeHtml(primaryColor)}; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">Completar ${escapeHtml(formTitle)}</a>
  </p>
  <p style="margin: 0 0 8px; color: #9ca3af; font-size: 12px;">Puedes guardar tu avance y volver después desde el mismo enlace.</p>
  ${replyLine}
`, { studioName, accent: primaryColor, branding: params.branding })
  return { subject, html }
}

export function renderBookingRejectedForClient(params: {
  studioName: string
  primaryColor?: string
  branding?: EmailBranding | null
  clientName: string
  packageName: string
  eventDate: string
  reason?: string | null
}) {
  const { studioName, primaryColor = '#111827', clientName, packageName, eventDate, reason } = params
  const subject = `Sobre tu solicitud con ${studioName}`
  const html = frame(`
  <h1 style="margin: 0 0 8px; font-size: 22px;">Gracias por escribirnos, ${escapeHtml(clientName)}</h1>
  <p style="margin: 0 0 16px; color: #4b5563;">Lamentablemente, no podremos cubrir tu evento del <strong>${escapeHtml(eventDate)}</strong> con el paquete <strong>${escapeHtml(packageName)}</strong>.</p>
  ${reason ? `<div style="padding: 16px; background: #f9fafb; border-radius: 8px; border-left: 3px solid #d1d5db; margin-bottom: 16px;"><p style="margin: 0; color: #4b5563; font-size: 14px;">${escapeHtml(reason)}</p></div>` : ''}
  <p style="margin: 0 0 12px; color: #4b5563;">Agradecemos tu interés y esperamos poder ayudarte en otra oportunidad.</p>
`, { studioName, accent: primaryColor, branding: params.branding })
  return { subject, html }
}

// ──────────────────────────────────────────────────────────────────────
// Renderers para el flujo Pixieset (cliente registrado con proyecto)
// ──────────────────────────────────────────────────────────────────────

export function renderContractInvitation(params: {
  studioName: string
  primaryColor?: string
  branding?: EmailBranding | null
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
  const html = frame(`
  <h1 style="margin: 0 0 12px; font-size: 24px; font-weight: 700;">Hola ${escapeHtml(clientName)}, qué emoción 💜</h1>
  <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">
    Ya empezamos a preparar todo para tu <strong>${escapeHtml(eventType)}</strong> del <strong>${escapeHtml(eventDate)}</strong>.
    Aquí está el contrato de tu sesión <strong>${escapeHtml(projectName)}</strong> para que lo revises y firmes digitalmente.
  </p>

  <div style="padding: 20px 22px; background: #F7F7F9; border-radius: 16px; border: 1px solid #ECECEF; margin: 24px 0;">
    <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Siguiente paso</p>
    <p style="margin: 0 0 16px; color: #111827; font-size: 15px; line-height: 1.5;">
      Haz clic en el botón para leer el contrato completo y firmarlo desde tu celular o computadora. Toma menos de 3 minutos.
    </p>
    <a href="${escapeHtml(signingUrl)}" style="display: inline-block; padding: 12px 24px; background: ${escapeHtml(primaryColor)}; color: #fff; text-decoration: none; border-radius: 10px; font-size: 15px; font-weight: 600;">Ver y firmar contrato →</a>
  </div>

  <p style="margin: 0 0 8px; color: #4b5563; font-size: 14px;">Después de firmar, recibirás automáticamente la factura de la reserva del 50% para apartar tu fecha oficialmente.</p>
  <p style="margin: 16px 0 0; color: #6b7280; font-size: 13px;">Si tienes dudas, respóndenos a este correo. Estamos para ayudarte.</p>
`, { studioName, accent: primaryColor, branding: params.branding })
  return { subject, html }
}

export function renderInvoiceReserve(params: {
  studioName: string
  primaryColor?: string
  branding?: EmailBranding | null
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
  const html = frame(`
  <h1 style="margin: 0 0 12px; font-size: 24px; font-weight: 700;">${escapeHtml(clientName)}, vamos a apartar tu fecha 📅</h1>
  <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">
    Para confirmar oficialmente tu <strong>${escapeHtml(eventType)}</strong> del <strong>${escapeHtml(eventDate)}</strong>,
    realiza el pago del <strong>50% de reserva</strong> de tu proyecto <strong>${escapeHtml(projectName)}</strong>.
  </p>

  <div style="padding: 22px 24px; background: #F7F7F9; border-radius: 16px; border: 1px solid #ECECEF; margin: 24px 0;">
    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 12px;">
      <div>
        <p style="margin: 0; font-size: 11px; color: #A1A1A6; text-transform: uppercase; letter-spacing: 0.08em;">Factura</p>
        <p style="margin: 2px 0 0; font-size: 15px; color: #1C1C1C; font-weight: 600;">${escapeHtml(invoiceNumber)}</p>
      </div>
      <div style="text-align: right;">
        <p style="margin: 0; font-size: 11px; color: #A1A1A6; text-transform: uppercase; letter-spacing: 0.08em;">Total</p>
        <p style="margin: 2px 0 0; font-size: 26px; color: #1C1C1C; font-weight: 700; letter-spacing: -.02em;">${escapeHtml(totalFormatted)}</p>
      </div>
    </div>
    ${dueDate ? `<p style="margin: 12px 0 0; font-size: 13px; color: #6E6E73;">📌 Pagar antes del <strong>${escapeHtml(dueDate)}</strong> para asegurar tu fecha.</p>` : ''}
  </div>

  <a href="${escapeHtml(portalUrl)}" style="display: inline-block; padding: 12px 24px; background: ${escapeHtml(primaryColor)}; color: #fff; text-decoration: none; border-radius: 10px; font-size: 15px; font-weight: 600;">Ver factura y pagar →</a>

  <p style="margin: 24px 0 8px; color: #4b5563; font-size: 14px; line-height: 1.6;">
    El 50% restante se factura automáticamente <strong>7 días antes</strong> del evento. Así te mantienes con todo claro, sin sorpresas.
  </p>
  <p style="margin: 16px 0 0; color: #6b7280; font-size: 13px;">Cualquier duda, respóndenos este correo directamente.</p>
`, { studioName, accent: primaryColor, branding: params.branding })
  return { subject, html }
}

/**
 * Email enviado al cliente cada vez que la factura cambia: se registra un
 * pago (changeKind 'payment') o se edita la información/monto de la factura
 * (changeKind 'edit'). Muestra el resumen del plan: total, pagado y saldo.
 */
export function renderInvoiceUpdate(params: {
  studioName: string
  primaryColor?: string
  branding?: EmailBranding | null
  clientName: string
  projectName?: string | null
  invoiceNumber: string
  changeKind: 'payment' | 'edit'
  totalFormatted: string
  paidFormatted: string
  balanceFormatted: string
  paymentAmountFormatted?: string | null
  isFullyPaid: boolean
  portalUrl: string
}) {
  const {
    studioName,
    primaryColor = '#7c3aed',
    clientName,
    projectName,
    invoiceNumber,
    changeKind,
    totalFormatted,
    paidFormatted,
    balanceFormatted,
    paymentAmountFormatted,
    isFullyPaid,
    portalUrl,
  } = params

  const subject =
    changeKind === 'payment'
      ? isFullyPaid
        ? `✅ Pago completo recibido — Factura ${invoiceNumber}`
        : `✅ Registramos tu pago — Factura ${invoiceNumber}`
      : `🧾 Actualizamos tu factura ${invoiceNumber}`

  const heading =
    changeKind === 'payment'
      ? isFullyPaid
        ? `${escapeHtml(clientName)}, recibimos tu pago completo 🎉`
        : `${escapeHtml(clientName)}, registramos tu pago ✅`
      : `${escapeHtml(clientName)}, actualizamos tu factura 🧾`

  const intro =
    changeKind === 'payment'
      ? paymentAmountFormatted
        ? `Confirmamos un pago de <strong>${escapeHtml(paymentAmountFormatted)}</strong>${projectName ? ` para tu proyecto <strong>${escapeHtml(projectName)}</strong>` : ''}. Aquí está el estado actualizado de tu factura.`
        : `Confirmamos un nuevo pago en tu factura. Aquí está el estado actualizado.`
      : `Hicimos cambios en tu factura${projectName ? ` de <strong>${escapeHtml(projectName)}</strong>` : ''}. Revisa el resumen actualizado a continuación.`

  const row = (label: string, value: string, color = '#111827', bold = false) => `
    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f1f4;">
      <span style="font-size: 14px; color: #6b7280;">${escapeHtml(label)}</span>
      <span style="font-size: 14px; color: ${color}; font-weight: ${bold ? 700 : 500};">${escapeHtml(value)}</span>
    </div>`

  const html = frame(`
  <h1 style="margin: 0 0 12px; font-size: 22px; font-weight: 700;">${heading}</h1>
  <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">${intro}</p>

  <div style="padding: 20px 22px; background: #F7F7F9; border-radius: 16px; border: 1px solid #ECECEF; margin: 24px 0;">
    <p style="margin: 0 0 8px; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em;">Factura ${escapeHtml(invoiceNumber)}</p>
    ${row('Total', totalFormatted)}
    ${row('Pagado', paidFormatted, '#059669')}
    ${row(isFullyPaid ? 'Saldo' : 'Saldo pendiente', balanceFormatted, isFullyPaid ? '#059669' : escapeHtml(primaryColor), true)}
  </div>

  <a href="${escapeHtml(portalUrl)}" style="display: inline-block; padding: 12px 24px; background: ${escapeHtml(primaryColor)}; color: #fff; text-decoration: none; border-radius: 10px; font-size: 15px; font-weight: 600;">Ver factura →</a>

  <p style="margin: 24px 0 0; color: #6b7280; font-size: 13px;">${
    isFullyPaid
      ? '¡Gracias! Tu factura quedó saldada por completo.'
      : 'El saldo restante puede pagarse en cualquier momento. Cualquier duda, respóndenos este correo.'
  }</p>
`, { studioName, accent: primaryColor, branding: params.branding })
  return { subject, html }
}

export function renderSelectionSubmittedForStudio(params: {
  studioName: string
  primaryColor?: string
  branding?: EmailBranding | null
  galleryName: string
  clientEmail: string
  photoCount: number
  adminLink: string
}) {
  const {
    studioName,
    primaryColor = '#111827',
    galleryName,
    clientEmail,
    photoCount,
    adminLink,
  } = params

  const subject = `📸 Selección recibida — ${galleryName}`
  const html = frame(`
  <h1 style="margin: 0 0 8px; font-size: 22px;">Tu cliente envió su selección</h1>
  <p style="margin: 0 0 24px; color: #4b5563;">Han elegido sus fotos favoritas y están listos para que empieces a editar.</p>

  <div style="padding: 20px 22px; background: #F7F7F9; border-radius: 16px; border: 1px solid #ECECEF; margin: 24px 0;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; width: 120px;">Galería</td><td style="padding: 8px 0; font-weight: 500;">${escapeHtml(galleryName)}</td></tr>
      <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Cliente</td><td style="padding: 8px 0;">${escapeHtml(clientEmail === 'anon@guest' ? 'Visitante (sin email)' : clientEmail)}</td></tr>
      <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Fotos elegidas</td><td style="padding: 8px 0; font-weight: 600; color: ${escapeHtml(primaryColor)};">${photoCount}</td></tr>
    </table>
  </div>

  <a href="${escapeHtml(adminLink)}" style="display: inline-block; padding: 12px 24px; background: ${escapeHtml(primaryColor)}; color: #fff; text-decoration: none; border-radius: 10px; font-size: 15px; font-weight: 600;">Ver selección →</a>
`, { studioName, accent: primaryColor, branding: params.branding })
  return { subject, html }
}
