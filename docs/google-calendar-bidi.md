# Google Calendar — Sincronización bidireccional

Cubre el flow de StudioFlow ↔ Google Calendar incluyendo push notifications
(webhook) para tiempo-real desde Google y syncToken para sync incremental.

## Arquitectura

```
StudioFlow                            Google Calendar
   |                                       |
   | -- POST /events (sync) -----------> creates event
   | -- PATCH /events/:id (sync) -----> updates
   | -- DELETE /events/:id (cancel) -> deletes
   |                                       |
   |                                       | -- POST /api/integrations/
   | <-- push notification ------------------- google/webhook
   |    (x-goog-channel-id header)         |   (sin payload, solo header)
   |                                       |
   | -- GET /events?syncToken=X --------> returns delta
   |                                       |
   ↓ persistir en google_events
     (mirror local con origen marcado)
```

## Modos de operación

### 1. StudioFlow → Google (outbound)

Cuando un proyecto cambia (create / update / cancel), llamamos
`syncProjectToEvent()` que:

- Si el proyecto no tiene `google_event_id` → POST event en el calendario activo
- Si ya tiene → PATCH con los nuevos datos
- Si se cancela → DELETE

Persiste en `projects.google_event_id` + `google_calendar_id` + `google_synced_at`.
También actualiza el mirror local `google_events`.

### 2. Google → StudioFlow (inbound)

#### Watch subscription

Cuando el user selecciona un calendar en `/settings/integrations/google`,
`setActiveCalendarAction` llama a `registerCalendarWatch()` que:

- POST `https://www.googleapis.com/calendar/v3/calendars/{calId}/events/watch`
  con `{id: <uuid>, type: "web_hook", address: <webhook_url>, expiration: <ms>}`
- Persiste el `channel_id` en `google_calendar_watches`
- Expiration: 7 días (renovable hasta 30)

#### Webhook handler

`POST /api/integrations/google/webhook` recibe (sin payload, todo en headers):

- `x-goog-channel-id`: matchea con `google_calendar_watches.channel_id`
- `x-goog-resource-state`: `sync` (handshake) | `exists` (cambio)

Flow:
1. Resolver studio_id por channel_id
2. Llamar `importGoogleEvents(studioId)` → upsert en `google_events`
3. Llamar `pullIncrementalChanges(studioId)` → events delta
4. Para cada event:
   - Si `cancelled` → limpiar `projects.google_event_id`
   - Si `modified` → last-write-wins (compare `googleUpdated > projectSyncedAt + 2s`)
   - Aplicar `event_date` y `location` si difieren

### 3. Renovación de watches

Watches expiran cada ~7 días. Cron diario llama:

```bash
curl -X POST -H "Authorization: Bearer $GOOGLE_WATCH_CRON_TOKEN" \
  https://my.abbypixel.com/api/cron/google-watches
```

Para cada watch con `expires_at < NOW() + 24h`:
1. `stopCalendarWatch(channelId, resourceId)` — POST `/channels/stop`
2. `registerCalendarWatch(studioId)` — nuevo channel + persistir

## Conflictos y last-write-wins

Política simple basada en timestamps:

```ts
if (googleUpdatedAt <= projectSyncedAt + 2000) {
  // Ignorar — probablemente es eco de nuestro propio PATCH
  return
}
// Aplicar cambio de Google
```

El margen de 2s absorbe la latencia entre nuestro PATCH y la notificación
push que Google nos manda como confirmación del PATCH.

## Setup de credenciales

### Env vars en VPS

```
GOOGLE_CLIENT_ID=<de Google Console>
GOOGLE_CLIENT_SECRET=<de Google Console>
GOOGLE_REDIRECT_URI=https://my.abbypixel.com/api/integrations/google/callback
NEXT_PUBLIC_APP_URL=https://my.abbypixel.com
OAUTH_STATE_SECRET=<openssl rand -hex 32>
GOOGLE_WATCH_CRON_TOKEN=<openssl rand -hex 32>
```

### Scopes

- `https://www.googleapis.com/auth/calendar.events` — CRUD
- `https://www.googleapis.com/auth/calendar.readonly` — listar calendars
- `openid`, `email` — para mostrar qué cuenta conectó

### Google Cloud Console

1. Habilita Google Calendar API
2. Crea credenciales OAuth 2.0 con tipo "Web application"
3. Authorized redirect URI: `https://my.abbypixel.com/api/integrations/google/callback`
4. Webhook URL para validation: agregar `https://my.abbypixel.com/api/integrations/google/webhook`
5. Verificar el dominio (Google requiere ownership verification para push notifications)

## Limitaciones conocidas

- Push notifications requieren HTTPS — no funciona en localhost
- Si el VPS está caído cuando expira un watch, hay que renovarlo manualmente
  desde `/settings/integrations/google` (botón "Re-registrar watch")
- `attendees` se envía a Google pero respuestas (accepted/declined) no se
  sincronizan back en V1
- No soportamos eventos recurrentes complejos (RRULE) — Google los expande
  a single events via `singleEvents=true` en queries

## Trigger manual desde UI

En `/settings/integrations/google`:

- **Conectar Google** — inicia OAuth (`connectGoogleCalendarAction`)
- **Calendario activo** — selector + `setActiveCalendarAction` (auto-registra watch)
- **Sincronizar ahora** — `syncGoogleCalendarNowAction` (full import)
- **Re-registrar watch** — `registerWatchAction` (si el watch caducó)
- **Desconectar** — revoke + soft-disable

## Verificación

```sql
-- Watches activos
SELECT studio_id, channel_id, expires_at
FROM google_calendar_watches
ORDER BY expires_at DESC;

-- Eventos sincronizados últimos 7 días
SELECT origin, count(*), max(last_synced_at) as latest
FROM google_events
WHERE last_synced_at > NOW() - INTERVAL '7 days'
GROUP BY origin;

-- Proyectos con sync pendiente o fallido
SELECT id, name, google_sync_error
FROM projects
WHERE google_sync_error IS NOT NULL;
```
