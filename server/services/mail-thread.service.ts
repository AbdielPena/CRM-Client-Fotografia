import "server-only"

import { untypedServer } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"

/**
 * Service de lectura del módulo Mail — threads + messages.
 *
 * Diseño:
 *   - getMailThreads: lista paginada con filtros (account, search, unread)
 *   - getMailThreadById: con todos sus messages ordenados cronológicamente
 *   - getMailMessageById: detalle de un message individual + attachments
 *
 * NO incluye mutaciones (mark-as-read, archive, move-to-folder) — esas
 * van en mail-thread.actions.ts próximo PR.
 */

export type MailThreadRow = {
  id: string
  studio_id: string
  account_id: string
  subject: string | null
  participants: Array<{ email: string; name: string | null }>
  last_message_at: string
  message_count: number
  unread_count: number
  has_attachments: boolean
  client_id: string | null
  project_id: string | null
  invoice_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type MailMessageRow = {
  id: string
  studio_id: string
  account_id: string
  thread_id: string | null
  folder_id: string | null
  direction: "inbound" | "outbound"
  status: string
  message_id: string | null
  in_reply_to: string | null
  references_chain: string[] | null
  imap_uid: number | null
  subject: string | null
  from_email: string
  from_name: string | null
  to_recipients: Array<{ email: string; name: string | null }>
  cc_recipients: Array<{ email: string; name: string | null }> | null
  bcc_recipients: Array<{ email: string; name: string | null }> | null
  reply_to: string | null
  body_text: string | null
  body_html: string | null
  snippet: string | null
  has_attachments: boolean
  size_bytes: number | null
  sent_at: string | null
  received_at: string | null
  read_at: string | null
  delivery_error: string | null
  client_id: string | null
  project_id: string | null
  invoice_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// ============================================================================
// Threads
// ============================================================================

export async function getMailThreads(
  studioId: string,
  opts: {
    accountId?: string
    search?: string
    unreadOnly?: boolean
    folderKind?: "inbox" | "sent" | "drafts" | "trash" | "spam" | "archive"
    page?: number
    pageSize?: number
  } = {},
) {
  const { page = 1, pageSize = 50 } = opts
  const sb = untypedServer()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = sb
    .from("mail_threads")
    .select(
      `*,
       account:mail_accounts(id, email, display_name),
       client:clients(id, name),
       project:projects(id, name),
       invoice:invoices(id, invoice_number, ncf)`,
      { count: "exact" },
    )
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false })
    .range(from, to)

  if (opts.accountId) query = query.eq("account_id", opts.accountId)
  if (opts.unreadOnly) query = query.gt("unread_count", 0)
  if (opts.search && opts.search.trim()) {
    const term = `%${opts.search.trim()}%`
    query = query.ilike("subject", term)
  }

  const { data, count, error } = await query
  if (error) throwServiceError("MAIL_THREAD_OP_FAILED", error)

  return {
    items: (data ?? []) as Array<
      MailThreadRow & {
        account?: { id: string; email: string; display_name: string | null } | null
        client?: { id: string; name: string } | null
        project?: { id: string; name: string } | null
        invoice?: { id: string; invoice_number: string; ncf: string | null } | null
      }
    >,
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize) || 1,
  }
}

export async function getMailThreadById(studioId: string, threadId: string) {
  const sb = untypedServer()

  const { data: thread, error: threadErr } = await sb
    .from("mail_threads")
    .select(
      `*,
       account:mail_accounts(id, email, display_name),
       client:clients(id, name, email),
       project:projects(id, name),
       invoice:invoices(id, invoice_number, ncf)`,
    )
    .eq("id", threadId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()

  if (threadErr) throwServiceError("MAIL_THREAD_OP_FAILED", threadErr)
  if (!thread) return null

  const { data: messages, error: msgErr } = await sb
    .from("mail_messages")
    .select(
      `id, direction, status, subject, from_email, from_name,
       to_recipients, cc_recipients, body_text, body_html, snippet,
       sent_at, received_at, read_at, has_attachments, delivery_error,
       attachments:mail_attachments(id, filename, content_type, size_bytes,
         storage_key, storage_bucket, is_inline, content_id)`,
    )
    .eq("thread_id", threadId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("sent_at", { ascending: true, nullsFirst: false })
    .order("received_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })

  if (msgErr) throwServiceError("MAIL_THREAD_MESSAGES_FAILED", msgErr)

  return {
    thread: thread as MailThreadRow & {
      account?: { id: string; email: string; display_name: string | null } | null
      client?: { id: string; name: string; email: string | null } | null
      project?: { id: string; name: string } | null
      invoice?: { id: string; invoice_number: string; ncf: string | null } | null
    },
    messages: (messages ?? []) as Array<
      Partial<MailMessageRow> & {
        attachments?: Array<{
          id: string
          filename: string
          content_type: string
          size_bytes: number
          storage_key: string
          storage_bucket: string
          is_inline: boolean
          content_id: string | null
        }>
      }
    >,
  }
}
