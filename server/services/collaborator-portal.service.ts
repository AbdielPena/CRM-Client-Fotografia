/**
 * Portal del COLABORADOR — autenticación propia (independiente del auth del CRM).
 *
 * El colaborador define su contraseña (y, opcional, un PIN) desde un link de
 * activación que envía el estudio. Luego entra con:
 *   - email + contraseña
 *   - email + PIN
 *   - solo PIN (si es único; si colisiona, cae a pedir email)
 *
 * La sesión vive en una cookie firmada con HMAC (patrón del portal de clientes,
 * `sf_portal`). No usa Supabase Auth → no ocupa asiento ni toca el login del CRM.
 * Visibilidad: el colaborador solo ve datos donde `collaborator_id == su_id`.
 */

import "server-only"

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { hash, compare } from "bcryptjs"

import { untypedService } from "@/server/supabase/untyped"

export const COLAB_COOKIE_NAME = "sf_colab"
const SESSION_TTL_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

function getSecret(): string {
  const s =
    process.env["OAUTH_STATE_SECRET"] ??
    process.env["NEXTAUTH_SECRET"] ??
    "dev-portal-secret-change-me"
  if (s === "dev-portal-secret-change-me" && process.env.NODE_ENV === "production") {
    throw new Error(
      "[collaborator-portal] OAUTH_STATE_SECRET / NEXTAUTH_SECRET no configurado en producción",
    )
  }
  return s
}

const pinLast4 = (pin: string) => pin.slice(-4)
const cleanPin = (pin: string | null | undefined) => (pin ?? "").replace(/\D/g, "")

// ─── Activación de cuenta (el estudio genera el link; el colab pone su clave) ──

/** Genera/renueva el token de activación (7 días). Devuelve el token + datos. */
export async function startPortalSetup(
  studioId: string,
  collaboratorId: string,
): Promise<{ token: string; email: string | null; name: string }> {
  const sb = untypedService()
  const { data } = await sb
    .from("collaborators")
    .select("id, name, email")
    .eq("studio_id", studioId)
    .eq("id", collaboratorId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!data) throw new Error("Colaborador no encontrado")
  const token = "colab_" + randomBytes(24).toString("hex")
  const expires = new Date(Date.now() + 7 * DAY_MS).toISOString()
  const { error } = await sb
    .from("collaborators")
    .update({ portal_setup_token: token, portal_setup_expires_at: expires })
    .eq("id", collaboratorId)
    .eq("studio_id", studioId)
  if (error) throw new Error(error.message)
  return {
    token,
    email: (data as { email: string | null }).email ?? null,
    name: (data as { name: string }).name,
  }
}

export async function getSetupByToken(token: string): Promise<{
  collaboratorId: string
  studioId: string
  name: string
  email: string | null
} | null> {
  if (!token) return null
  const sb = untypedService()
  const { data } = await sb
    .from("collaborators")
    .select("id, studio_id, name, email, portal_setup_expires_at")
    .eq("portal_setup_token", token)
    .is("deleted_at", null)
    .maybeSingle()
  if (!data) return null
  const exp = (data as { portal_setup_expires_at: string | null }).portal_setup_expires_at
  if (exp && new Date(exp).getTime() < Date.now()) return null
  return {
    collaboratorId: (data as { id: string }).id,
    studioId: (data as { studio_id: string }).studio_id,
    name: (data as { name: string }).name,
    email: (data as { email: string | null }).email ?? null,
  }
}

/** El colaborador define contraseña (+PIN opcional) desde el link de activación. */
export async function completePortalSetup(
  token: string,
  password: string,
  pin?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const setup = await getSetupByToken(token)
  if (!setup) return { ok: false, error: "Enlace inválido o vencido" }
  if (!password || password.length < 6) {
    return { ok: false, error: "La contraseña debe tener al menos 6 caracteres" }
  }
  const p = cleanPin(pin)
  if (p && (p.length < 4 || p.length > 8)) {
    return { ok: false, error: "El PIN debe tener de 4 a 8 dígitos" }
  }
  const sb = untypedService()
  const patch: Record<string, unknown> = {
    password_hash: await hash(password, 10),
    portal_enabled: true,
    portal_setup_token: null,
    portal_setup_expires_at: null,
  }
  if (p) {
    patch.pin_hash = await hash(p, 10)
    patch.pin_last4 = pinLast4(p)
  }
  const { error } = await sb
    .from("collaborators")
    .update(patch)
    .eq("id", setup.collaboratorId)
    .eq("studio_id", setup.studioId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── Login ──────────────────────────────────────────────────────────────────

type LoginRow = {
  id: string
  studio_id: string
  name: string
  email: string | null
  password_hash: string | null
  pin_hash: string | null
}

async function markLogin(id: string): Promise<void> {
  void untypedService()
    .from("collaborators")
    .update({ last_portal_login_at: new Date().toISOString() })
    .eq("id", id)
    .then(() => {})
}

/**
 * Login del colaborador. Acepta email+contraseña, email+PIN o solo-PIN.
 * Devuelve la identidad o null (credenciales inválidas / PIN ambiguo).
 */
export async function collaboratorLogin(input: {
  email?: string
  password?: string
  pin?: string
}): Promise<{ studioId: string; collaboratorId: string; name: string } | null> {
  const sb = untypedService()
  const email = (input.email ?? "").trim().toLowerCase()
  const password = (input.password ?? "").trim()
  const pin = cleanPin(input.pin)
  const cols = "id, studio_id, name, email, password_hash, pin_hash"

  if (email) {
    const { data } = await sb
      .from("collaborators")
      .select(cols)
      .ilike("email", email)
      .is("deleted_at", null)
      .eq("portal_enabled", true)
      .limit(5)
    for (const r of (data ?? []) as LoginRow[]) {
      if (password && r.password_hash && (await compare(password, r.password_hash))) {
        await markLogin(r.id)
        return { studioId: r.studio_id, collaboratorId: r.id, name: r.name }
      }
      if (pin && r.pin_hash && (await compare(pin, r.pin_hash))) {
        await markLogin(r.id)
        return { studioId: r.studio_id, collaboratorId: r.id, name: r.name }
      }
    }
    return null
  }

  // Solo PIN: candidatos por los últimos 4 dígitos, luego bcrypt-compare. Solo
  // se acepta si UN único colaborador matchea (si colisiona, cae a pedir email).
  if (pin) {
    const { data } = await sb
      .from("collaborators")
      .select(cols)
      .eq("pin_last4", pinLast4(pin))
      .is("deleted_at", null)
      .eq("portal_enabled", true)
      .limit(10)
    const matches: LoginRow[] = []
    for (const r of (data ?? []) as LoginRow[]) {
      if (r.pin_hash && (await compare(pin, r.pin_hash))) matches.push(r)
    }
    if (matches.length === 1) {
      const r = matches[0]!
      await markLogin(r.id)
      return { studioId: r.studio_id, collaboratorId: r.id, name: r.name }
    }
    return null
  }

  return null
}

// ─── Sesión: cookie firmada con HMAC ─────────────────────────────────────────

type ColabPayload = { collaboratorId: string; studioId: string; expiresAt: number }

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url")
}

export function buildColabCookieValue(collaboratorId: string, studioId: string): string {
  const expiresAt = Date.now() + SESSION_TTL_DAYS * DAY_MS
  const payload = `${collaboratorId}.${studioId}.${expiresAt}`
  return `${payload}.${sign(payload)}`
}

export function parseColabCookieValue(raw: string | undefined): ColabPayload | null {
  if (!raw) return null
  const parts = raw.split(".")
  if (parts.length !== 4) return null
  const [collaboratorId, studioId, expiresAtStr, sig] = parts
  const payload = `${collaboratorId}.${studioId}.${expiresAtStr}`
  const expected = sign(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const expiresAt = Number(expiresAtStr)
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null
  return { collaboratorId, studioId, expiresAt }
}

export function colabCookieOptions() {
  const isProd = process.env["NODE_ENV"] === "production"
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProd,
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  }
}
