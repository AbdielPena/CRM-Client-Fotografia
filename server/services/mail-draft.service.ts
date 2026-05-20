import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"

/**
 * Service de borradores (drafts) del módulo Mail.
 *
 * Diseño:
 *   - upsertDraft: si draftId existe → update; si no, insert con status='draft'
 *   - listDrafts: obtiene drafts del studio (folder kind='drafts')
 *   - getDraftById: detalle para retomar redacción
 *   - deleteDraft: borrado físico (no soft) porque son temporales
 *   - convertDraftToSend: marca el draft como 'queued' para que el sender lo
 *     procese; el caller debería llamar a sendMailMessage después
 *
 * Auto-save: el ComposeForm hace POST cada 5s (o on blur) con el draftId.
 * Idempotencia: el endpoint usa upsertDraft.
 */

export type MailDraftPayload = {
  accountId: string
  to: Array<{ email: string; name?: string }>
  cc?: Array<{ email: string; name?: string }>
  bcc?: Array<{ email: string; name?: string }>
  subject?: string
  bodyText?: string
  bodyHtml?: string
  inReplyTo?: string // message_id del email respondido
  references?: string[] // chain RFC 5322
  threadId?: string
  clientId?: string
  projectId?: string
  invoiceId?: string
}

async function getOrCreateDraftsFolder(
  studioId: string,
  accountId: string,
): Promise<string> {
  const sb = untypedService()

  const { data: existing } = await sb
    .from("mail_folders")
    .select("id")
    .eq("studio_id", studioId)
    .eq("account_id", accountId)
    .eq("kind", "drafts")
    .maybeSingle()

  if (existing?.id) return existing.id as string

  const { data: created, error } = await sb
    .from("mail_folders")
    .insert({
      studio_id: studioId,
      account_id: accountId,
      kind: "drafts",
      name: "Drafts",
      imap_path: "Drafts",
    })
    .select("id")
    .maybeSingle()

  if (error || !created?.id)
    throwServiceError("MAIL_DRAFTS_FOLDER_FAILED", error, { studioId, accountId })

  return created!.id as string
}

export async function upsertMailDraft(
  studioId: string,
  actorId: string,
  data: MailDraftPayload & { draftId?: string },
): Promise<{ id: string; isNew: boolean }> {
  const sb = untypedService()

  // Validar account
  const { data: account } = await sb
    .from("mail_accounts")
    .select("id, email, display_name")
    .eq("id", data.accountId)
    .eq("studio_id", studioId)
    .maybeSingle()
  if (!account) throw new Error("MAIL_ACCOUNT_NOT_FOUND")

  const folderId = await getOrCreateDraftsFolder(studioId, data.accountId)

  const payload = {
    studio_id: studioId,
    account_id: data.accountId,
    folder_id: folderId,
    direction: "outbound" as const,
    status: "draft" as const,
    subject: data.subject ?? null,
    from_email: account.email,
    from_name: account.display_name,
    to_recipients: data.to,
    cc_recipients: data.cc ?? null,
    bcc_recipients: data.bcc ?? null,
    body_text: data.bodyText ?? null,
    body_html: data.bodyHtml ?? null,
    in_reply_to: data.inReplyTo ?? null,
    references_chain: data.references ?? null,
    thread_id: data.threadId ?? null,
    client_id: data.clientId ?? null,
    project_id: data.projectId ?? null,
    invoice_id: data.invoiceId ?? null,
    has_attachments: false, // attachments se manejan separadamente
  }

  if (data.draftId) {
    // Update existing draft (validar tenant)
    const { data: existing } = await sb
      .from("mail_messages")
      .select("id, studio_id, status")
      .eq("id", data.draftId)
      .maybeSingle()
    if (!existing || existing.studio_id !== studioId) {
      throw new Error("MAIL_DRAFT_NOT_FOUND")
    }
    if (existing.status !== "draft") {
      throw new Error("MAIL_DRAFT_ALREADY_SENT")
    }

    const { error } = await sb
      .from("mail_messages")
      .update(payload)
      .eq("id", data.draftId)
      .eq("studio_id", studioId)

    if (error)
      throwServiceError("MAIL_DRAFT_UPDATE_FAILED", error, {
        studioId,
        draftId: data.draftId,
      })

    return { id: data.draftId, isNew: false }
  } else {
    // Create new draft
    const { data: row, error } = await sb
      .from("mail_messages")
      .insert(payload)
      .select("id")
      .single()

    if (error)
      throwServiceError("MAIL_DRAFT_CREATE_FAILED", error, { studioId })

    await logActivity({
      studioId,
      actorId,
      entityType: "mail_message",
      entityId: row.id as string,
      action: "mail_draft.created",
    })

    return { id: row.id as string, isNew: true }
  }
}

export async function getMailDrafts(
  studioId: string,
  opts: { accountId?: string; page?: number; pageSize?: number } = {},
) {
  const { page = 1, pageSize = 50 } = opts
  const sb = untypedServer()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = sb
    .from("mail_messages")
    .select(
      `id, subject, from_email, to_recipients, snippet, updated_at, account_id,
       account:mail_accounts(id, email, display_name),
       thread_id`,
      { count: "exact" },
    )
    .eq("studio_id", studioId)
    .eq("direction", "outbound")
    .eq("status", "draft")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .range(from, to)

  if (opts.accountId) query = query.eq("account_id", opts.accountId)

  const { data, count, error } = await query
  if (error) throwServiceError("MAIL_DRAFTS_LIST_FAILED", error, { studioId })

  return {
    items: (data ?? []) as Array<{
      id: string
      subject: string | null
      from_email: string
      to_recipients: Array<{ email: string; name: string | null }>
      snippet: string | null
      updated_at: string
      account_id: string
      thread_id: string | null
      account?: { id: string; email: string; display_name: string | null } | null
    }>,
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize) || 1,
  }
}

export async function getMailDraftById(studioId: string, draftId: string) {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("mail_messages")
    .select("*")
    .eq("id", draftId)
    .eq("studio_id", studioId)
    .eq("direction", "outbound")
    .eq("status", "draft")
    .is("deleted_at", null)
    .maybeSingle()

  if (error) throwServiceError("MAIL_DRAFT_GET_FAILED", error)
  return data
}

export async function deleteMailDraft(
  studioId: string,
  actorId: string,
  draftId: string,
) {
  const sb = untypedService()
  const { data: existing } = await sb
    .from("mail_messages")
    .select("id, status")
    .eq("id", draftId)
    .eq("studio_id", studioId)
    .maybeSingle()

  if (!existing) throw new Error("MAIL_DRAFT_NOT_FOUND")
  if (existing.status !== "draft") throw new Error("MAIL_DRAFT_ALREADY_SENT")

  const { error } = await sb
    .from("mail_messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", draftId)
    .eq("studio_id", studioId)

  if (error)
    throwServiceError("MAIL_DRAFT_DELETE_FAILED", error, { studioId, draftId })

  await logActivity({
    studioId,
    actorId,
    entityType: "mail_message",
    entityId: draftId,
    action: "mail_draft.deleted",
  })
}

/**
 * Lista mensajes enviados (status='sent' o 'delivered' direction='outbound').
 */
export async function getMailSent(
  studioId: string,
  opts: { accountId?: string; page?: number; pageSize?: number } = {},
) {
  const { page = 1, pageSize = 50 } = opts
  const sb = untypedServer()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = sb
    .from("mail_messages")
    .select(
      `id, subject, from_email, to_recipients, snippet, sent_at, status, has_attachments,
       account:mail_accounts(id, email, display_name),
       thread_id`,
      { count: "exact" },
    )
    .eq("studio_id", studioId)
    .eq("direction", "outbound")
    .in("status", ["sent", "delivered", "bounced", "failed"])
    .is("deleted_at", null)
    .order("sent_at", { ascending: false, nullsFirst: false })
    .range(from, to)

  if (opts.accountId) query = query.eq("account_id", opts.accountId)

  const { data, count, error } = await query
  if (error) throwServiceError("MAIL_SENT_LIST_FAILED", error, { studioId })

  return {
    items: (data ?? []) as Array<{
      id: string
      subject: string | null
      from_email: string
      to_recipients: Array<{ email: string; name: string | null }>
      snippet: string | null
      sent_at: string | null
      status: string
      has_attachments: boolean
      thread_id: string | null
      account?: { id: string; email: string; display_name: string | null } | null
    }>,
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize) || 1,
  }
}
