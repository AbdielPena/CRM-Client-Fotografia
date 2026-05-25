"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createMailAccount,
  updateMailAccount,
  deleteMailAccount,
  testMailcowConnection,
  type TestConnectionResult,
} from "@/server/services/mail-account.service"
import {
  createMailAccountSchema,
  updateMailAccountSchema,
  type CreateMailAccountInput,
  type UpdateMailAccountInput,
} from "@/lib/validations/mail-account.schema"

export type MailAccountActionState = {
  ok?: boolean
  message?: string
  fieldErrors?: Record<string, string[]>
  accountId?: string
  testResult?: TestConnectionResult
  values?: Record<string, string>
}

function collectValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  formData.forEach((v, k) => {
    if (typeof v === "string") out[k] = v
  })
  return out
}

function parseFormToCreate(formData: FormData) {
  return {
    email: formData.get("email"),
    displayName: formData.get("displayName"),
    imapHost: formData.get("imapHost"),
    imapPort: formData.get("imapPort"),
    imapSecure: formData.get("imapSecure") !== "false",
    imapUsername: formData.get("imapUsername") || formData.get("email"),
    imapPassword: formData.get("imapPassword"),
    smtpHost: formData.get("smtpHost") || formData.get("imapHost"),
    smtpPort: formData.get("smtpPort") || 587,
    smtpSecure: formData.get("smtpSecure") !== "false",
    smtpUsername:
      formData.get("smtpUsername") ||
      formData.get("imapUsername") ||
      formData.get("email"),
    smtpPassword: formData.get("smtpPassword") || formData.get("imapPassword"),
    isDefault: formData.get("isDefault") === "true",
  }
}

// ---------------------------------------------------------------------------
// TEST connection (action separado del create — UX: test antes de guardar)
// ---------------------------------------------------------------------------

export async function testMailAccountAction(
  _prev: MailAccountActionState,
  formData: FormData,
): Promise<MailAccountActionState> {
  try {
    await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)
  const parsed = createMailAccountSchema.safeParse(parseFormToCreate(formData))
  if (!parsed.success) {
    return {
      ok: false,
      message: "Datos incompletos para test. Llena todos los campos requeridos.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      values,
    }
  }

  const result = await testMailcowConnection(parsed.data as CreateMailAccountInput)
  if (result.ok) {
    return {
      ok: true,
      message: `✓ Conexión exitosa. ${result.folders?.length ?? 0} carpetas IMAP detectadas.`,
      testResult: result,
      values,
    }
  }

  const errors: string[] = []
  if (!result.imap)
    errors.push(`IMAP: ${result.imapError ?? "fallo desconocido"}`)
  if (!result.smtp)
    errors.push(`SMTP: ${result.smtpError ?? "fallo desconocido"}`)

  return {
    ok: false,
    message: `Conexión falló. ${errors.join(" · ")}`,
    testResult: result,
    values,
  }
}

// ---------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------

export async function createMailAccountAction(
  _prev: MailAccountActionState,
  formData: FormData,
): Promise<MailAccountActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)
  const parsed = createMailAccountSchema.safeParse(parseFormToCreate(formData))
  if (!parsed.success) {
    return {
      ok: false,
      message: "Validación falló.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      values,
    }
  }

  // Opcional: testear antes de persistir. Si pasa el form `skip_test=true`,
  // crea directamente (útil para imports/automation, no UI normal).
  const skipTest = formData.get("skipTest") === "true"
  if (!skipTest) {
    const test = await testMailcowConnection(parsed.data as CreateMailAccountInput)
    if (!test.ok) {
      const errors: string[] = []
      if (!test.imap) errors.push(`IMAP: ${test.imapError}`)
      if (!test.smtp) errors.push(`SMTP: ${test.smtpError}`)
      return {
        ok: false,
        message: `Conexión falló — la cuenta no se guardó. ${errors.join(" · ")}`,
        testResult: test,
        values,
      }
    }
  }

  let accountId: string
  try {
    const account = await createMailAccount(
      session.studioId,
      session.userId,
      parsed.data as CreateMailAccountInput,
    )
    accountId = account.id
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido."
    if (msg === "MAIL_ACCOUNT_DUPLICATE_EMAIL") {
      return {
        ok: false,
        message: "Ya tienes una cuenta registrada con ese email.",
        values,
      }
    }
    return { ok: false, message: msg, values }
  }

  revalidatePath("/settings/mail")
  return {
    ok: true,
    message: "Cuenta Mailcow conectada exitosamente. Sync inicial comenzará pronto.",
    accountId,
  }
}

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

export async function updateMailAccountAction(
  accountId: string,
  _prev: MailAccountActionState,
  formData: FormData,
): Promise<MailAccountActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)
  const raw: Record<string, unknown> = {}
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string" && v !== "") raw[k] = v
  }
  // Coerce booleans
  if ("imapSecure" in raw) raw.imapSecure = raw.imapSecure === "true"
  if ("smtpSecure" in raw) raw.smtpSecure = raw.smtpSecure === "true"
  if ("isActive" in raw) raw.isActive = raw.isActive === "true"
  if ("isDefault" in raw) raw.isDefault = raw.isDefault === "true"

  const parsed = updateMailAccountSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      message: "Validación falló.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      values,
    }
  }

  try {
    await updateMailAccount(
      session.studioId,
      session.userId,
      accountId,
      parsed.data as UpdateMailAccountInput,
    )
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error al actualizar.",
      values,
    }
  }

  revalidatePath("/settings/mail")
  return { ok: true, message: "Cuenta actualizada.", accountId }
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

export async function deleteMailAccountAction(
  accountId: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  try {
    await deleteMailAccount(session.studioId, session.userId, accountId)
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error desconocido.",
    }
  }

  revalidatePath("/settings/mail")
  return { ok: true, message: "Cuenta eliminada." }
}
