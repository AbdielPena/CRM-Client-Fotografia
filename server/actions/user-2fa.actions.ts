"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  disable2FA,
  enable2FA,
  initiate2FA,
  regenerateRecoveryCodes,
  verify2FAInit,
} from "@/server/services/user-2fa.service"

export async function initiate2FAAction(): Promise<{
  ok: boolean
  secret?: string
  otpauthUri?: string
  message?: string
}> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Sesión expirada" }
  }

  try {
    const result = await initiate2FA(
      session.userId,
      session.email,
      session.studioName,
    )
    return { ok: true, secret: result.secret, otpauthUri: result.otpauthUri }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}

export async function verify2FAInitAction(
  code: string,
): Promise<{ ok: boolean; recoveryCodes?: string[]; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Sesión expirada" }
  }

  try {
    return await verify2FAInit(session.userId, code)
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}

export async function enable2FAAction(): Promise<{
  ok: boolean
  message?: string
}> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Sesión expirada" }
  }

  try {
    await enable2FA(session.userId)
    revalidatePath("/settings/security")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}

export async function disable2FAAction(
  codeOrRecovery: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Sesión expirada" }
  }

  try {
    const result = await disable2FA(session.userId, codeOrRecovery)
    if (result.ok) revalidatePath("/settings/security")
    return result
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}

export async function regenerateRecoveryCodesAction(): Promise<{
  ok: boolean
  codes?: string[]
  message?: string
}> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Sesión expirada" }
  }

  try {
    const codes = await regenerateRecoveryCodes(session.userId)
    return { ok: true, codes }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}
