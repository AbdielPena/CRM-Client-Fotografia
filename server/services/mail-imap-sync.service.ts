import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import {
  connectImap,
  closeImap,
  fetchNewMessages,
  type FetchedMessage,
} from "@/lib/mailcow"
import {
  decryptAccountForImap,
  type MailAccountRow,
} from "./mail-account.service"

/**
 * IMAP sync para módulo Mail.
 *
 * Flujo:
 *   1. syncAllActiveAccounts() — itera cuentas con sync_status='ok' o 'error'
 *      cuya last_synced_at sea > X min ago, y dispatcha syncMailAccount per una
 *   2. syncMailAccount(accountId) — bloquea con UPDATE sync_status='syncing'
 *      para evitar runs concurrentes; tras éxito o error actualiza last_synced_at
 *   3. fetchNewMessages → persiste cada mensaje:
 *      - Insert idempotente en mail_messages (UNIQUE account_id+message_id)
 *      - Resuelve thread_id via Message-ID / In-Reply-To / References
 *      - Crea/actualiza thread_id en mail_threads (recompute counters)
 *      - Sube attachments a Supabase Storage 'mail-attachments'
 *
 * Pensado para ejecutar desde Supabase Edge Function cron c/5min (no soporta
 * IMAP IDLE en serverless, así que polling). El job loguea métricas:
 *   accountId → { messages: 12, threads_touched: 8, attachments: 3, errors: 0 }
 */

// ============================================================================
// Tipos
// ============================================================================

export type SyncStats = {
  accountId: string
  email: string
  messagesNew: number
  messagesSkipped: number
  threadsTouched: number
  attachmentsUploaded: number
  errors: Array<{ uid: number; error: string }>
  durationMs: number
}

export type SyncResult =
  | { ok: true; stats: SyncStats }
  | { ok: false; accountId: string; error: string }

// ============================================================================
// Entry point — sync de UNA cuenta
// ============================================================================

/**
 * Sincroniza una cuenta Mailcow específica. Maneja:
 *   - Lock (sync_status='syncing') para evitar runs concurrentes desde cron
 *   - Catch errors → guarda last_error + sync_status='error'
 *   - Update last_uid_synced para incremental fetch en próximo run
 *   - Cap 100 mensajes por run (timeout cron Supabase ~10s default)
 */
export async function syncMailAccount(
  studioId: string,
  accountId: string,
  opts: { maxMessages?: number } = {},
): Promise<SyncResult> {
  const sb = untypedService()
  const startedAt = Date.now()

  // 1. Cargar account con creds + lock
  const { data: accountRaw, error: getErr } = await sb
    .from("mail_accounts")
    .select("*")
    .eq("id", accountId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .eq("is_active", true)
    .maybeSingle()

  if (getErr || !accountRaw) {
    return { ok: false, accountId, error: "MAIL_ACCOUNT_NOT_FOUND" }
  }
  const account = accountRaw as MailAccountRow

  if (account.sync_status === "syncing") {
    return { ok: false, accountId, error: "MAIL_SYNC_ALREADY_RUNNING" }
  }

  // Marcar syncing — el partial UNIQUE no aplica aquí, es un update simple
  await sb
    .from("mail_accounts")
    .update({ sync_status: "syncing" })
    .eq("id", accountId)

  // 2. Conectar IMAP + fetch
  let messages: FetchedMessage[] = []
  try {
    const imapConfig = await decryptAccountForImap(account)
    const client = await connectImap(imapConfig)
    try {
      messages = await fetchNewMessages(client, {
        mailbox: "INBOX",
        fromUid: account.last_uid_synced ?? null,
        maxMessages: opts.maxMessages ?? 100,
      })
    } finally {
      await closeImap(client)
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown IMAP error"
    await sb
      .from("mail_accounts")
      .update({
        sync_status: "error",
        last_error: errMsg.slice(0, 500),
      })
      .eq("id", accountId)
    return { ok: false, accountId, error: errMsg }
  }

  // 3. Persistir mensajes (idempotente vía UNIQUE)
  const stats: SyncStats = {
    accountId,
    email: account.email,
    messagesNew: 0,
    messagesSkipped: 0,
    threadsTouched: 0,
    attachmentsUploaded: 0,
    errors: [],
    durationMs: 0,
  }
  const touchedThreads = new Set<string>()
  let maxUid = account.last_uid_synced ?? 0

  // Resolver INBOX folder_id (o crearlo si no existe)
  const inboxFolderId = await ensureInboxFolder(studioId, accountId, account.email)

  for (const msg of messages) {
    try {
      const result = await persistMessage(studioId, account.id, inboxFolderId, msg)
      if (result.created) {
        stats.messagesNew++
        if (result.threadId) touchedThreads.add(result.threadId)
        stats.attachmentsUploaded += result.attachmentsCount
      } else {
        stats.messagesSkipped++
      }
      if (msg.uid > maxUid) maxUid = msg.uid
    } catch (err) {
      stats.errors.push({
        uid: msg.uid,
        error: err instanceof Error ? err.message : "Unknown",
      })
    }
  }

  // 4. Recompute thread counters
  for (const threadId of touchedThreads) {
    try {
      await sb.rpc("mail_recompute_thread_counters", { p_thread_id: threadId })
    } catch (err) {
      console.error("[mail-imap-sync] recompute thread failed:", threadId, err)
    }
  }
  stats.threadsTouched = touchedThreads.size

  // 5. Actualizar account state
  await sb
    .from("mail_accounts")
    .update({
      sync_status: stats.errors.length === 0 ? "ok" : "error",
      last_synced_at: new Date().toISOString(),
      last_uid_synced: maxUid > 0 ? maxUid : account.last_uid_synced,
      last_error:
        stats.errors.length > 0
          ? `${stats.errors.length} errores parseando mensajes`
          : null,
    })
    .eq("id", accountId)

  stats.durationMs = Date.now() - startedAt
  return { ok: true, stats }
}

// ============================================================================
// Sync de todas las cuentas activas (cron entry point)
// ============================================================================

/**
 * Llamado por el cron job. Itera todas las cuentas activas cuyo last_synced_at
 * sea > 4 minutos atrás (margin para job c/5min sin overlap).
 *
 * Las cuentas con sync_status='syncing' se saltan (ya hay un run en curso).
 * Las 'disabled' también se saltan.
 */
export async function syncAllActiveAccounts(): Promise<{
  total: number
  successes: number
  failures: number
  results: SyncResult[]
}> {
  const sb = untypedService()
  const cutoff = new Date(Date.now() - 4 * 60 * 1000).toISOString()

  const { data: accounts } = await sb
    .from("mail_accounts")
    .select("id, studio_id, email")
    .eq("is_active", true)
    .in("sync_status", ["ok", "error"])
    .is("deleted_at", null)
    .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`)
    .limit(50) // cap por run para no exceder timeout edge function

  const list = (accounts ?? []) as Array<{
    id: string
    studio_id: string
    email: string
  }>

  const results: SyncResult[] = []
  // Procesa secuencial — paralelo causaría rate limit en Mailcow y race en RPCs
  for (const acc of list) {
    try {
      const result = await syncMailAccount(acc.studio_id, acc.id)
      results.push(result)
    } catch (err) {
      results.push({
        ok: false,
        accountId: acc.id,
        error: err instanceof Error ? err.message : "Unknown",
      })
    }
  }

  return {
    total: list.length,
    successes: results.filter((r) => r.ok).length,
    failures: results.filter((r) => !r.ok).length,
    results,
  }
}

// ============================================================================
// Internals — persist message + threading
// ============================================================================

type PersistResult = {
  created: boolean
  messageId: string
  threadId: string | null
  attachmentsCount: number
}

async function persistMessage(
  studioId: string,
  accountId: string,
  folderId: string,
  msg: FetchedMessage,
): Promise<PersistResult> {
  const sb = untypedService()

  // 1. Idempotencia: check si ya existe por message_id
  if (msg.messageId) {
    const { data: existing } = await sb
      .from("mail_messages")
      .select("id, thread_id")
      .eq("account_id", accountId)
      .eq("message_id", msg.messageId)
      .is("deleted_at", null)
      .maybeSingle()

    if (existing) {
      return {
        created: false,
        messageId: existing.id as string,
        threadId: existing.thread_id as string | null,
        attachmentsCount: 0,
      }
    }
  }

  // 2. Resolver thread_id
  const threadId = await resolveThreadId(studioId, accountId, msg)

  // 3. Insert message
  const payload = {
    studio_id: studioId,
    account_id: accountId,
    thread_id: threadId,
    folder_id: folderId,
    direction: "inbound",
    status: "received",
    message_id: msg.messageId,
    in_reply_to: msg.inReplyTo,
    references_chain: msg.references.length > 0 ? msg.references : null,
    imap_uid: msg.uid,
    subject: msg.subject,
    from_email: msg.from.email,
    from_name: msg.from.name,
    to_recipients: msg.to,
    cc_recipients: msg.cc.length > 0 ? msg.cc : null,
    bcc_recipients: msg.bcc.length > 0 ? msg.bcc : null,
    reply_to: msg.replyTo,
    body_text: msg.textBody,
    body_html: msg.htmlBody,
    snippet: msg.snippet,
    has_attachments: msg.attachments.length > 0,
    size_bytes: msg.sizeBytes,
    sent_at: msg.date?.toISOString() ?? null,
    received_at: new Date().toISOString(),
    raw_headers: msg.rawHeaders,
  }

  const { data: row, error } = await sb
    .from("mail_messages")
    .insert(payload)
    .select("id")
    .single()

  if (error) {
    if (error.code === "23505") {
      // Race condition con UNIQUE — alguien insertó entre check y insert
      const { data: raced } = await sb
        .from("mail_messages")
        .select("id, thread_id")
        .eq("account_id", accountId)
        .eq("message_id", msg.messageId)
        .maybeSingle()
      if (raced) {
        return {
          created: false,
          messageId: raced.id as string,
          threadId: raced.thread_id as string | null,
          attachmentsCount: 0,
        }
      }
    }
    throwServiceError("MAIL_MESSAGE_PERSIST_FAILED", error)
  }

  const messageId = (row as { id: string }).id

  // 4. Subir attachments a Supabase Storage
  let attachmentsCount = 0
  for (const att of msg.attachments) {
    try {
      const storageKey = `${studioId}/${accountId}/${messageId}/${sanitizeFilename(att.filename)}`
      const { error: uploadErr } = await sb.storage
        .from("mail-attachments")
        .upload(storageKey, att.data, {
          contentType: att.contentType,
          upsert: false,
        })

      if (uploadErr) {
        console.warn(`[mail-imap-sync] attachment upload failed:`, att.filename, uploadErr)
        continue
      }

      await sb.from("mail_attachments").insert({
        studio_id: studioId,
        message_id: messageId,
        filename: att.filename,
        content_type: att.contentType,
        size_bytes: att.size,
        storage_key: storageKey,
        storage_bucket: "mail-attachments",
        is_inline: att.isInline,
        content_id: att.contentId,
      })
      attachmentsCount++
    } catch (err) {
      console.warn(`[mail-imap-sync] attachment persist failed:`, att.filename, err)
    }
  }

  return { created: true, messageId, threadId, attachmentsCount }
}

/**
 * Resuelve el thread_id para un mensaje inbound usando RFC 5322 threading:
 *   1. Si tiene In-Reply-To → buscar message con message_id = inReplyTo, usar su thread_id
 *   2. Si tiene References → buscar el primer message_id en la cadena, usar su thread_id
 *   3. Sino → crear nuevo thread con subject normalizado
 */
async function resolveThreadId(
  studioId: string,
  accountId: string,
  msg: FetchedMessage,
): Promise<string> {
  const sb = untypedService()

  // 1. In-Reply-To
  if (msg.inReplyTo) {
    const { data: parent } = await sb
      .from("mail_messages")
      .select("thread_id")
      .eq("account_id", accountId)
      .eq("message_id", msg.inReplyTo)
      .is("deleted_at", null)
      .maybeSingle()
    if (parent?.thread_id) return parent.thread_id as string
  }

  // 2. References chain — buscar cualquier mensaje en la cadena
  if (msg.references.length > 0) {
    const { data: ref } = await sb
      .from("mail_messages")
      .select("thread_id")
      .eq("account_id", accountId)
      .in("message_id", msg.references)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (ref?.thread_id) return ref.thread_id as string
  }

  // 3. Crear thread nuevo
  const participants = [
    { email: msg.from.email, name: msg.from.name },
    ...msg.to,
    ...msg.cc,
  ]
  const { data: newThread, error } = await sb
    .from("mail_threads")
    .insert({
      studio_id: studioId,
      account_id: accountId,
      subject: msg.subject,
      participants,
      last_message_at: msg.date?.toISOString() ?? new Date().toISOString(),
    })
    .select("id")
    .single()

  if (error) {
    throwServiceError("MAIL_THREAD_CREATE_FAILED", error, { studioId, accountId })
  }
  return (newThread as { id: string }).id
}

/**
 * Asegura que existe una row INBOX en mail_folders para la cuenta. Lazy-create
 * porque el sync inicial es cuando se crea (no en createMailAccount).
 */
async function ensureInboxFolder(
  studioId: string,
  accountId: string,
  email: string,
): Promise<string> {
  const sb = untypedService()

  const { data: existing } = await sb
    .from("mail_folders")
    .select("id")
    .eq("account_id", accountId)
    .eq("imap_path", "INBOX")
    .maybeSingle()

  if (existing) return existing.id as string

  const { data: created, error } = await sb
    .from("mail_folders")
    .insert({
      studio_id: studioId,
      account_id: accountId,
      kind: "inbox",
      name: "INBOX",
      imap_path: "INBOX",
    })
    .select("id")
    .single()

  if (error) {
    throwServiceError("MAIL_FOLDER_CREATE_FAILED", error, {
      studioId,
      accountId,
      email,
    })
  }
  return (created as { id: string }).id
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200)
}
