import 'server-only'

import { createSupabaseServerClient } from '@/server/supabase/server'
import { createSupabaseServiceClient } from '@/server/supabase/service'

/**
 * Integración Google Calendar (Fase 2b).
 *
 * Usa OAuth 2.0 con refresh token + fetch nativo (sin googleapis SDK).
 * Tokens se guardan en `studio_integrations.config` (service=google_calendar).
 *
 * Scopes mínimos:
 *   - calendar.events (CRUD de eventos)
 *   - calendar.readonly (listar calendarios del user)
 *
 * Pattern:
 *   1. Usuario hace click en "Conectar Google" → redirect a getAuthorizeUrl().
 *   2. Google redirecciona a /api/integrations/google/callback?code=...
 *   3. exchangeCodeForTokens() intercambia code por access + refresh token.
 *   4. saveIntegration() persiste en studio_integrations.
 *   5. Cualquier llamada a la API: getAccessToken() refresca si está vencido.
 *   6. syncProjectToEvent() crea/actualiza el evento al cambiar un proyecto.
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'openid',
  'email',
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
  expiresAt?: string // ISO
  scope?: string
  email?: string
  calendarId?: string // calendario seleccionado por el user
  calendarName?: string
  syncToken?: string // incremental sync pointer
}

export type GoogleCalendarStatus = {
  enabled: boolean
  email: string | null
  calendarId: string | null
  calendarName: string | null
  lastVerifiedAt: string | null
  lastError: string | null
}

function getClientCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/integrations/google/callback`

  if (!clientId || !clientSecret) {
    throw new Error(
      'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no configurados. Ver /settings/integrations.',
    )
  }
  return { clientId, clientSecret, redirectUri }
}

/**
 * Construye la URL de autorización. `state` debe contener el studioId
 * firmado o base64-encoded para recuperarlo en el callback.
 */
export function getAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getClientCredentials()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent', // fuerza refresh_token en cada auth
    scope: SCOPES.join(' '),
    state,
    include_granted_scopes: 'true',
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

/**
 * Intercambia el `code` por tokens de acceso + refresh.
 */
export async function exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
  const { clientId, clientSecret, redirectUri } = getClientCredentials()

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as OAuthTokens
}

async function refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
  const { clientId, clientSecret } = getClientCredentials()

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    throw new Error(`Google refresh failed: ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as OAuthTokens
}

/**
 * Decode id_token (JWT simple, sin verificar firma — solo para sacar email).
 * Google ya verificó el token, solo queremos el payload.
 */
function parseEmailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null
  const parts = idToken.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'))
    return payload.email ?? null
  } catch {
    return null
  }
}

/**
 * Guarda la integración después del callback OAuth.
 */
export async function saveIntegration(
  studioId: string,
  tokens: OAuthTokens,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  const email = parseEmailFromIdToken(tokens.id_token)

  const config: StoredConfig = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
    scope: tokens.scope,
    email: email ?? undefined,
  }

  // Upsert manual (no hay unique constraint en (studio_id, service) pero sí
  // asumimos 1 fila por service — limpiar primero por consistencia)
  await supabase
    .from('studio_integrations')
    .delete()
    .eq('studio_id', studioId)
    .eq('service', 'google_calendar')

  const { error } = await supabase.from('studio_integrations').insert({
    studio_id: studioId,
    service: 'google_calendar',
    is_enabled: true,
    config,
    last_verified_at: new Date().toISOString(),
  })

  if (error) throw error
}

async function loadIntegration(
  studioId: string,
): Promise<{ id: string; config: StoredConfig } | null> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('studio_integrations')
    .select('id, config, is_enabled')
    .eq('studio_id', studioId)
    .eq('service', 'google_calendar')
    .maybeSingle()

  if (error || !data || !data.is_enabled) return null
  return { id: data.id, config: (data.config ?? {}) as StoredConfig }
}

async function updateIntegrationConfig(
  integrationId: string,
  patch: Partial<StoredConfig>,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { data: current } = await supabase
    .from('studio_integrations')
    .select('config')
    .eq('id', integrationId)
    .maybeSingle()

  const merged = { ...(current?.config as Record<string, unknown> ?? {}), ...patch }
  const { error } = await supabase
    .from('studio_integrations')
    .update({ config: merged, updated_at: new Date().toISOString() })
    .eq('id', integrationId)
  if (error) throw error
}

/**
 * Devuelve un access_token válido. Refresca si está próximo a expirar.
 * Retorna null si no hay integración activa.
 */
export async function getAccessToken(studioId: string): Promise<string | null> {
  const integration = await loadIntegration(studioId)
  if (!integration) return null

  const { id, config } = integration
  if (!config.refreshToken) return null

  const expiresAt = config.expiresAt ? new Date(config.expiresAt).getTime() : 0
  const needsRefresh = !config.accessToken || expiresAt - Date.now() < 60_000 // <60s

  if (!needsRefresh) return config.accessToken!

  const fresh = await refreshAccessToken(config.refreshToken)
  const newExpiresAt = new Date(Date.now() + fresh.expires_in * 1000).toISOString()
  await updateIntegrationConfig(id, {
    accessToken: fresh.access_token,
    expiresAt: newExpiresAt,
    // Google puede rotar el refresh_token — usar el nuevo si vino
    ...(fresh.refresh_token ? { refreshToken: fresh.refresh_token } : {}),
  })
  return fresh.access_token
}

/**
 * Status para la UI de settings.
 */
export async function getGoogleCalendarStatus(
  studioId: string,
): Promise<GoogleCalendarStatus> {
  const supabase = createSupabaseServerClient()
  const { data } = await supabase
    .from('studio_integrations')
    .select('is_enabled, config, last_verified_at, last_error')
    .eq('studio_id', studioId)
    .eq('service', 'google_calendar')
    .maybeSingle()

  if (!data) {
    return {
      enabled: false,
      email: null,
      calendarId: null,
      calendarName: null,
      lastVerifiedAt: null,
      lastError: null,
    }
  }

  const cfg = (data.config ?? {}) as StoredConfig
  return {
    enabled: data.is_enabled,
    email: cfg.email ?? null,
    calendarId: cfg.calendarId ?? null,
    calendarName: cfg.calendarName ?? null,
    lastVerifiedAt: data.last_verified_at,
    lastError: data.last_error,
  }
}

export type GoogleCalendarOption = {
  id: string
  summary: string
  primary: boolean
  backgroundColor?: string
}

/**
 * Lista los calendarios del user autenticado. Para que elija uno como destino.
 */
export async function listUserCalendars(
  studioId: string,
): Promise<GoogleCalendarOption[]> {
  const token = await getAccessToken(studioId)
  if (!token) throw new Error('Google Calendar no conectado')

  const res = await fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`Google listCalendars failed: ${res.status}`)
  }
  const body = (await res.json()) as {
    items?: Array<{
      id: string
      summary: string
      primary?: boolean
      backgroundColor?: string
      accessRole?: string
    }>
  }

  return (body.items ?? [])
    .filter((c) => c.accessRole === 'owner' || c.accessRole === 'writer')
    .map((c) => ({
      id: c.id,
      summary: c.summary,
      primary: !!c.primary,
      backgroundColor: c.backgroundColor,
    }))
}

export async function setActiveCalendar(
  studioId: string,
  calendarId: string,
  calendarName: string,
): Promise<void> {
  const integration = await loadIntegration(studioId)
  if (!integration) throw new Error('Google Calendar no conectado')
  await updateIntegrationConfig(integration.id, { calendarId, calendarName })
}

export async function disconnectGoogleCalendar(studioId: string): Promise<void> {
  const supabase = createSupabaseServiceClient()
  // Revocar token si tenemos refresh token
  const integration = await loadIntegration(studioId)
  if (integration?.config.refreshToken) {
    try {
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: integration.config.refreshToken }),
      })
    } catch {
      // best-effort
    }
  }

  // Soft-disable: mantener config vacía pero is_enabled=false
  await supabase
    .from('studio_integrations')
    .update({ is_enabled: false, config: {} })
    .eq('studio_id', studioId)
    .eq('service', 'google_calendar')

  // Limpiar referencias en proyectos
  await supabase
    .from('projects')
    .update({
      google_event_id: null,
      google_calendar_id: null,
      google_synced_at: null,
      google_sync_error: null,
    })
    .eq('studio_id', studioId)
}

// ---------------------------------------------------------------------------
// Event sync
// ---------------------------------------------------------------------------

export type ProjectEventPayload = {
  projectId: string
  studioId: string
  title: string
  description?: string | null
  date: string // YYYY-MM-DD
  startTime?: string | null // HH:mm
  endTime?: string | null
  location?: string | null
  timezone?: string
  attendeeEmails?: string[]
}

function buildEventBody(p: ProjectEventPayload) {
  const tz = p.timezone ?? 'America/Santo_Domingo'
  // Si no hay hora → evento all-day
  if (!p.startTime) {
    const end = p.date // all-day
    return {
      summary: p.title,
      description: p.description ?? undefined,
      location: p.location ?? undefined,
      start: { date: p.date },
      end: { date: end },
      attendees: p.attendeeEmails?.map((email) => ({ email })),
      source: { title: 'StudioFlow', url: process.env.NEXT_PUBLIC_APP_URL ?? '' },
    }
  }

  const startDateTime = `${p.date}T${p.startTime.padEnd(5, '0')}:00`
  const endDateTime = p.endTime
    ? `${p.date}T${p.endTime.padEnd(5, '0')}:00`
    : `${p.date}T${addHours(p.startTime, 2)}:00`

  return {
    summary: p.title,
    description: p.description ?? undefined,
    location: p.location ?? undefined,
    start: { dateTime: startDateTime, timeZone: tz },
    end: { dateTime: endDateTime, timeZone: tz },
    attendees: p.attendeeEmails?.map((email) => ({ email })),
    source: { title: 'StudioFlow', url: process.env.NEXT_PUBLIC_APP_URL ?? '' },
  }
}

function addHours(hhmm: string, hours: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + (m || 0) + hours * 60
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * Crea o actualiza el evento asociado al proyecto.
 * Si ya existe `google_event_id`, hace PATCH; si no, POST.
 */
export async function syncProjectToEvent(
  payload: ProjectEventPayload,
): Promise<{ eventId: string; calendarId: string } | null> {
  const supabase = createSupabaseServiceClient()
  const integration = await loadIntegration(payload.studioId)
  if (!integration) return null
  const calendarId = integration.config.calendarId
  if (!calendarId) return null

  const token = await getAccessToken(payload.studioId)
  if (!token) return null

  // Leer google_event_id actual del proyecto
  const { data: project } = await supabase
    .from('projects')
    .select('google_event_id, google_calendar_id')
    .eq('id', payload.projectId)
    .maybeSingle()

  const existingEventId = project?.google_event_id
  const existingCalId = project?.google_calendar_id ?? calendarId

  const body = buildEventBody(payload)
  const base = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(existingCalId)}/events`
  const url = existingEventId
    ? `${base}/${encodeURIComponent(existingEventId)}`
    : base
  const method = existingEventId ? 'PATCH' : 'POST'

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errorText = await res.text()
    await supabase
      .from('projects')
      .update({ google_sync_error: `${res.status}: ${errorText.slice(0, 200)}` })
      .eq('id', payload.projectId)
    throw new Error(`Google sync failed: ${res.status} ${errorText}`)
  }

  const event = (await res.json()) as {
    id: string
    htmlLink?: string
    start?: { date?: string; dateTime?: string }
    end?: { date?: string; dateTime?: string }
  }

  await supabase
    .from('projects')
    .update({
      google_event_id: event.id,
      google_calendar_id: existingCalId,
      google_synced_at: new Date().toISOString(),
      google_sync_error: null,
    })
    .eq('id', payload.projectId)

  // Espejo en google_events para que el calendar UI lo muestre como
  // 'studioflow' origin con relación al proyecto.
  const startDt =
    event.start?.dateTime ?? (event.start?.date ? `${event.start.date}T00:00:00Z` : null)
  const endDt =
    event.end?.dateTime ?? (event.end?.date ? `${event.end.date}T23:59:59Z` : null)
  const isAllDay = !!event.start?.date && !event.start?.dateTime

  await supabase.from('google_events').upsert(
    {
      studio_id: payload.studioId,
      google_event_id: event.id,
      google_calendar_id: existingCalId,
      summary: payload.title,
      description: payload.description ?? null,
      location: payload.location ?? null,
      starts_at: startDt,
      ends_at: endDt,
      is_all_day: isAllDay,
      html_link: event.htmlLink ?? null,
      status: 'confirmed',
      origin: 'studioflow',
      project_id: payload.projectId,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
      sync_error: null,
    },
    { onConflict: 'studio_id,google_event_id' },
  )

  return { eventId: event.id, calendarId: existingCalId }
}

/**
 * Helper de alto nivel: carga el proyecto + cliente y sincroniza a Google.
 * Best-effort: si la integración no está activa, si no hay calendario
 * seleccionado, o si Google falla, loggea y sigue — no rompe el flujo de
 * negocio (crear/actualizar/aprobar).
 *
 * Devuelve true si realmente llamó a Google y fue ok; false en cualquier otro
 * caso (incluyendo "no hay integración"). Útil para decidir si loggear.
 */
export async function syncProjectById(
  studioId: string,
  projectId: string,
): Promise<boolean> {
  try {
    const supabase = createSupabaseServiceClient()
    const { data: project, error } = await supabase
      .from('projects')
      .select(
        'id, studio_id, name, event_type, event_date, location, notes, client:clients(email, name)',
      )
      .eq('id', projectId)
      .eq('studio_id', studioId)
      .maybeSingle()

    if (error || !project || !project.event_date) return false

    const client = Array.isArray(project.client)
      ? project.client[0]
      : project.client
    const clientName = (client as { name?: string } | null)?.name
    const clientEmail = (client as { email?: string } | null)?.email

    const title = clientName
      ? `${project.name} — ${clientName}`
      : project.name

    const result = await syncProjectToEvent({
      projectId: project.id,
      studioId,
      title,
      description: project.notes ?? undefined,
      date: project.event_date,
      startTime: null, // no tenemos event_time en el schema actual → all-day
      endTime: null,
      location: project.location ?? undefined,
      attendeeEmails: clientEmail ? [clientEmail] : undefined,
    })
    return !!result
  } catch (err) {
    // Best-effort. Nunca rompe el flujo principal.
    console.error('[syncProjectById] failed', err)
    return false
  }
}

/**
 * Versión best-effort de deleteProjectEvent que jamás lanza.
 */
export async function deleteProjectEventSafe(
  studioId: string,
  projectId: string,
): Promise<void> {
  try {
    await deleteProjectEvent(studioId, projectId)
  } catch (err) {
    console.error('[deleteProjectEventSafe] failed', err)
  }
}

/**
 * Elimina el evento de Google cuando se cancela el proyecto.
 */
export async function deleteProjectEvent(
  studioId: string,
  projectId: string,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { data: project } = await supabase
    .from('projects')
    .select('google_event_id, google_calendar_id')
    .eq('id', projectId)
    .maybeSingle()

  if (!project?.google_event_id || !project.google_calendar_id) return

  const token = await getAccessToken(studioId)
  if (!token) return

  await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(project.google_calendar_id)}/events/${encodeURIComponent(project.google_event_id)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  ).catch(() => {
    // best-effort; si el evento ya no existe Google devuelve 410 Gone
  })

  await supabase
    .from('projects')
    .update({
      google_event_id: null,
      google_calendar_id: null,
      google_synced_at: null,
      google_sync_error: null,
    })
    .eq('id', projectId)

  // Limpia también el espejo local
  if (project.google_event_id) {
    await supabase
      .from('google_events')
      .delete()
      .eq('studio_id', studioId)
      .eq('google_event_id', project.google_event_id)
  }
}

// ---------------------------------------------------------------------------
// Incoming webhook (Google → StudioFlow)
// ---------------------------------------------------------------------------

/**
 * Lee eventos nuevos/modificados desde el calendario usando syncToken (incremental).
 * Llamado cuando recibimos un channel push notification.
 *
 * Retorna los eventos con sus IDs; el caller decide qué hacer con cada uno.
 */
type GoogleEventApi = {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  start?: { date?: string; dateTime?: string; timeZone?: string }
  end?: { date?: string; dateTime?: string; timeZone?: string }
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>
  source?: { title?: string; url?: string }
  organizer?: { email?: string; self?: boolean }
}

export async function pullIncrementalChanges(
  studioId: string,
): Promise<{ events: GoogleEventApi[]; newSyncToken: string | null }> {
  const integration = await loadIntegration(studioId)
  if (!integration || !integration.config.calendarId) {
    return { events: [], newSyncToken: null }
  }

  const token = await getAccessToken(studioId)
  if (!token) return { events: [], newSyncToken: null }

  const params = new URLSearchParams({ showDeleted: 'true', singleEvents: 'true' })
  if (integration.config.syncToken) {
    params.set('syncToken', integration.config.syncToken)
  } else {
    // Primera vez: traer ventana reciente (últimos 30 días + próximos 365)
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    params.set('timeMin', from)
  }

  const url = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(
    integration.config.calendarId,
  )}/events?${params.toString()}`

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })

  // 410 Gone → syncToken caducó, limpiar y pedir reinicio
  if (res.status === 410) {
    await updateIntegrationConfig(integration.id, { syncToken: undefined })
    return { events: [], newSyncToken: null }
  }
  if (!res.ok) {
    throw new Error(`Google pullChanges failed: ${res.status}`)
  }

  const body = (await res.json()) as {
    items?: GoogleEventApi[]
    nextSyncToken?: string
  }

  if (body.nextSyncToken) {
    await updateIntegrationConfig(integration.id, { syncToken: body.nextSyncToken })
  }

  return { events: body.items ?? [], newSyncToken: body.nextSyncToken ?? null }
}

// ============================================================================
// IMPORT bidireccional: persiste eventos de Google en `google_events`
// ============================================================================

/**
 * Importa eventos de Google Calendar a la tabla local `google_events`.
 * - Inicial: trae los últimos 30 días + próximos 12 meses.
 * - Incremental: usa syncToken (vía pullIncrementalChanges).
 * Detecta si el evento ya existe (por google_event_id) → upsert sin duplicar.
 * Marca origen automáticamente:
 *   - Si tiene source.title="StudioFlow" → "synced"
 *   - Si no → "external" (personal del usuario)
 */
export async function importGoogleEvents(
  studioId: string,
  opts: { fullSync?: boolean } = {},
): Promise<{ imported: number; updated: number; deleted: number; calendarId: string | null }> {
  const supabase = createSupabaseServiceClient()
  const integration = await loadIntegration(studioId)
  if (!integration || !integration.config.calendarId) {
    return { imported: 0, updated: 0, deleted: 0, calendarId: null }
  }
  const calendarId = integration.config.calendarId

  // Si fullSync, limpiamos el syncToken para arrancar de cero
  if (opts.fullSync) {
    await updateIntegrationConfig(integration.id, { syncToken: undefined })
  }

  // Para el sync incremental usamos pullIncrementalChanges (con syncToken).
  // Para el sync inicial (sin syncToken) trae ventana ±12 meses.
  const token = await getAccessToken(studioId)
  if (!token) {
    return { imported: 0, updated: 0, deleted: 0, calendarId }
  }

  const params = new URLSearchParams({
    showDeleted: 'true',
    singleEvents: 'true',
    maxResults: '2500',
  })
  if (integration.config.syncToken && !opts.fullSync) {
    params.set('syncToken', integration.config.syncToken)
  } else {
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const to = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    params.set('timeMin', from)
    params.set('timeMax', to)
  }

  const url = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })

  if (res.status === 410) {
    await updateIntegrationConfig(integration.id, { syncToken: undefined })
    return { imported: 0, updated: 0, deleted: 0, calendarId }
  }
  if (!res.ok) {
    throw new Error(`Google import failed: ${res.status} ${await res.text()}`)
  }

  const body = (await res.json()) as {
    items?: GoogleEventApi[]
    nextSyncToken?: string
  }

  if (body.nextSyncToken) {
    await updateIntegrationConfig(integration.id, { syncToken: body.nextSyncToken })
  }

  let imported = 0
  let updated = 0
  let deleted = 0

  for (const evt of body.items ?? []) {
    if (!evt.id) continue

    // Cancelado/eliminado en Google
    if (evt.status === 'cancelled') {
      const { error: delErr } = await supabase
        .from('google_events')
        .delete()
        .eq('studio_id', studioId)
        .eq('google_event_id', evt.id)
      if (!delErr) deleted++
      continue
    }

    // Determinar origen
    const isFromStudioflow = evt.source?.title === 'StudioFlow'

    // Buscar existente
    const { data: existing } = await supabase
      .from('google_events')
      .select('id, origin, project_id')
      .eq('studio_id', studioId)
      .eq('google_event_id', evt.id)
      .maybeSingle()

    const existingRow = existing as { id: string; origin: string; project_id: string | null } | null

    let origin: 'studioflow' | 'google_calendar' | 'synced' | 'external'
    if (isFromStudioflow) {
      // Vino de StudioFlow originalmente
      origin = existingRow?.origin === 'studioflow' ? 'studioflow' : 'synced'
    } else if (existingRow?.project_id) {
      // Tiene un proyecto vinculado → conserva su origen
      origin = (existingRow.origin as typeof origin) ?? 'external'
    } else {
      // Externo (personal del usuario)
      origin = 'external'
    }

    const startDt = evt.start?.dateTime ?? (evt.start?.date ? `${evt.start.date}T00:00:00Z` : null)
    const endDt = evt.end?.dateTime ?? (evt.end?.date ? `${evt.end.date}T23:59:59Z` : null)
    const isAllDay = !!evt.start?.date && !evt.start?.dateTime

    const payload = {
      studio_id: studioId,
      google_event_id: evt.id,
      google_calendar_id: calendarId,
      summary: evt.summary ?? null,
      description: evt.description ?? null,
      location: evt.location ?? null,
      starts_at: startDt,
      ends_at: endDt,
      is_all_day: isAllDay,
      attendees: evt.attendees ?? [],
      html_link: evt.htmlLink ?? null,
      status: evt.status ?? 'confirmed',
      origin,
      sync_status: 'synced' as const,
      last_synced_at: new Date().toISOString(),
      sync_error: null,
    }

    if (existingRow) {
      const { error: upErr } = await supabase
        .from('google_events')
        .update(payload)
        .eq('id', existingRow.id)
      if (!upErr) updated++
    } else {
      const { error: insErr } = await supabase
        .from('google_events')
        .insert(payload)
      if (!insErr) imported++
    }
  }

  return { imported, updated, deleted, calendarId }
}

// ============================================================================
// QUERY: lectura unificada para el calendar UI
// ============================================================================

export type CalendarEventRow = {
  id: string
  googleEventId: string
  googleCalendarId: string
  summary: string | null
  description: string | null
  location: string | null
  startsAt: string | null
  endsAt: string | null
  isAllDay: boolean
  htmlLink: string | null
  status: string
  origin: 'studioflow' | 'google_calendar' | 'synced' | 'external'
  projectId: string | null
  clientId: string | null
  bookingRequestId: string | null
  contractId: string | null
  invoiceId: string | null
  galleryId: string | null
  deliveryId: string | null
  syncStatus: string
  lastSyncedAt: string | null
  /** Cliente nombre resuelto (join). */
  clientName: string | null
  projectName: string | null
}

export type CalendarOriginFilter =
  | 'all'
  | 'studioflow'
  | 'google_calendar'
  | 'with_client'
  | 'external'

export async function listCalendarEvents(
  studioId: string,
  opts: {
    from?: string // ISO
    to?: string   // ISO
    origin?: CalendarOriginFilter
  } = {},
): Promise<CalendarEventRow[]> {
  const supabase = createSupabaseServerClient()

  let q = supabase
    .from('google_events')
    .select(`
      id, google_event_id, google_calendar_id, summary, description, location,
      starts_at, ends_at, is_all_day, html_link, status, origin,
      project_id, client_id, booking_request_id, contract_id, invoice_id,
      gallery_id, delivery_id, sync_status, last_synced_at,
      project:projects(name),
      client:clients(name)
    `)
    .eq('studio_id', studioId)
    .eq('is_hidden', false)
    .order('starts_at', { ascending: true })

  if (opts.from) q = q.gte('starts_at', opts.from)
  if (opts.to) q = q.lte('starts_at', opts.to)

  // Filtro por origen
  switch (opts.origin) {
    case 'studioflow':
      q = q.in('origin', ['studioflow', 'synced'])
      break
    case 'google_calendar':
      // Todo lo que vino de Google: importados (external) + ya vinculados (google_calendar)
      q = q.in('origin', ['google_calendar', 'external'])
      break
    case 'with_client':
      q = q.not('client_id', 'is', null)
      break
    case 'external':
      // Solo los personales puros (sin vínculo a cliente/proyecto)
      q = q.eq('origin', 'external')
      break
    case 'all':
    default:
      break
  }

  const { data, error } = await q
  if (error) throw new Error(`[listCalendarEvents] ${error.message}`)

  type Row = {
    id: string
    google_event_id: string
    google_calendar_id: string
    summary: string | null
    description: string | null
    location: string | null
    starts_at: string | null
    ends_at: string | null
    is_all_day: boolean
    html_link: string | null
    status: string
    origin: 'studioflow' | 'google_calendar' | 'synced' | 'external'
    project_id: string | null
    client_id: string | null
    booking_request_id: string | null
    contract_id: string | null
    invoice_id: string | null
    gallery_id: string | null
    delivery_id: string | null
    sync_status: string
    last_synced_at: string | null
    project: { name: string } | { name: string }[] | null
    client: { name: string } | { name: string }[] | null
  }

  return ((data as Row[] | null) ?? []).map((r) => {
    const proj = Array.isArray(r.project) ? r.project[0] ?? null : r.project
    const cli = Array.isArray(r.client) ? r.client[0] ?? null : r.client
    return {
      id: r.id,
      googleEventId: r.google_event_id,
      googleCalendarId: r.google_calendar_id,
      summary: r.summary,
      description: r.description,
      location: r.location,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      isAllDay: r.is_all_day,
      htmlLink: r.html_link,
      status: r.status,
      origin: r.origin,
      projectId: r.project_id,
      clientId: r.client_id,
      bookingRequestId: r.booking_request_id,
      contractId: r.contract_id,
      invoiceId: r.invoice_id,
      galleryId: r.gallery_id,
      deliveryId: r.delivery_id,
      syncStatus: r.sync_status,
      lastSyncedAt: r.last_synced_at,
      projectName: proj?.name ?? null,
      clientName: cli?.name ?? null,
    }
  })
}

/**
 * Vincula manualmente un evento externo a un cliente/proyecto/etc.
 * Conserva el google_event_id pero cambia el origin a "synced" si era "external".
 */
export async function linkCalendarEventToEntity(
  studioId: string,
  eventId: string,
  links: {
    projectId?: string | null
    clientId?: string | null
    bookingRequestId?: string | null
    contractId?: string | null
    invoiceId?: string | null
    galleryId?: string | null
    deliveryId?: string | null
  },
): Promise<void> {
  const supabase = createSupabaseServiceClient()

  const { data: existing } = await supabase
    .from('google_events')
    .select('id, origin')
    .eq('id', eventId)
    .eq('studio_id', studioId)
    .maybeSingle()

  if (!existing) throw new Error('EVENT_NOT_FOUND')

  const row = existing as { id: string; origin: string }
  const newOrigin =
    row.origin === 'external' && (links.clientId || links.projectId)
      ? 'synced'
      : row.origin

  const patch = {
    project_id: links.projectId ?? undefined,
    client_id: links.clientId ?? undefined,
    booking_request_id: links.bookingRequestId ?? undefined,
    contract_id: links.contractId ?? undefined,
    invoice_id: links.invoiceId ?? undefined,
    gallery_id: links.galleryId ?? undefined,
    delivery_id: links.deliveryId ?? undefined,
    origin: newOrigin,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('google_events')
    .update(patch)
    .eq('id', eventId)
    .eq('studio_id', studioId)

  if (error) throw new Error(`[linkCalendarEventToEntity] ${error.message}`)
}
