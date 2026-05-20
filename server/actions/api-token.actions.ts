"use server"

import { revalidatePath } from "next/cache"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  createApiToken,
  revokeApiToken,
  type ApiTokenScope,
} from "@/server/services/api-token.service"
import { hasFeature } from "@/server/services/billing.service"

export async function createApiTokenAction(
  formData: FormData,
): Promise<{ ok: boolean; plaintext?: string; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  const canApi = await hasFeature(session.studioId, "api_access")
  if (!canApi) {
    return {
      ok: false,
      message: "El acceso a la API requiere plan Studio o superior.",
    }
  }

  const name = String(formData.get("name") ?? "").trim()
  if (!name) return { ok: false, message: "Nombre requerido" }

  const scopesRaw = formData.getAll("scopes") as string[]
  const scopes = scopesRaw.filter((s) =>
    ["read", "write", "admin"].includes(s),
  ) as ApiTokenScope[]
  if (scopes.length === 0) scopes.push("read")

  const expiresAtRaw = formData.get("expiresAt") as string | null
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw).toISOString() : undefined

  try {
    const result = await createApiToken(session.studioId, session.userId, {
      name,
      scopes,
      expiresAt,
    })
    revalidatePath("/settings/api")
    return { ok: true, plaintext: result.plaintext }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}

export async function revokeApiTokenAction(
  tokenId: string,
  reason?: string,
): Promise<{ ok: boolean; message?: string }> {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return { ok: false, message: "Tu sesión expiró." }
  }

  try {
    await revokeApiToken(session.studioId, session.userId, tokenId, reason)
    revalidatePath("/settings/api")
    return { ok: true, message: "Token revocado" }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error",
    }
  }
}
