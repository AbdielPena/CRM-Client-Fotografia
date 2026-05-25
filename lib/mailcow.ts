import "server-only"

import { ImapFlow } from "imapflow"
import { simpleParser, type ParsedMail } from "mailparser"
import { createTransport, type Transporter } from "nodemailer"

/**
 * Mailcow client — wrappers IMAP (inbound) + SMTP (outbound).
 *
 * Responsabilidades:
 *   - Conectar a IMAP del Mailcow del studio
 *   - UID-FETCH de mensajes nuevos desde last_uid_synced
 *   - Parse de MIME → estructura limpia (subject, from, to, body, attachments)
 *   - Send via SMTP (con DKIM/SPF de Mailcow ya configurado)
 *
 * NO maneja:
 *   - Persistencia en DB (lo hace mail-imap-sync.service.ts)
 *   - Upload de attachments a Storage (lo hace mail-imap-sync)
 *   - Decrypt de passwords (asume que el caller ya las descifró del secret)
 *
 * Patrón uso:
 *   const client = await connectImap(account)
 *   const messages = await fetchNewMessages(client, fromUid)
 *   await closeImap(client)
 *
 * Limitations conocidas:
 *   - imapflow no soporta IMAP IDLE en serverless edge → usar cron 5min
 *   - mailparser carga MIME completo en memoria → cap a 25MB por mensaje
 */

// ============================================================================
// Types
// ============================================================================

export type MailcowImapConfig = {
  host: string
  port: number
  secure: boolean
  username: string
  password: string                                       // ya descifrado
}

export type MailcowSmtpConfig = {
  host: string
  port: number
  secure: boolean
  username: string
  password: string                                       // ya descifrado
}

export type FetchedMessage = {
  uid: number
  messageId: string | null                               // header Message-ID
  inReplyTo: string | null
  references: string[]
  subject: string | null
  from: { email: string; name: string | null }
  to: Array<{ email: string; name: string | null }>
  cc: Array<{ email: string; name: string | null }>
  bcc: Array<{ email: string; name: string | null }>
  replyTo: string | null
  date: Date | null
  textBody: string | null
  htmlBody: string | null
  snippet: string                                        // primeros ~140 chars
  attachments: Array<{
    filename: string
    contentType: string
    size: number
    contentId: string | null
    isInline: boolean
    /** Buffer raw — el caller debe subirlo a Storage rápido y descartar */
    data: Buffer
  }>
  rawHeaders: Record<string, string | string[]>
  sizeBytes: number
}

export type SendMessageInput = {
  from: { email: string; name?: string }
  to: Array<{ email: string; name?: string }>
  cc?: Array<{ email: string; name?: string }>
  bcc?: Array<{ email: string; name?: string }>
  replyTo?: string
  subject: string
  textBody?: string
  htmlBody?: string
  inReplyTo?: string                                     // Message-ID del email padre
  references?: string[]                                  // chain de References
  attachments?: Array<{
    filename: string
    content: Buffer | string
    contentType?: string
    cid?: string                                          // inline content-id
  }>
}

export type SendResult = {
  messageId: string                                       // Message-ID generado
  accepted: string[]                                      // recipients aceptados
  rejected: string[]                                      // recipients rechazados
}

// ============================================================================
// IMAP — inbound
// ============================================================================

/**
 * Abre conexión IMAP al Mailcow. El caller debe `await closeImap(client)`.
 */
export async function connectImap(config: MailcowImapConfig): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.username,
      pass: config.password,
    },
    logger: false,                                       // silencia los logs verbosos
    // Timeouts agresivos — el sync corre cada 5min, no queremos colgarnos
    socketTimeout: 30_000,
    greetingTimeout: 10_000,
  })

  await client.connect()
  return client
}

export async function closeImap(client: ImapFlow): Promise<void> {
  try {
    await client.logout()
  } catch {
    // logout puede fallar si el socket ya está cerrado — ignorar
  }
}

/**
 * Fetch mensajes nuevos desde `fromUid` (exclusivo) en la mailbox indicada.
 * Returns un array de FetchedMessage parseados y listos para persistir.
 *
 * Si `fromUid` es null/0, fetcha los últimos `maxMessages` (initial sync).
 */
export async function fetchNewMessages(
  client: ImapFlow,
  opts: {
    mailbox?: string                                     // default "INBOX"
    fromUid?: number | null                              // exclusivo
    maxMessages?: number                                 // cap por sync run
  } = {},
): Promise<FetchedMessage[]> {
  const mailbox = opts.mailbox ?? "INBOX"
  const maxMessages = opts.maxMessages ?? 100

  const lock = await client.getMailboxLock(mailbox)
  try {
    const messages: FetchedMessage[] = []

    // Query range:
    //   - Si fromUid: UID > fromUid
    //   - Sino: últimos N (initial bootstrap)
    const range =
      opts.fromUid && opts.fromUid > 0
        ? `${opts.fromUid + 1}:*`
        : `${Math.max(1, (client.mailbox as { exists: number }).exists - maxMessages + 1)}:*`

    for await (const msg of client.fetch(
      range,
      {
        uid: true,
        envelope: true,
        bodyStructure: true,
        source: true,                                    // raw MIME bytes
        size: true,
        flags: true,
      },
      { uid: !!opts.fromUid },
    )) {
      if (messages.length >= maxMessages) break
      if (!msg.source) continue

      try {
        const parsed = await simpleParser(msg.source)
        messages.push(parsedToFetched(msg.uid, msg.size ?? 0, parsed))
      } catch (err) {
        console.error("[mailcow] parse failed for UID", msg.uid, err)
        // Saltamos el mensaje pero seguimos con los demás
      }
    }

    return messages
  } finally {
    lock.release()
  }
}

/**
 * Marca un UID como leído en IMAP (sync read state desde la UI a Mailcow).
 */
export async function markAsRead(
  client: ImapFlow,
  uid: number,
  mailbox = "INBOX",
): Promise<void> {
  const lock = await client.getMailboxLock(mailbox)
  try {
    await client.messageFlagsAdd({ uid: String(uid) }, ["\\Seen"], { uid: true })
  } finally {
    lock.release()
  }
}

// ============================================================================
// SMTP — outbound
// ============================================================================

export function createSmtpTransport(config: MailcowSmtpConfig): Transporter {
  // Cast a any porque el typing de nodemailer es estricto pero permite estas
  // opciones host/port/secure/auth en runtime (son las options básicas SMTP).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,                          // SMTPS implícito en 465
    requireTLS: config.secure && config.port !== 465,    // STARTTLS en 587
    auth: {
      user: config.username,
      pass: config.password,
    },
    pool: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

export async function sendEmail(
  transporter: Transporter,
  input: SendMessageInput,
): Promise<SendResult> {
  const messageIdLocal = generateMessageId(input.from.email)

  const result = await transporter.sendMail({
    messageId: messageIdLocal,
    from: formatAddress(input.from),
    to: input.to.map(formatAddress),
    cc: input.cc?.map(formatAddress),
    bcc: input.bcc?.map(formatAddress),
    replyTo: input.replyTo,
    subject: input.subject,
    text: input.textBody,
    html: input.htmlBody,
    inReplyTo: input.inReplyTo,
    references: input.references,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
      cid: a.cid,
    })),
  })

  return {
    messageId: messageIdLocal,
    accepted: (result.accepted ?? []).map(String),
    rejected: (result.rejected ?? []).map(String),
  }
}

// ============================================================================
// Helpers internos
// ============================================================================

function parsedToFetched(
  uid: number,
  sizeBytes: number,
  parsed: ParsedMail,
): FetchedMessage {
  const from = parsed.from?.value?.[0]
  const to = (Array.isArray(parsed.to) ? parsed.to : parsed.to ? [parsed.to] : []).flatMap(
    (a) => a.value ?? [],
  )
  const cc = (Array.isArray(parsed.cc) ? parsed.cc : parsed.cc ? [parsed.cc] : []).flatMap(
    (a) => a.value ?? [],
  )
  const bcc = (Array.isArray(parsed.bcc) ? parsed.bcc : parsed.bcc ? [parsed.bcc] : []).flatMap(
    (a) => a.value ?? [],
  )

  const textBody = parsed.text ?? null
  const htmlBody = (parsed.html as string | false | undefined) || null
  const snippet = (textBody ?? htmlBody?.replace(/<[^>]+>/g, " ") ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140)

  return {
    uid,
    messageId: parsed.messageId ?? null,
    inReplyTo: (parsed.inReplyTo as string | undefined) ?? null,
    references: parseReferences(parsed.references),
    subject: parsed.subject ?? null,
    from: from
      ? { email: from.address ?? "", name: from.name ?? null }
      : { email: "", name: null },
    to: to.map((a) => ({ email: a.address ?? "", name: a.name ?? null })),
    cc: cc.map((a) => ({ email: a.address ?? "", name: a.name ?? null })),
    bcc: bcc.map((a) => ({ email: a.address ?? "", name: a.name ?? null })),
    replyTo:
      Array.isArray(parsed.replyTo?.value) && parsed.replyTo.value[0]
        ? parsed.replyTo.value[0].address ?? null
        : null,
    date: parsed.date ?? null,
    textBody: textBody ? textBody.slice(0, 1_000_000) : null, // cap 1MB
    htmlBody: htmlBody ? htmlBody.slice(0, 1_000_000) : null,
    snippet,
    attachments: (parsed.attachments ?? []).map((a) => ({
      filename: a.filename ?? "untitled",
      contentType: a.contentType ?? "application/octet-stream",
      size: a.size ?? 0,
      contentId: (a.cid as string | undefined) ?? null,
      isInline: a.contentDisposition === "inline",
      data: a.content,
    })),
    rawHeaders: normalizeHeaders(parsed.headers),
    sizeBytes,
  }
}

function parseReferences(refs: string | string[] | undefined): string[] {
  if (!refs) return []
  if (Array.isArray(refs)) return refs
  return refs.split(/\s+/).filter((r) => r.startsWith("<") && r.endsWith(">"))
}

function formatAddress(addr: { email: string; name?: string | null }): string {
  return addr.name ? `"${addr.name.replace(/"/g, '\\"')}" <${addr.email}>` : addr.email
}

function generateMessageId(fromEmail: string): string {
  const domain = fromEmail.includes("@") ? fromEmail.split("@")[1] : "studioflow.local"
  const uniq = `${Date.now()}.${Math.random().toString(36).slice(2, 10)}`
  return `<${uniq}@${domain}>`
}

/**
 * mailparser devuelve headers como Map<string, HeaderValue> donde HeaderValue
 * puede ser Date, AddressObject, string, etc. Para persistir en JSONB
 * normalizamos todo a string|string[].
 */
function normalizeHeaders(
  headers: ParsedMail["headers"] | undefined,
): Record<string, string | string[]> {
  if (!headers) return {}
  const out: Record<string, string | string[]> = {}
  for (const [k, v] of headers) {
    if (v == null) continue
    if (Array.isArray(v)) {
      out[k] = v.map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
    } else if (v instanceof Date) {
      out[k] = v.toISOString()
    } else if (typeof v === "string") {
      out[k] = v
    } else {
      out[k] = JSON.stringify(v)
    }
  }
  return out
}
