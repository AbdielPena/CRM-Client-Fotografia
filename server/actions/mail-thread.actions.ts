"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import { untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "@/server/services/activity.service"
import { sendMail } from "@/server/services/mail-send.service"
import {
  sendMailSchema,
  type SendMailInput,
} from "@/lib/validations/mail-send.schema"

/**
 * Server Actions para mutar el state de threads/messages del módulo Mail.
 *
 * Cubre los flows típicos del inbox:
 *   - Marcar mensaje como leído / no leído
 *   - Archivar / restaurar thread
 *   - Linkear a cliente / proyecto / invoice del CRM
 *   - Send mail (compose o reply) — delega a mail-send.service
 *   - Move-to-folder (futuro V2 con IDLE sync)
 */

// ---------------------------------------------------------------------------
// Mark as read / unread
// ---------------------------------------------------------------------------

export async function markMailMessageReadAction(
  messageId: string,
  read: boolean,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const sb = untypedService()
  const { data: existing } = await sb
    .from("mail_messages")
    .select("id, thread_id, studio_id, read_at")
    .eq("id", messageId)
    .eq("studio_id", session.studioId)
    .maybeSingle()

  if (!existing) return { ok: false, message: "Mensaje no encontrado." }

  const { error } = await sb
    .from("mail_messages")
    .update({
      read_at: read ? new Date().toISOString() : null,
      status: read ? "read" : "received",
    })
    .eq("id", messageId)
    .eq("studio_id", session.studioId)

  if (error)
    throwServiceError("MAIL_MESSAGE_UPDATE_FAILED", error, {
      studioId: session.studioId,
      messageId,
    })

  // Recalcular counters del thread
  if (existing.thread_id) {
    try {
      await sb.rpc("mail_recompute_thread_counters", {
        p_thread_id: existing.thread_id,
      })
    } catch (err) {
      console.warn("[mail-thread] recompute failed:", err)
    }
    revalidatePath(`/mail/threads/${existing.thread_id}`)
  }
  revalidatePath("/mail/inbox")
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Mark whole thread as read (típico: al abrirlo)
// ---------------------------------------------------------------------------

export async function markMailThreadReadAction(
  threadId: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const sb = untypedService()
  const nowIso = new Date().toISOString()
  const { error } = await sb
    .from("mail_messages")
    .update({ read_at: nowIso, status: "read" })
    .eq("studio_id", session.studioId)
    .eq("thread_id", threadId)
    .eq("direction", "inbound")
    .is("read_at", null)
    .is("deleted_at", null)

  if (error)
    throwServiceError("MAIL_THREAD_READ_FAILED", error, {
      studioId: session.studioId,
      threadId,
    })

  try {
    await sb.rpc("mail_recompute_thread_counters", { p_thread_id: threadId })
  } catch (err) {
    console.warn("[mail-thread] recompute failed:", err)
  }

  revalidatePath(`/mail/threads/${threadId}`)
  revalidatePath("/mail/inbox")
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Link thread a entidad del CRM
// ---------------------------------------------------------------------------

export async function linkMailThreadAction(
  threadId: string,
  link: { clientId?: string | null; projectId?: string | null; invoiceId?: string | null },
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const sb = untypedService()
  const patch: Record<string, unknown> = {}
  if (link.clientId !== undefined) patch.client_id = link.clientId
  if (link.projectId !== undefined) patch.project_id = link.projectId
  if (link.invoiceId !== undefined) patch.invoice_id = link.invoiceId

  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await sb
    .from("mail_threads")
    .update(patch)
    .eq("id", threadId)
    .eq("studio_id", session.studioId)
    .is("deleted_at", null)

  if (error)
    throwServiceError("MAIL_THREAD_LINK_FAILED", error, {
      studioId: session.studioId,
      threadId,
    })

  await logActivity({
    studioId: session.studioId,
    actorId: session.userId,
    entityType: "mail_thread",
    entityId: threadId,
    action: "mail_thread.linked",
    metadata: link as Record<string, unknown>,
  })

  revalidatePath(`/mail/threads/${threadId}`)
  return { ok: true, message: "Thread vinculado." }
}

// ---------------------------------------------------------------------------
// Archive / trash
// ---------------------------------------------------------------------------

export async function archiveMailThreadAction(
  threadId: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const sb = untypedService()
  const { error } = await sb
    .from("mail_threads")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", threadId)
    .eq("studio_id", session.studioId)
    .is("deleted_at", null)

  if (error)
    throwServiceError("MAIL_THREAD_ARCHIVE_FAILED", error, {
      studioId: session.studioId,
      threadId,
    })

  await logActivity({
    studioId: session.studioId,
    actorId: session.userId,
    entityType: "mail_thread",
    entityId: threadId,
    action: "mail_thread.archived",
  })

  revalidatePath("/mail/inbox")
  return { ok: true, message: "Thread archivado." }
}

// ---------------------------------------------------------------------------
// Send mail (compose o reply)
// ---------------------------------------------------------------------------

export type SendMailActionState = {
  ok?: boolean
  message?: string
  fieldErrors?: Record<string, string[]>
  threadId?: string | null
  values?: Record<string, string>
}

function collectValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  formData.forEach((v, k) => {
    if (typeof v === "string") out[k] = v
  })
  return out
}

/**
 * Parsea destinatarios desde un string CSV: "Juan <juan@x.com>, maria@y.com"
 * → [{ email: "juan@x.com", name: "Juan" }, { email: "maria@y.com" }]
 */
function parseRecipients(input: string | null | undefined) {
  if (!input || !input.trim()) return []
  return input
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const m = /^(?:"?([^"<]*?)"?\s*)?<?([^<>]+@[^<>]+)>?$/.exec(entry)
      if (!m) return { email: entry }
      return {
        email: m[2].trim(),
        ...(m[1] && m[1].trim() ? { name: m[1].trim() } : {}),
      }
    })
}

export async function sendMailAction(
  _prev: SendMailActionState,
  formData: FormData,
): Promise<SendMailActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)
  const raw = {
    accountId: formData.get("accountId"),
    to: parseRecipients(formData.get("to") as string | null),
    cc: parseRecipients(formData.get("cc") as string | null),
    bcc: parseRecipients(formData.get("bcc") as string | null),
    subject: formData.get("subject"),
    textBody: formData.get("textBody"),
    htmlBody: formData.get("htmlBody"),
    replyToMessageId: formData.get("replyToMessageId") || undefined,
    clientId: formData.get("clientId") || undefined,
    projectId: formData.get("projectId") || undefined,
    invoiceId: formData.get("invoiceId") || undefined,
  }

  const parsed = sendMailSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      message: "Validación falló.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      values,
    }
  }

  const result = await sendMail(
    session.studioId,
    session.userId,
    parsed.data as SendMailInput,
  )

  if (!result.ok) {
    return {
      ok: false,
      message: `Envío falló: ${result.error}`,
      values,
    }
  }

  revalidatePath("/mail/inbox")
  if (result.threadId) {
    revalidatePath(`/mail/threads/${result.threadId}`)
  }

  return {
    ok: true,
    message:
      result.rejected.length > 0
        ? `Enviado con rechazos: ${result.rejected.join(", ")}`
        : `Enviado a ${result.accepted.length} destinatario(s).`,
    threadId: result.threadId,
  }
}
