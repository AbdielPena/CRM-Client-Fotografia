import "server-only"

import { untypedServer, untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import {
  generateRecoveryCodes,
  generateTotpSecret,
  totpOtpauthUri,
  verifyTotpCode,
} from "@/lib/totp"

/**
 * Service de 2FA TOTP per-user.
 *
 * Flow de setup:
 *   1. user llama initiate2FA(userId) → secret nuevo + QR URI
 *   2. user escanea con app authenticator
 *   3. user ingresa código + llama verify2FAInit(userId, code)
 *      → si valid, is_verified=true + genera recovery_codes
 *   4. user llama enable2FA(userId) → is_enabled=true (futuro login requiere TOTP)
 *
 * Flow de login con 2FA:
 *   1. user pasa email+password normal
 *   2. middleware ve is_enabled=true → redirect a /login/2fa con token temp
 *   3. user ingresa código TOTP
 *   4. verify2FALogin(userId, code) → si valid, completa session
 */

export type User2FAStatus = {
  isVerified: boolean
  isEnabled: boolean
  enabledAt: string | null
  lastUsedAt: string | null
  recoveryCodesRemaining: number
}

export async function get2FAStatus(userId: string): Promise<User2FAStatus | null> {
  const sb = untypedServer()
  const { data, error } = await sb
    .from("user_2fa_status")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) throwServiceError("USER_2FA_GET_FAILED", error, { userId })
  if (!data) return null

  type Row = {
    is_verified: boolean
    is_enabled: boolean
    enabled_at: string | null
    last_used_at: string | null
    recovery_codes_remaining: number
  }
  const row = data as Row
  return {
    isVerified: row.is_verified,
    isEnabled: row.is_enabled,
    enabledAt: row.enabled_at,
    lastUsedAt: row.last_used_at,
    recoveryCodesRemaining: row.recovery_codes_remaining,
  }
}

/**
 * Inicia el flow de setup. Crea secret nuevo (o reemplaza el existente si
 * is_verified=false). Devuelve secret + otpauth URI para el QR.
 *
 * Si ya hay 2FA verified + enabled, falla — el user debe deshabilitar primero.
 */
export async function initiate2FA(
  userId: string,
  email: string,
  studioName?: string,
): Promise<{ secret: string; otpauthUri: string }> {
  const sb = untypedService()

  // Check status existente
  const { data: existing } = await sb
    .from("user_2fa")
    .select("is_verified, is_enabled")
    .eq("user_id", userId)
    .maybeSingle()

  if (existing && (existing as { is_verified: boolean }).is_verified) {
    if ((existing as { is_enabled: boolean }).is_enabled) {
      throw new Error("USER_2FA_ALREADY_ENABLED")
    }
  }

  // Generar secret nuevo
  const secret = generateTotpSecret()
  const otpauthUri = totpOtpauthUri({
    secret,
    accountName: email,
    issuer: studioName ?? "PixelOS",
  })

  // Upsert
  const { error } = await sb.from("user_2fa").upsert(
    {
      user_id: userId,
      secret,
      is_verified: false,
      is_enabled: false,
      recovery_codes: [],
    },
    { onConflict: "user_id" },
  )

  if (error)
    throwServiceError("USER_2FA_INITIATE_FAILED", error, { userId })

  return { secret, otpauthUri }
}

/**
 * Verifica el primer código TOTP que el user ingresa después de escanear el QR.
 * Si match, marca is_verified=true + genera recovery_codes.
 */
export async function verify2FAInit(
  userId: string,
  code: string,
): Promise<{ ok: boolean; recoveryCodes?: string[]; message?: string }> {
  const sb = untypedService()
  const { data } = await sb
    .from("user_2fa")
    .select("secret, is_verified")
    .eq("user_id", userId)
    .maybeSingle()

  if (!data) return { ok: false, message: "Setup de 2FA no iniciado" }

  const row = data as { secret: string; is_verified: boolean }

  if (!verifyTotpCode(row.secret, code)) {
    return { ok: false, message: "Código inválido o expirado" }
  }

  const recoveryCodes = generateRecoveryCodes(10)

  const { error: updErr } = await sb
    .from("user_2fa")
    .update({
      is_verified: true,
      recovery_codes: recoveryCodes,
      last_used_at: new Date().toISOString(),
    })
    .eq("user_id", userId)

  if (updErr)
    throwServiceError("USER_2FA_VERIFY_FAILED", updErr, { userId })

  return { ok: true, recoveryCodes }
}

/**
 * Habilita 2FA después de verificación. is_enabled=true significa que el
 * login va a requerir TOTP.
 */
export async function enable2FA(userId: string): Promise<void> {
  const sb = untypedService()

  const { data } = await sb
    .from("user_2fa")
    .select("is_verified")
    .eq("user_id", userId)
    .maybeSingle()

  if (!data || !(data as { is_verified: boolean }).is_verified) {
    throw new Error("USER_2FA_MUST_VERIFY_FIRST")
  }

  const { error } = await sb
    .from("user_2fa")
    .update({
      is_enabled: true,
      enabled_at: new Date().toISOString(),
    })
    .eq("user_id", userId)

  if (error) throwServiceError("USER_2FA_ENABLE_FAILED", error, { userId })
}

/**
 * Deshabilita 2FA. Requiere código TOTP válido o recovery code para
 * confirmar identidad.
 */
export async function disable2FA(
  userId: string,
  codeOrRecovery: string,
): Promise<{ ok: boolean; message?: string }> {
  const sb = untypedService()

  const { data } = await sb
    .from("user_2fa")
    .select("secret, recovery_codes")
    .eq("user_id", userId)
    .maybeSingle()

  if (!data) return { ok: false, message: "2FA no configurado" }

  const row = data as { secret: string; recovery_codes: string[] }

  // Try TOTP code first
  let valid = false
  if (/^\d{6}$/.test(codeOrRecovery)) {
    valid = verifyTotpCode(row.secret, codeOrRecovery)
  } else {
    // Try recovery code
    valid = row.recovery_codes.includes(codeOrRecovery)
  }

  if (!valid) return { ok: false, message: "Código inválido" }

  // Eliminar la row completa
  await sb.from("user_2fa").delete().eq("user_id", userId)
  return { ok: true }
}

/**
 * Verifica un código TOTP en flow de login (después del password).
 * También acepta recovery codes (single-use — se borran del array).
 */
export async function verify2FALogin(
  userId: string,
  code: string,
): Promise<{ ok: boolean; usedRecoveryCode?: boolean }> {
  const sb = untypedService()
  const { data } = await sb
    .from("user_2fa")
    .select("secret, is_enabled, recovery_codes")
    .eq("user_id", userId)
    .maybeSingle()

  if (!data) return { ok: false }

  const row = data as {
    secret: string
    is_enabled: boolean
    recovery_codes: string[]
  }

  if (!row.is_enabled) return { ok: false }

  // TOTP code
  if (/^\d{6}$/.test(code)) {
    if (verifyTotpCode(row.secret, code)) {
      await sb
        .from("user_2fa")
        .update({ last_used_at: new Date().toISOString() })
        .eq("user_id", userId)
      return { ok: true }
    }
    return { ok: false }
  }

  // Recovery code
  const idx = row.recovery_codes.indexOf(code.toUpperCase())
  if (idx >= 0) {
    const remaining = [...row.recovery_codes]
    remaining.splice(idx, 1)
    await sb
      .from("user_2fa")
      .update({
        recovery_codes: remaining,
        last_used_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
    return { ok: true, usedRecoveryCode: true }
  }

  return { ok: false }
}

/**
 * Regenera todos los recovery codes (los anteriores quedan invalidados).
 */
export async function regenerateRecoveryCodes(
  userId: string,
): Promise<string[]> {
  const sb = untypedService()
  const codes = generateRecoveryCodes(10)
  const { error } = await sb
    .from("user_2fa")
    .update({ recovery_codes: codes })
    .eq("user_id", userId)
  if (error)
    throwServiceError("USER_2FA_REGEN_FAILED", error, { userId })
  return codes
}
