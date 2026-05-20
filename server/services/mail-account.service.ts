import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { logActivity } from "./activity.service"
import {
  connectImap,
  closeImap,
  createSmtpTransport,
} from "@/lib/mailcow"
import type {
  CreateMailAccountInput,
  UpdateMailAccountInput,
} from "@/lib/validations/mail-account.schema"

/**
 * Service de cuentas Mailcow del módulo Mail.
 *
 * Diseño:
 *   - 1 row en mail_accounts por (studio, email) con creds IMAP + SMTP
 *   - Passwords almacenados en columnas *_secret_id (en MVP: plaintext con
 *     prefijo "vault:" para futuro Supabase Vault migration; en V2: pgsodium
 *     encrypt_aead con key del studio)
 *   - testConnection() abre IMAP + SMTP brevemente para validar antes de
 *     persistir o tras update — evita guardar configs inválidos
 *
 * Solo 1 cuenta is_default=true por studio (partial UNIQUE en el schema).
 * Al setear is_default=true, automáticamente unsetea las otras.
 */

// ============================================================================
// Tipos (snake_case del schema)
// ============================================================================

export type MailAccountRow = {
  id: string
  studio_id: string
  email: string
  display_name: string | null
  imap_host: string
  imap_port: number
  imap_secure: boolean
  imap_username: string
  imap_password_secret_id: string
  smtp_host: string
  smtp_port: number
  smtp_secure: boolean
  smtp_username: string
  smtp_password_secret_id: string
  sync_status: "ok" | "syncing" | "error" | "disabled"
  last_synced_at: string | null
  last_uid_synced: number | null
  last_error: string | null
  is_active: boolean
  is_default: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// ============================================================================
// Secret encryption (V2: pgsodium AEAD via RPC mail_encrypt_password)
// ============================================================================

/**
 * Encripta password usando pgsodium con studio_id como associated data (AAD).
 *
 * Output formato: `v2:base64(nonce||ciphertext||tag)` cuando la migration
 * 20260520001100_mail_pgsodium_encryption.sql está aplicada.
 *
 * Fallback: si la RPC no existe (migration no aplicada) usa el formato legacy
 * v1: (plaintext con prefix). El system sigue funcionando pero sin cifrado.
 *
 * El cliente usa SERVICE ROLE (untypedService) porque la RPC tiene
 * SECURITY DEFINER + grants restringidos.
 */
async function encryptPassword(
  studioId: string,
  plaintext: string,
): Promise<string> {
  const sb = untypedService()
  try {
    const { data, error } = await sb.rpc("mail_encrypt_password", {
      p_plaintext: plaintext,
      p_studio_id: studioId,
    })
    if (error) throw error
    if (typeof data === "string" && data.length > 0) return data
  } catch (err) {
    console.warn(
      "[mail-crypto] encrypt_password RPC failed, falling back to v1:",
      err,
    )
  }
  return `v1:${plaintext}`
}

async function decryptPassword(
  studioId: string,
  stored: string,
): Promise<string> {
  // Fast path v1 (legacy)
  if (stored.startsWith("v1:")) return stored.slice(3)
  if (!stored.startsWith("v2:")) return stored // raw plaintext (no debería ocurrir)

  const sb = untypedService()
  try {
    const { data, error } = await sb.rpc("mail_decrypt_password", {
      p_ciphertext: stored,
      p_studio_id: studioId,
    })
    if (error) throw error
    if (typeof data === "string") return data
  } catch (err) {
    console.error("[mail-crypto] decrypt_password RPC failed:", err)
    throw new Error("MAIL_CREDENTIAL_DECRYPT_FAILED")
  }
  throw new Error("MAIL_CREDENTIAL_DECRYPT_EMPTY")
}

// ============================================================================
// CRUD
// ============================================================================

export async function getMailAccounts(studioId: string) {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("mail_accounts")
    .select(
      "id, studio_id, email, display_name, imap_host, imap_port, imap_secure, " +
        "imap_username, smtp_host, smtp_port, smtp_secure, smtp_username, " +
        "sync_status, last_synced_at, last_uid_synced, last_error, " +
        "is_active, is_default, created_at, updated_at",
    )
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("email", { ascending: true })

  if (error) throwServiceError("MAIL_ACCOUNT_OP_FAILED", error)
  return (data ?? []) as Omit<
    MailAccountRow,
    "imap_password_secret_id" | "smtp_password_secret_id" | "deleted_at"
  >[]
}

export async function getMailAccountById(studioId: string, accountId: string) {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("mail_accounts")
    .select("*")
    .eq("id", accountId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)
    .maybeSingle()

  if (error) throwServiceError("MAIL_ACCOUNT_OP_FAILED", error)
  return (data ?? null) as MailAccountRow | null
}

export async function createMailAccount(
  studioId: string,
  actorId: string,
  data: CreateMailAccountInput,
) {
  const sb = untypedService()

  // Si quiere ser default, unset previas
  if (data.isDefault) {
    await sb
      .from("mail_accounts")
      .update({ is_default: false })
      .eq("studio_id", studioId)
      .eq("is_default", true)
      .is("deleted_at", null)
  }

  const [imapEnc, smtpEnc] = await Promise.all([
    encryptPassword(studioId, data.imapPassword),
    encryptPassword(studioId, data.smtpPassword),
  ])

  const payload = {
    studio_id: studioId,
    email: data.email,
    display_name: data.displayName ?? null,
    imap_host: data.imapHost,
    imap_port: data.imapPort,
    imap_secure: data.imapSecure,
    imap_username: data.imapUsername,
    imap_password_secret_id: imapEnc,
    smtp_host: data.smtpHost,
    smtp_port: data.smtpPort,
    smtp_secure: data.smtpSecure,
    smtp_username: data.smtpUsername,
    smtp_password_secret_id: smtpEnc,
    is_active: true,
    is_default: data.isDefault ?? false,
    sync_status: "ok",
  }

  const { data: row, error } = await sb
    .from("mail_accounts")
    .insert(payload)
    .select("id, email, is_default")
    .single()

  if (error) {
    if (error.code === "23505" && error.message?.includes("email")) {
      throw new Error("MAIL_ACCOUNT_DUPLICATE_EMAIL")
    }
    throwServiceError("MAIL_ACCOUNT_CREATE_FAILED", error, { studioId })
  }

  const account = row as { id: string; email: string; is_default: boolean }
  await logActivity({
    studioId,
    actorId,
    entityType: "mail_account",
    entityId: account.id,
    action: "mail_account.created",
    metadata: { email: account.email, is_default: account.is_default },
  })

  return account
}

export async function updateMailAccount(
  studioId: string,
  actorId: string,
  accountId: string,
  data: UpdateMailAccountInput,
) {
  const sb = untypedService()

  // Si quiere ser default, unset previas
  if (data.isDefault === true) {
    await sb
      .from("mail_accounts")
      .update({ is_default: false })
      .eq("studio_id", studioId)
      .neq("id", accountId)
      .eq("is_default", true)
      .is("deleted_at", null)
  }

  const patch: Record<string, unknown> = {}
  if (data.displayName !== undefined) patch.display_name = data.displayName
  if (data.imapHost !== undefined) patch.imap_host = data.imapHost
  if (data.imapPort !== undefined) patch.imap_port = data.imapPort
  if (data.imapSecure !== undefined) patch.imap_secure = data.imapSecure
  if (data.imapUsername !== undefined) patch.imap_username = data.imapUsername
  if (data.imapPassword !== undefined && data.imapPassword)
    patch.imap_password_secret_id = await encryptPassword(
      studioId,
      data.imapPassword,
    )
  if (data.smtpHost !== undefined) patch.smtp_host = data.smtpHost
  if (data.smtpPort !== undefined) patch.smtp_port = data.smtpPort
  if (data.smtpSecure !== undefined) patch.smtp_secure = data.smtpSecure
  if (data.smtpUsername !== undefined) patch.smtp_username = data.smtpUsername
  if (data.smtpPassword !== undefined && data.smtpPassword)
    patch.smtp_password_secret_id = await encryptPassword(
      studioId,
      data.smtpPassword,
    )
  if (data.isActive !== undefined) patch.is_active = data.isActive
  if (data.isDefault !== undefined) patch.is_default = data.isDefault

  const { error } = await sb
    .from("mail_accounts")
    .update(patch)
    .eq("id", accountId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)

  if (error)
    throwServiceError("MAIL_ACCOUNT_UPDATE_FAILED", error, { studioId, accountId })

  await logActivity({
    studioId,
    actorId,
    entityType: "mail_account",
    entityId: accountId,
    action: "mail_account.updated",
    metadata: { changes: Object.keys(patch) },
  })
}

export async function deleteMailAccount(
  studioId: string,
  actorId: string,
  accountId: string,
) {
  const sb = untypedService()
  const { error } = await sb
    .from("mail_accounts")
    .update({
      deleted_at: new Date().toISOString(),
      is_active: false,
      is_default: false,
    })
    .eq("id", accountId)
    .eq("studio_id", studioId)
    .is("deleted_at", null)

  if (error)
    throwServiceError("MAIL_ACCOUNT_DELETE_FAILED", error, { studioId, accountId })

  await logActivity({
    studioId,
    actorId,
    entityType: "mail_account",
    entityId: accountId,
    action: "mail_account.deleted",
  })
}

// ============================================================================
// Test connection (validar IMAP + SMTP antes de persistir)
// ============================================================================

export type TestConnectionResult =
  | { ok: true; imap: true; smtp: true; folders?: string[] }
  | { ok: false; imap: boolean; smtp: boolean; imapError?: string; smtpError?: string }

/**
 * Abre conexión IMAP + SMTP brevemente y valida que las creds funcionen.
 * Usa este flow antes de persistir una nueva cuenta o tras update.
 *
 * Para outbound, NO envía email — solo valida auth via `transporter.verify()`.
 */
export async function testMailcowConnection(
  config: CreateMailAccountInput,
): Promise<TestConnectionResult> {
  let imapOk = false
  let imapError: string | undefined
  let folders: string[] = []

  // 1. IMAP
  try {
    const client = await connectImap({
      host: config.imapHost,
      port: config.imapPort,
      secure: config.imapSecure,
      username: config.imapUsername,
      password: config.imapPassword,
    })
    const list = await client.list()
    folders = list.map((f) => f.path).slice(0, 20)
    await closeImap(client)
    imapOk = true
  } catch (err) {
    imapError = err instanceof Error ? err.message : "Error desconocido"
  }

  // 2. SMTP
  let smtpOk = false
  let smtpError: string | undefined
  try {
    const transporter = createSmtpTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      username: config.smtpUsername,
      password: config.smtpPassword,
    })
    await transporter.verify()
    smtpOk = true
  } catch (err) {
    smtpError = err instanceof Error ? err.message : "Error desconocido"
  }

  if (imapOk && smtpOk) {
    return { ok: true, imap: true, smtp: true, folders }
  }
  return { ok: false, imap: imapOk, smtp: smtpOk, imapError, smtpError }
}

/**
 * Helper para uso del sync service: descifra el password y devuelve config
 * IMAP-listo. NUNCA expongas el resultado al cliente browser.
 *
 * AHORA async porque pgsodium RPC requiere ida-y-vuelta a la DB.
 */
export async function decryptAccountForImap(account: MailAccountRow) {
  return {
    host: account.imap_host,
    port: account.imap_port,
    secure: account.imap_secure,
    username: account.imap_username,
    password: await decryptPassword(
      account.studio_id,
      account.imap_password_secret_id,
    ),
  }
}

export async function decryptAccountForSmtp(account: MailAccountRow) {
  return {
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_secure,
    username: account.smtp_username,
    password: await decryptPassword(
      account.studio_id,
      account.smtp_password_secret_id,
    ),
  }
}
