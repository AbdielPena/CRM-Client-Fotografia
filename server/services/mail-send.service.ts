import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"
import {
  createSmtpTransport,
  sendEmail,
} from "@/lib/mailcow"
import {
  decryptAccountForSmtp,
  getMailAccountById,
} from "./mail-account.service"
import type { SendMailInput } from "@/lib/validations/mail-send.schema"

/**
 * Service para envío de emails via Mailcow SMTP.
 *
 * Flujo:
 *   1. Cargar account (con creds descifradas)
 *   2. Si replyToMessageId: cargar parent message para construir
 *      In-Reply-To + References (threading correcto en cliente destinatario)
 *   3. Insert pre-send mail_messages con status='queued' (audit / outbound queue)
 *   4. Llamar sendEmail (nodemailer via lib/mailcow)
 *   5. Update mail_messages: status='sent', sent_at, sent_via_pi_id (smtp result)
 *   6. Si reply: resolve thread_id del parent y vincular nuestro outbound al
 *      mismo thread → recompute thread counters
 *   7. logActivity
 *
 * Error handling:
 *   - Si SMTP falla → mail_messages.status='failed' + delivery_error
 *   - Si tx fail después de sendEmail succeed → log critical (email ya enviado
 *     pero sin row de tracking — recuperable manualmente)
 */

export type SendResult = {
  ok: true
  messageId: string         // ID del row en mail_messages
  rfcMessageId: string      // Message-ID del header (RFC 5322)
  threadId: string | null
  accepted: string[]
  rejected: string[]
} | {
  ok: false
  messageId: string | null  // si se creó la row queued antes de fallar
  error: string
}

export async function sendMail(
  studioId: string,
  actorId: string,
  data: SendMailInput,
): Promise<SendResult> {
  const sb = untypedService()

  // 1. Cargar account
  const account = await getMailAccountById(studioId, data.accountId)
  if (!account) {
    return { ok: false, messageId: null, error: "MAIL_ACCOUNT_NOT_FOUND" }
  }
  if (!account.is_active) {
    return { ok: false, messageId: null, error: "MAIL_ACCOUNT_INACTIVE" }
  }

  // 2. Resolver threading si es reply
  let threadId: string | null = null
  let inReplyTo: string | null = null
  let references: string[] = []
  if (data.replyToMessageId) {
    const { data: parent } = await sb
      .from("mail_messages")
      .select("id, thread_id, message_id, references_chain")
      .eq("id", data.replyToMessageId)
      .eq("studio_id", studioId)
      .is("deleted_at", null)
      .maybeSingle()
    if (parent) {
      threadId = parent.thread_id as string | null
      inReplyTo = parent.message_id as string | null
      references = [
        ...((parent.references_chain as string[] | null) ?? []),
        ...(parent.message_id ? [parent.message_id as string] : []),
      ]
    }
  }

  // 3. Insert pre-send queued row
  const queuedPayload = {
    studio_id: studioId,
    account_id: account.id,
    thread_id: threadId,
    direction: "outbound",
    status: "queued",
    in_reply_to: inReplyTo,
    references_chain: references.length > 0 ? references : null,
    subject: data.subject,
    from_email: account.email,
    from_name: account.display_name,
    to_recipients: data.to,
    cc_recipients: data.cc && data.cc.length > 0 ? data.cc : null,
    bcc_recipients: data.bcc && data.bcc.length > 0 ? data.bcc : null,
    body_text: data.textBody ?? null,
    body_html: data.htmlBody ?? null,
    snippet: ((data.textBody ?? data.htmlBody ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 140),
    has_attachments: (data.attachments?.length ?? 0) > 0,
    client_id: data.clientId ?? null,
    project_id: data.projectId ?? null,
    invoice_id: data.invoiceId ?? null,
  }

  const { data: queuedRow, error: queuedErr } = await sb
    .from("mail_messages")
    .insert(queuedPayload)
    .select("id")
    .single()

  if (queuedErr) {
    throwServiceError("MAIL_QUEUE_INSERT_FAILED", queuedErr, { studioId })
  }
  const messageDbId = (queuedRow as { id: string }).id

  // 4. Update status to 'sending' (atomic flag para que no haya dos sends del mismo row)
  await sb
    .from("mail_messages")
    .update({ status: "sending" })
    .eq("id", messageDbId)

  // 5. Send via SMTP
  let smtpResult: { messageId: string; accepted: string[]; rejected: string[] }
  try {
    const smtpConfig = decryptAccountForSmtp(account)
    const transporter = createSmtpTransport(smtpConfig)

    // Convertir attachments base64 → Buffer
    const attachments = data.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.contentBase64, "base64"),
      contentType: a.contentType,
      cid: a.cid,
    }))

    smtpResult = await sendEmail(transporter, {
      from: {
        email: account.email,
        name: account.display_name ?? undefined,
      },
      to: data.to,
      cc: data.cc,
      bcc: data.bcc,
      subject: data.subject,
      textBody: data.textBody,
      htmlBody: data.htmlBody,
      inReplyTo: inReplyTo ?? undefined,
      references: references.length > 0 ? references : undefined,
      attachments,
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "SMTP unknown error"
    await sb
      .from("mail_messages")
      .update({
        status: "failed",
        delivery_error: errMsg.slice(0, 500),
      })
      .eq("id", messageDbId)
    return { ok: false, messageId: messageDbId, error: errMsg }
  }

  // 6. Update con resultado SMTP
  const sentAt = new Date().toISOString()
  await sb
    .from("mail_messages")
    .update({
      status: smtpResult.rejected.length === 0 ? "sent" : "bounced",
      message_id: smtpResult.messageId,
      sent_at: sentAt,
      delivery_error:
        smtpResult.rejected.length > 0
          ? `Rejected: ${smtpResult.rejected.join(", ")}`
          : null,
    })
    .eq("id", messageDbId)

  // 7. Si es nuevo thread (no era reply), crear thread
  if (!threadId) {
    const participants = [
      { email: account.email, name: account.display_name ?? null },
      ...data.to,
      ...(data.cc ?? []),
    ]
    const { data: newThread } = await sb
      .from("mail_threads")
      .insert({
        studio_id: studioId,
        account_id: account.id,
        subject: data.subject,
        participants,
        last_message_at: sentAt,
        client_id: data.clientId ?? null,
        project_id: data.projectId ?? null,
        invoice_id: data.invoiceId ?? null,
      })
      .select("id")
      .single()

    if (newThread) {
      threadId = (newThread as { id: string }).id
      await sb
        .from("mail_messages")
        .update({ thread_id: threadId })
        .eq("id", messageDbId)
    }
  }

  // 8. Recompute thread counters
  if (threadId) {
    try {
      await sb.rpc("mail_recompute_thread_counters", { p_thread_id: threadId })
    } catch (err) {
      console.warn("[mail-send] recompute thread failed:", threadId, err)
    }
  }

  // 9. Activity log
  await logActivity({
    studioId,
    actorId,
    entityType: "mail_message",
    entityId: messageDbId,
    action: data.replyToMessageId ? "mail_message.replied" : "mail_message.sent",
    metadata: {
      to_count: data.to.length,
      subject: data.subject,
      thread_id: threadId,
      rejected: smtpResult.rejected.length,
    },
  })

  return {
    ok: true,
    messageId: messageDbId,
    rfcMessageId: smtpResult.messageId,
    threadId,
    accepted: smtpResult.accepted,
    rejected: smtpResult.rejected,
  }
}
