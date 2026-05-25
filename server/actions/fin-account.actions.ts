"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createFinAccount,
  createFinBank,
  updateFinAccount,
  deleteFinAccount,
} from "@/server/services/fin-account.service"
import {
  createFinAccountSchema,
  updateFinAccountSchema,
  createFinBankSchema,
  type CreateFinAccountInput,
  type UpdateFinAccountInput,
  type CreateFinBankInput,
} from "@/lib/validations/fin-account.schema"

export type FinAccountActionState = {
  ok?: boolean
  message?: string
  fieldErrors?: Record<string, string[]>
  accountId?: string
  values?: Record<string, string>
}

function collectValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  formData.forEach((v, k) => {
    if (typeof v === "string") out[k] = v
  })
  return out
}

// ---------------------------------------------------------------------------
// Account — CREATE
// ---------------------------------------------------------------------------

export async function createFinAccountAction(
  _prev: FinAccountActionState,
  formData: FormData,
): Promise<FinAccountActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)
  const raw = {
    bancoId: formData.get("bancoId"),
    nombre: formData.get("nombre"),
    tipo: formData.get("tipo"),
    saldoInicial: formData.get("saldoInicial"),
    currency: formData.get("currency") || "DOP",
    activa: formData.get("activa") !== "false",
  }

  const parsed = createFinAccountSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      message: "Validación falló.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      values,
    }
  }

  let accountId: string
  try {
    const account = await createFinAccount(
      session.studioId,
      session.userId,
      parsed.data as CreateFinAccountInput,
    )
    accountId = account.id
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al crear cuenta."
    if (msg === "FIN_BANK_NOT_FOUND") {
      return {
        ok: false,
        message: "El banco seleccionado no existe en tu studio. Crea uno primero.",
        values,
      }
    }
    return { ok: false, message: msg, values }
  }

  revalidatePath("/finance/accounts")
  redirect(`/finance/accounts/${accountId}`)
}

// ---------------------------------------------------------------------------
// Account — UPDATE
// ---------------------------------------------------------------------------

export async function updateFinAccountAction(
  accountId: string,
  _prev: FinAccountActionState,
  formData: FormData,
): Promise<FinAccountActionState> {
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
  if (typeof raw.saldoInicial === "string")
    raw.saldoInicial = Number(raw.saldoInicial)
  if (raw.activa !== undefined) raw.activa = raw.activa === "true"

  const parsed = updateFinAccountSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      message: "Validación falló.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      values,
    }
  }

  try {
    await updateFinAccount(
      session.studioId,
      session.userId,
      accountId,
      parsed.data as UpdateFinAccountInput,
    )
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error al actualizar.",
      values,
    }
  }

  revalidatePath(`/finance/accounts/${accountId}`)
  revalidatePath("/finance/accounts")
  return { ok: true, message: "Cuenta actualizada.", accountId }
}

// ---------------------------------------------------------------------------
// Account — DELETE (soft)
// ---------------------------------------------------------------------------

export async function deleteFinAccountAction(
  accountId: string,
  reason?: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  try {
    await deleteFinAccount(
      session.studioId,
      session.userId,
      accountId,
      reason ?? null,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido."
    if (msg === "FIN_ACCOUNT_HAS_TRANSACTIONS") {
      return {
        ok: false,
        message:
          "No se puede borrar: la cuenta tiene transacciones activas. Anula o transfiere las transacciones primero.",
      }
    }
    return { ok: false, message: msg }
  }

  revalidatePath("/finance/accounts")
  return { ok: true, message: "Cuenta movida a papelera." }
}

// ---------------------------------------------------------------------------
// Bank — CREATE (inline en form de cuentas)
// ---------------------------------------------------------------------------

export type FinBankActionState = {
  ok?: boolean
  message?: string
  fieldErrors?: Record<string, string[]>
  bankId?: string
  values?: Record<string, string>
}

export async function createFinBankAction(
  _prev: FinBankActionState,
  formData: FormData,
): Promise<FinBankActionState> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const values = collectValues(formData)
  const raw = {
    nombre: formData.get("nombre"),
    color: formData.get("color"),
    icono: formData.get("icono"),
  }

  const parsed = createFinBankSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      message: "Validación falló.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      values,
    }
  }

  let bankId: string
  try {
    const bank = await createFinBank(
      session.studioId,
      session.userId,
      parsed.data as CreateFinBankInput,
    )
    bankId = bank.id
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al crear banco."
    if (msg === "FIN_BANK_DUPLICATE_NAME") {
      return {
        ok: false,
        message: "Ya existe un banco con ese nombre en tu studio.",
        values,
      }
    }
    return { ok: false, message: msg, values }
  }

  revalidatePath("/finance/accounts")
  return { ok: true, message: "Banco creado.", bankId }
}
