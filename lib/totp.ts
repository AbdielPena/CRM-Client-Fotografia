/**
 * Implementación TOTP (RFC 6238) pura sin dependencias externas.
 *
 * - Secret: 20-byte random encoded en base32 (Google Authenticator default)
 * - Algorithm: HMAC-SHA1
 * - Digits: 6
 * - Period: 30s
 */

import { createHmac, randomBytes } from "crypto"

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
const PERIOD_SECONDS = 30
const DIGITS = 6

/**
 * Genera un secret aleatorio de 20 bytes encoded en base32 (160 bits).
 */
export function generateTotpSecret(): string {
  const buf = randomBytes(20)
  return base32Encode(buf)
}

function base32Encode(buf: Buffer): string {
  let bits = ""
  for (const byte of buf) {
    bits += byte.toString(2).padStart(8, "0")
  }
  let out = ""
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0")
    out += BASE32_ALPHABET[parseInt(chunk, 2)]
  }
  // Padding "=" to multiple of 8
  while (out.length % 8 !== 0) out += "="
  return out
}

function base32Decode(input: string): Buffer {
  const clean = input
    .toUpperCase()
    .replace(/=/g, "")
    .replace(/\s+/g, "")
  let bits = ""
  for (const c of clean) {
    const idx = BASE32_ALPHABET.indexOf(c)
    if (idx === -1) throw new Error(`Invalid base32 char: ${c}`)
    bits += idx.toString(2).padStart(5, "0")
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2))
  }
  return Buffer.from(bytes)
}

/**
 * Calcula el código TOTP de 6 dígitos para un timestamp dado.
 */
export function totpCode(secret: string, atSec: number = Math.floor(Date.now() / 1000)): string {
  const counter = Math.floor(atSec / PERIOD_SECONDS)
  const key = base32Decode(secret)

  // Counter as 8-byte big-endian
  const counterBuf = Buffer.alloc(8)
  counterBuf.writeBigUInt64BE(BigInt(counter), 0)

  const hmac = createHmac("sha1", key).update(counterBuf).digest()

  // Dynamic truncation
  const offset = hmac[hmac.length - 1] & 0x0f
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)

  const code = binary % 10 ** DIGITS
  return code.toString().padStart(DIGITS, "0")
}

/**
 * Verifica si un código es válido. Acepta el código actual + ventana ±1
 * para tolerar pequeño desfase de reloj.
 */
export function verifyTotpCode(secret: string, code: string, window = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false

  const now = Math.floor(Date.now() / 1000)
  for (let i = -window; i <= window; i++) {
    if (totpCode(secret, now + i * PERIOD_SECONDS) === code) return true
  }
  return false
}

/**
 * Construye el URI otpauth:// para QR code (compatible con Google Authenticator,
 * 1Password, Authy, etc.)
 *
 * Format: otpauth://totp/Label?secret=SECRET&issuer=Issuer
 */
export function totpOtpauthUri(opts: {
  secret: string
  accountName: string
  issuer: string
}): string {
  const label = encodeURIComponent(`${opts.issuer}:${opts.accountName}`)
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer: opts.issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  })
  return `otpauth://totp/${label}?${params.toString()}`
}

/**
 * Genera un set de 10 recovery codes (single-use cuando se confirma 2FA).
 * Formato: XXXX-XXXX (10 chars total con guion).
 */
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(5)
    const hex = bytes.toString("hex").toUpperCase()
    codes.push(`${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8)}`)
  }
  return codes
}
