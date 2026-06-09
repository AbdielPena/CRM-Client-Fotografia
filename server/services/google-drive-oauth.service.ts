import "server-only"

// untypedService: el valor de enum 'google_drive' aún no está en los tipos
// generados; usamos el cliente sin tipos estrictos para insert/select.
import { untypedService } from "@/server/supabase/untyped"

/**
 * Conexión OAuth de Google Drive SEPARADA de Google Calendar.
 * Guarda su propio token en `studio_integrations` con `service='google_drive'`,
 * para poder usar una cuenta de Drive distinta (p.ej. universitaria con
 * almacenamiento ilimitado) sin tocar la conexión de Calendar.
 * Reusa el MISMO callback `/api/integrations/google/callback` (distinguido por
 * el `state`, que lleva el sufijo `|drive`).
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const SERVICE = "google_drive"
const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "openid",
  "email",
]

type OAuthTokens = {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope?: string
  id_token?: string
}

type StoredConfig = {
  accessToken?: string
  refreshToken?: string
  expiresAt?: string
  scope?: string
  email?: string
}

function creds() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/integrations/google/callback`
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no configurados.")
  }
  return { clientId, clientSecret, redirectUri }
}

/** URL de autorización para conectar la cuenta de Drive (solo scope drive.file). */
export function getDriveAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = creds()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: DRIVE_SCOPES.join(" "),
    state,
    include_granted_scopes: "false",
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

function parseEmail(idToken?: string): string | null {
  if (!idToken) return null
  try {
    const payload = idToken.split(".")[1]
    const json = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as { email?: string }
    return json.email ?? null
  } catch {
    return null
  }
}

export async function saveDriveIntegration(studioId: string, tokens: OAuthTokens): Promise<void> {
  const supabase = untypedService()
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  const email = parseEmail(tokens.id_token)

  const { data: existing } = await supabase
    .from("studio_integrations")
    .select("id, config")
    .eq("studio_id", studioId)
    .eq("service", SERVICE)
    .maybeSingle()

  const prev = ((existing?.config as StoredConfig) ?? {}) as StoredConfig
  const config: StoredConfig = {
    ...prev,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? prev.refreshToken,
    expiresAt,
    scope: tokens.scope ?? prev.scope,
    email: email ?? prev.email,
  }

  if (existing) {
    const { error } = await supabase
      .from("studio_integrations")
      .update({
        is_enabled: true,
        config,
        last_verified_at: new Date().toISOString(),
        last_error: null,
        last_error_at: null,
      })
      .eq("id", existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from("studio_integrations").insert({
      studio_id: studioId,
      service: SERVICE,
      is_enabled: true,
      config,
      last_verified_at: new Date().toISOString(),
    })
    if (error) throw error
  }
}

async function loadDrive(studioId: string): Promise<{ id: string; config: StoredConfig } | null> {
  const supabase = untypedService()
  const { data } = await supabase
    .from("studio_integrations")
    .select("id, config, is_enabled")
    .eq("studio_id", studioId)
    .eq("service", SERVICE)
    .maybeSingle()
  if (!data || !data.is_enabled) return null
  return { id: data.id, config: (data.config ?? {}) as StoredConfig }
}

async function refresh(refreshToken: string): Promise<OAuthTokens> {
  const { clientId, clientSecret } = creds()
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  })
  if (!res.ok) throw new Error(`Google Drive refresh failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as OAuthTokens
}

/** Access token válido para Drive (refresca si hace falta). null si no conectado. */
export async function getDriveAccessToken(studioId: string): Promise<string | null> {
  const integration = await loadDrive(studioId)
  if (!integration) return null
  const { id, config } = integration
  if (!config.refreshToken) return null

  const expiresAt = config.expiresAt ? new Date(config.expiresAt).getTime() : 0
  if (config.accessToken && expiresAt - Date.now() >= 60_000) return config.accessToken

  let fresh: OAuthTokens
  try {
    fresh = await refresh(config.refreshToken)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "refresh_failed"
    const dead = /invalid_grant|unauthorized_client|invalid_client|expired or revoked/i.test(msg)
    const svc = untypedService()
    await svc
      .from("studio_integrations")
      .update({
        last_error: dead
          ? "La conexión de Google Drive expiró o fue revocada. Reconéctala."
          : `Error refrescando Google Drive: ${msg.slice(0, 200)}`,
        last_error_at: new Date().toISOString(),
        ...(dead ? { is_enabled: false } : {}),
      })
      .eq("id", id)
    return null
  }

  const newExpiresAt = new Date(Date.now() + fresh.expires_in * 1000).toISOString()
  const merged: StoredConfig = {
    ...config,
    accessToken: fresh.access_token,
    expiresAt: newExpiresAt,
    scope: fresh.scope ?? config.scope,
  }
  const svc = untypedService()
  await svc
    .from("studio_integrations")
    .update({ config: merged, updated_at: new Date().toISOString() })
    .eq("id", id)
  return fresh.access_token
}

export async function getDriveConnectionStatus(
  studioId: string,
): Promise<{ connected: boolean; email: string | null }> {
  const integration = await loadDrive(studioId)
  if (!integration || !integration.config.refreshToken) return { connected: false, email: null }
  const hasDrive =
    typeof integration.config.scope === "string" && integration.config.scope.includes("drive.file")
  return { connected: hasDrive, email: integration.config.email ?? null }
}

export async function disconnectGoogleDrive(studioId: string): Promise<void> {
  const supabase = untypedService()
  await supabase
    .from("studio_integrations")
    .update({ is_enabled: false, config: {}, last_error: null })
    .eq("studio_id", studioId)
    .eq("service", SERVICE)
}
