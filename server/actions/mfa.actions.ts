"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/server/supabase/server"

/**
 * Lista los factores MFA del usuario actual.
 */
export async function listMfaFactorsAction() {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("UNAUTHORIZED")

  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw new Error(error.message)

  // Solo factores TOTP verificados (los pending no nos interesan en el listado)
  const totpFactors = (data?.totp ?? []).filter(
    (f) => f.status === "verified",
  )
  return totpFactors.map((f) => ({
    id: f.id,
    friendlyName: f.friendly_name ?? "App Authenticator",
    createdAt: f.created_at,
    factorType: f.factor_type,
  }))
}

/**
 * Inicia el enrollment de un factor TOTP.
 * Devuelve el factor pendiente con el secret + URI otpauth para generar QR.
 */
export async function enrollMfaFactorAction(friendlyName: string) {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("UNAUTHORIZED")

  // Antes de enrollar, limpiamos factores pending viejos (no-verified)
  // para evitar acumulación si el user abandonó el flow.
  const { data: existing } = await supabase.auth.mfa.listFactors()
  // Tipos de Supabase JS solo exponen 'verified', pero la API real puede
  // devolver 'unverified' (factores pending). Cast para limpiarlos.
  const allTotp = (existing?.totp ?? []) as Array<{ id: string; status: string }>
  const pendingTotp = allTotp.filter((f) => f.status !== "verified")
  for (const p of pendingTotp) {
    await supabase.auth.mfa.unenroll({ factorId: p.id }).catch(() => {})
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: friendlyName?.trim() || "Authenticator App",
  })
  if (error) throw new Error(error.message)

  return {
    factorId: data.id,
    secret: data.totp.secret,
    uri: data.totp.uri,
    qrCode: data.totp.qr_code,
  }
}

/**
 * Confirma el factor TOTP enrollado verificando el código del usuario.
 */
export async function verifyMfaFactorAction(
  factorId: string,
  code: string,
) {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("UNAUTHORIZED")

  const cleaned = code.replace(/\s/g, "").trim()
  if (!/^\d{6}$/.test(cleaned)) {
    throw new Error("CODE_INVALID_FORMAT")
  }

  // Challenge primero, después verify
  const { data: challenge, error: chErr } =
    await supabase.auth.mfa.challenge({ factorId })
  if (chErr || !challenge) {
    throw new Error(chErr?.message ?? "CHALLENGE_FAILED")
  }

  const { error: verifyErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: cleaned,
  })
  if (verifyErr) {
    if (verifyErr.message.includes("Invalid")) {
      throw new Error("CODE_INCORRECT")
    }
    throw new Error(verifyErr.message)
  }

  revalidatePath("/settings/security")
  return { ok: true as const }
}

/**
 * Elimina un factor MFA. Requiere haber pasado challenge MFA recientemente
 * (Supabase enforz aal2 para mutaciones sensibles).
 */
export async function unenrollMfaFactorAction(factorId: string) {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("UNAUTHORIZED")

  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw new Error(error.message)

  revalidatePath("/settings/security")
  return { ok: true as const }
}
