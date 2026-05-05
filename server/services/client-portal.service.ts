/**
 * Portal del cliente — autenticación por código de acceso.
 *
 * Cada cliente tiene un `access_code` único (generado al crearlo). El cliente
 * accede a su portal privado con email + código. La sesión vive en una cookie
 * firmada con HMAC (no necesita JWT lib externa).
 *
 * Visibilidad: el cliente solo ve datos donde `client_id == su_id`.
 */

import "server-only"

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

import { createSupabaseServiceClient } from "@/server/supabase/service"

export const PORTAL_COOKIE_NAME = "sf_portal"
const SESSION_TTL_DAYS = 30

// Charset legible: sin 0/O, 1/I/l
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const CODE_LENGTH = 8

function getSecret(): string {
  const s =
    process.env["OAUTH_STATE_SECRET"] ??
    process.env["NEXTAUTH_SECRET"] ??
    "dev-portal-secret-change-me"
  if (s === "dev-portal-secret-change-me") {
    console.warn(
      "[client-portal] usando secret de dev. Configurá OAUTH_STATE_SECRET para producción.",
    )
  }
  return s
}

function generateCode(): string {
  const bytes = randomBytes(CODE_LENGTH)
  let out = ""
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return out
}

/**
 * Devuelve el código actual del cliente o genera uno si no existe.
 * Idempotente — si ya tiene código, lo devuelve sin tocar nada.
 */
export async function ensureClientAccessCode(
  studioId: string,
  clientId: string,
): Promise<string> {
  const supabase = createSupabaseServiceClient()
  const { data: client } = await supabase
    .from("clients")
    .select("id, access_code")
    .eq("studio_id", studioId)
    .eq("id", clientId)
    .maybeSingle()
  if (!client) throw new Error("Cliente no encontrado")
  const existing = (client as { access_code: string | null }).access_code
  if (existing) return existing

  // Generar y guardar (con retry por colisión muy improbable)
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode()
    const { error } = await supabase
      .from("clients")
      .update({ access_code: code })
      .eq("id", clientId)
      .eq("studio_id", studioId)
    if (!error) return code
  }
  throw new Error("No se pudo generar código de acceso")
}

/** Regenera el código (invalida sesiones viejas implícitamente). */
export async function regenerateClientAccessCode(
  studioId: string,
  clientId: string,
): Promise<string> {
  const supabase = createSupabaseServiceClient()
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode()
    const { error } = await supabase
      .from("clients")
      .update({ access_code: code, access_code_sent_at: null })
      .eq("id", clientId)
      .eq("studio_id", studioId)
    if (!error) return code
  }
  throw new Error("No se pudo regenerar código de acceso")
}

/**
 * Valida login del portal. Email + código → studio_id + client_id.
 * Match case-insensitive en ambos (gracias al unique index `lower(access_code)`).
 */
export async function validatePortalLogin(
  email: string,
  code: string,
): Promise<{ studioId: string; clientId: string; clientName: string } | null> {
  const supabase = createSupabaseServiceClient()
  const e = email.trim().toLowerCase()
  const c = code.trim().toUpperCase()
  if (!e || !c) return null

  const { data } = await supabase
    .from("clients")
    .select("id, studio_id, name, email, access_code, deleted_at")
    .eq("email", e)
    .is("deleted_at", null)
    .limit(5)

  const rows = (data ?? []) as Array<{
    id: string
    studio_id: string
    name: string
    email: string
    access_code: string | null
    deleted_at: string | null
  }>

  const match = rows.find(
    (r) => r.access_code && r.access_code.toUpperCase() === c,
  )
  if (!match) return null

  // Marcar último login (best-effort)
  void supabase
    .from("clients")
    .update({ last_portal_login_at: new Date().toISOString() })
    .eq("id", match.id)
    .then(() => {})

  return {
    studioId: match.studio_id,
    clientId: match.id,
    clientName: match.name,
  }
}

// ─── Sesión: cookie firmada con HMAC ────────────────────────────────────────

type PortalPayload = {
  clientId: string
  studioId: string
  expiresAt: number // ms epoch
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url")
}

export function buildPortalCookieValue(
  clientId: string,
  studioId: string,
): string {
  const expiresAt = Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  const payload = `${clientId}.${studioId}.${expiresAt}`
  const sig = sign(payload)
  return `${payload}.${sig}`
}

export function parsePortalCookieValue(raw: string | undefined): PortalPayload | null {
  if (!raw) return null
  const parts = raw.split(".")
  if (parts.length !== 4) return null
  const [clientId, studioId, expiresAtStr, sig] = parts
  const payload = `${clientId}.${studioId}.${expiresAtStr}`
  const expectedSig = sign(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const expiresAt = Number(expiresAtStr)
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null

  return { clientId, studioId, expiresAt }
}

/** Cookie attributes para Set-Cookie. */
export function portalCookieOptions() {
  const isProd = process.env["NODE_ENV"] === "production"
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProd,
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  }
}
