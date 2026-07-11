import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { sendEmail } from "./smtp.service"

/**
 * Drenador de la cola `email_queue` — envía 100% por **mailcow** (SMTP propio,
 * vía `smtp.service`). Reemplaza al worker edge de Resend (que estaba muerto:
 * `app.functions_base_url` nunca se configuró). Se invoca desde el endpoint
 * interno `/api/internal/v1/email-drain`, disparado por un cron del VPS.
 *
 * Garantías:
 *  - Remitente SIEMPRE la cuenta autenticada de mailcow (from_email=null); el
 *    correo del estudio va como Reply-To → evita el 553 "sender not owned".
 *  - Lock atómico (status→'sending' condicionado a 'pending'/'retrying') para
 *    que dos drenajes concurrentes no manden el mismo correo dos veces.
 *  - Reintentos con backoff exponencial hasta max_attempts; luego 'failed'.
 *  - Reaper: filas atascadas en 'sending' > 15 min vuelven a 'retrying'.
 */

const BATCH_SIZE = 10 // acotado: cada fila es un round-trip SMTP secuencial
const BACKOFF_BASE_SEC = 300 // 5 min · 10 · 20 …
const STALE_SENDING_MIN = 15

/**
 * Slugs de correos de MARKETING (engagement). Solo estos: (a) respetan la baja
 * del cliente (email_opted_out_at) y (b) llevan cabecera List-Unsubscribe. Los
 * transaccionales (facturas, galerías, entregas, recordatorios) NO se afectan.
 * También se marca marketing con metadata.marketing=true (engagement no setea slug).
 */
const MARKETING_SLUGS = new Set<string>([
  "engagement_birthday_soon",
  "engagement_birthday_greeting",
  "engagement_post_delivery",
  "engagement_reengagement",
  "engagement_review_request",
  "engagement_generic",
])

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://my.abbypixel.com").replace(/\/+$/, "")
}

type QueueRow = {
  id: string
  studio_id: string
  to_email: string
  to_name: string | null
  from_email: string | null
  from_name: string | null
  reply_to: string | null
  subject: string
  body_html: string
  body_text: string | null
  attempts: number
  max_attempts: number | null
  template_slug: string | null
  metadata: Record<string, unknown> | null
}

export type DrainResult = {
  processed: number
  sent: number
  retrying: number
  failed: number
  reaped: number
}

export async function drainEmailQueue(limit = BATCH_SIZE): Promise<DrainResult> {
  const sb = untypedService()

  // 0) Reaper: rescatar filas colgadas en 'sending' (proceso murió a mitad).
  const staleCutoff = new Date(Date.now() - STALE_SENDING_MIN * 60_000).toISOString()
  const { data: reapedRows } = await sb
    .from("email_queue")
    .update({ status: "retrying", scheduled_for: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("status", "sending")
    .lt("updated_at", staleCutoff)
    .select("id")
  const reaped = (reapedRows ?? []).length

  // 1) Lote de pendientes/retrying ya vencidos.
  const { data: batch } = await sb
    .from("email_queue")
    .select(
      "id, studio_id, to_email, to_name, from_email, from_name, reply_to, subject, body_html, body_text, attempts, max_attempts, template_slug, metadata",
    )
    .in("status", ["pending", "retrying"])
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(limit)

  const rows = (batch ?? []) as QueueRow[]
  let sent = 0
  let retrying = 0
  let failed = 0

  for (const row of rows) {
    // Lock atómico: solo procede si SIGUE pending/retrying.
    const { data: locked } = await sb
      .from("email_queue")
      .update({ status: "sending", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .in("status", ["pending", "retrying"])
      .select("id")
      .maybeSingle()
    if (!locked) continue // otro drenaje la tomó

    // Defensa: filas sin cuerpo (legacy mal formadas) → cancelar, NO enviar
    // un correo vacío ni entrar en bucle de reintento.
    if (!row.body_html || row.body_html.trim().length === 0) {
      await sb
        .from("email_queue")
        .update({
          status: "cancelled",
          last_error: "sin body_html",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("status", "sending")
      continue
    }

    // Marketing (engagement): respeta la baja del cliente + añade List-Unsubscribe
    // de 1 clic. Transaccional (facturas, galerías, entregas, recordatorios): sin
    // baja ni cabecera → siempre se envía.
    const isMarketing =
      (row.template_slug != null && MARKETING_SLUGS.has(row.template_slug)) ||
      (row.metadata as { marketing?: boolean } | null)?.marketing === true
    let extraHeaders: Record<string, string> | undefined
    if (isMarketing) {
      const { data: cliRow } = await sb
        .from("clients")
        .select("email_token, email_opted_out_at")
        .eq("studio_id", row.studio_id)
        .ilike("email", row.to_email)
        .limit(1)
        .maybeSingle()
      const cli = cliRow as
        | { email_token: string | null; email_opted_out_at: string | null }
        | null
      if (cli?.email_opted_out_at) {
        // Dado de baja de correos no esenciales → no enviar este marketing.
        await sb
          .from("email_queue")
          .update({
            status: "cancelled",
            last_error: "cliente dado de baja (marketing)",
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id)
          .eq("status", "sending")
        continue
      }
      if (cli?.email_token) {
        const unsubUrl = `${appBaseUrl()}/e/${cli.email_token}/unsubscribe`
        const mailTo = row.reply_to ?? row.from_email
        const listParts = mailTo
          ? [`<mailto:${mailTo}?subject=Baja>`, `<${unsubUrl}>`]
          : [`<${unsubUrl}>`]
        extraHeaders = {
          "List-Unsubscribe": listParts.join(", "),
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      }
    }

    const res = await sendEmail({
      studioId: row.studio_id,
      to: row.to_email,
      toName: row.to_name,
      subject: row.subject,
      html: row.body_html,
      text: row.body_text,
      // From = cuenta autenticada de mailcow; correo del estudio como Reply-To.
      fromEmail: null,
      fromName: row.from_name,
      replyTo: row.reply_to ?? row.from_email,
      headers: extraHeaders,
    })

    const nowIso = new Date().toISOString()
    if (res.ok) {
      await sb
        .from("email_queue")
        .update({
          status: "sent",
          sent_at: nowIso,
          provider: "smtp-mailcow",
          provider_message_id: res.messageId ?? null,
          attempts: row.attempts + 1,
          last_error: null,
          updated_at: nowIso,
        })
        .eq("id", row.id)
        .eq("status", "sending") // solo si seguimos siendo dueños del lock
      sent++
    } else {
      const attempts = row.attempts + 1
      const isFinal = attempts >= (row.max_attempts ?? 3)
      const delaySec = BACKOFF_BASE_SEC * Math.pow(2, attempts - 1)
      await sb
        .from("email_queue")
        .update({
          status: isFinal ? "failed" : "retrying",
          attempts,
          last_error: res.error ?? "unknown error",
          failed_at: isFinal ? nowIso : null,
          // si reintenta: agendar al futuro; si final: no tocar scheduled_for.
          ...(isFinal
            ? {}
            : { scheduled_for: new Date(Date.now() + delaySec * 1000).toISOString() }),
          updated_at: nowIso,
        })
        .eq("id", row.id)
        .eq("status", "sending") // solo si seguimos siendo dueños del lock
      if (isFinal) failed++
      else retrying++
    }
  }

  return { processed: rows.length, sent, retrying, failed, reaped }
}
