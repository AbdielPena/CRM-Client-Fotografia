import 'server-only'

import nodemailer, { type Transporter } from 'nodemailer'

/**
 * SMTP service — envía emails vía SMTP genérico (nodemailer).
 *
 * Arquitectura:
 *  1. **Dev / early prod**: lee de `.env.local` (SMTP_* vars).
 *  2. **Prod multi-tenant**: lee de `studio_integrations` donde service='smtp'
 *     y saca password del Supabase Vault.
 *
 * La API pública es la misma: `sendEmail({ studioId, to, subject, html })`.
 * El fallback a env vars es transparente cuando no hay integración configurada.
 */

export type SendEmailInput = {
  studioId: string
  to: string
  toName?: string | null
  subject: string
  html: string
  text?: string | null
  replyTo?: string | null
  // Si se provee, override del From configurado
  fromEmail?: string | null
  fromName?: string | null
}

export type SendEmailResult = {
  ok: boolean
  messageId?: string
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Transporter cacheado por proceso
// ─────────────────────────────────────────────────────────────────────────────

let cachedEnvTransporter: Transporter | null = null

function getEnvTransporter(): Transporter | null {
  if (cachedEnvTransporter) return cachedEnvTransporter

  const host = process.env.SMTP_HOST
  const port = parseInt(process.env.SMTP_PORT ?? '465', 10)
  const user = process.env.SMTP_USER
  const password = process.env.SMTP_PASSWORD
  const secure = (process.env.SMTP_SECURE ?? 'true').toLowerCase() === 'true'

  if (!host || !user || !password) return null

  cachedEnvTransporter = nodemailer.createTransport({
    host,
    port,
    secure, // true = SSL (465), false = STARTTLS (587)
    auth: { user, pass: password },
    // Algunos hosts compartidos (cPanel) tienen certs auto-firmados
    tls: { rejectUnauthorized: false },
  })

  return cachedEnvTransporter
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Envía un email de forma síncrona. Retorna resultado en lugar de lanzar,
 * para que callers (createClientAction, etc.) puedan decidir qué hacer
 * si falla (logearlo, dejarlo en cola, etc.).
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  // TODO: cuando exista UI de integraciones SMTP por studio, leer primero
  // de `studio_integrations` (service='smtp') con el studioId.
  // Por ahora: fallback directo a env vars.
  const transporter = getEnvTransporter()

  if (!transporter) {
    console.warn(
      `[smtp.sendEmail] SMTP no configurado (env vars faltantes). Email a ${input.to} NO enviado.`,
    )
    return { ok: false, error: 'SMTP_NOT_CONFIGURED' }
  }

  const fromEmail =
    input.fromEmail ?? process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER ?? ''
  const fromName = input.fromName ?? process.env.SMTP_FROM_NAME ?? 'StudioFlow'

  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: input.toName ? `"${input.toName}" <${input.to}>` : input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? stripHtml(input.html),
      replyTo: input.replyTo ?? undefined,
    })
    console.log(`[smtp.sendEmail] ✉️  enviado a ${input.to} — id=${info.messageId}`)
    return { ok: true, messageId: info.messageId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[smtp.sendEmail] fallo envío a ${input.to}:`, message)
    return { ok: false, error: message }
  }
}

/**
 * Verifica la conexión SMTP — útil para el botón "Enviar email de prueba"
 * en `/settings/integrations/smtp`.
 */
export async function verifySmtpConnection(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const transporter = getEnvTransporter()
  if (!transporter) return { ok: false, error: 'SMTP_NOT_CONFIGURED' }
  try {
    await transporter.verify()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Util
// ─────────────────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
