import { CalendarDays, CheckCircle2, AlertCircle, Link2, RefreshCw, HardDriveUpload } from 'lucide-react'

import { AppTopbar } from '@/components/layout/app-topbar'
import { requireStudioAuth } from '@/server/middleware/auth'
import { countUnreadNotifications } from '@/server/services/notification.service'
import {
  getGoogleCalendarStatus,
  listUserCalendars,
  type GoogleCalendarOption,
} from '@/server/services/google-calendar.service'
import { getDriveConnectionStatus } from '@/server/services/google-drive-oauth.service'
import {
  connectGoogleCalendarAction,
  disconnectGoogleCalendarAction,
  setActiveCalendarAction,
  syncGoogleCalendarNowAction,
} from '@/server/actions/google-calendar.actions'
import {
  connectGoogleDriveAction,
  disconnectGoogleDriveAction,
} from '@/server/actions/google-drive-oauth.actions'
import { createSupabaseServerClient } from '@/server/supabase/server'

type SearchParams = { error?: string; connected?: string }

export default async function GoogleCalendarIntegrationPage({
  searchParams,
}: {
  searchParams?: SearchParams
}) {
  const session = await requireStudioAuth()
  const [status, unread] = await Promise.all([
    getGoogleCalendarStatus(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  let calendars: GoogleCalendarOption[] = []
  let loadCalendarsError: string | null = null
  if (status.enabled) {
    try {
      calendars = await listUserCalendars(session.studioId)
    } catch (e) {
      loadCalendarsError =
        e instanceof Error ? e.message : 'No se pudieron cargar tus calendarios'
    }
  }

  const justConnected = searchParams?.connected === '1'
  const callbackError = searchParams?.error

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Google Calendar"
        description="Sincroniza tus eventos de PixelOS con tu calendario de Google."
        unreadNotifications={unread}
      />

      <div className="px-6 py-6 lg:px-8 lg:py-8 space-y-6 max-w-3xl">
        {justConnected && (
          <div className="sf-card p-4 bg-emerald-50 border-emerald-100 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-emerald-900">Cuenta conectada</p>
              <p className="text-xs text-emerald-800 mt-0.5">
                Elige abajo en qué calendario quieres que aparezcan tus bookings.
              </p>
            </div>
          </div>
        )}

        {callbackError && (
          <div className="sf-card p-4 bg-danger/10 border-red-100 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-danger flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-900">No pudimos conectar</p>
              <p className="text-xs text-red-800 mt-0.5 break-all">{callbackError}</p>
            </div>
          </div>
        )}

        {!status.enabled ? (
          <section className="sf-card p-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-violet-100 text-violet-700 mx-auto mb-4 flex items-center justify-center">
              <CalendarDays className="h-6 w-6" />
            </div>
            <h2 className="font-display text-2xl text-foreground mb-2">
              Conecta tu Google Calendar
            </h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              Cada sesión aprobada en PixelOS se crea automáticamente como evento
              en el calendario que elijas. También podrás recibir cambios de vuelta.
            </p>
            <form action={connectGoogleCalendarAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
              >
                <Link2 className="h-4 w-4" />
                Conectar con Google
              </button>
            </form>
          </section>
        ) : (
          <>
            <section className="sf-card p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="font-display text-xl text-foreground mb-1">
                    Cuenta conectada
                  </h2>
                  <p className="text-sm text-foreground">
                    {status.email ?? 'cuenta de Google'}
                  </p>
                  {status.lastVerifiedAt && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Verificado{' '}
                      {new Date(status.lastVerifiedAt).toLocaleDateString('es')}
                    </p>
                  )}
                </div>
                <form action={disconnectGoogleCalendarAction}>
                  <button
                    type="submit"
                    className="text-xs font-medium text-danger hover:text-red-800"
                  >
                    Desconectar
                  </button>
                </form>
              </div>

              {status.lastError && (
                <div className="text-xs text-danger bg-danger/10 border border-red-100 rounded-lg p-2.5 mb-4">
                  {status.lastError}
                </div>
              )}
            </section>

            <section className="sf-card p-6">
              <h2 className="font-display text-xl text-foreground mb-1">
                Calendario activo
              </h2>
              <p className="text-xs text-muted-foreground mb-4">
                PixelOS creará eventos aquí cuando apruebes un booking o confirmes
                una sesión.
              </p>

              {loadCalendarsError && (
                <p className="text-xs text-danger mb-3">{loadCalendarsError}</p>
              )}

              {calendars.length > 0 && (
                <form action={setActiveCalendarAction} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Elige un calendario
                    </label>
                    <div className="space-y-2">
                      {calendars.map((c) => (
                        <label
                          key={c.id}
                          className="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:border-violet-200 hover:bg-violet-50/40 cursor-pointer transition-colors"
                        >
                          <input
                            type="radio"
                            name="calendarId"
                            value={c.id}
                            defaultChecked={status.calendarId === c.id}
                            className="accent-violet-600"
                          />
                          <span
                            className="w-3 h-3 rounded-full border border-white shadow-sm"
                            style={{ backgroundColor: c.backgroundColor ?? '#7c3aed' }}
                          />
                          <span className="text-sm text-foreground flex-1">{c.summary}</span>
                          {c.primary && (
                            <span className="text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-100 rounded-full px-2 py-0.5">
                              Principal
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                  <input
                    type="hidden"
                    name="calendarName"
                    value={
                      calendars.find((c) => c.id === status.calendarId)?.summary ?? ''
                    }
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
                  >
                    Guardar calendario
                  </button>
                </form>
              )}

              {status.calendarId && (
                <p className="text-xs text-muted-foreground mt-3">
                  Usando:{' '}
                  <span className="text-foreground font-medium">
                    {status.calendarName ?? status.calendarId}
                  </span>
                </p>
              )}
            </section>

            {status.calendarId && (
              <SyncStatusCard studioId={session.studioId} />
            )}
          </>
        )}

        {/* Google Drive — conexión INDEPENDIENTE (puede ser otra cuenta). */}
        <DriveIntegrationCard studioId={session.studioId} />
      </div>
    </>
  )
}

async function DriveIntegrationCard({ studioId }: { studioId: string }) {
  const drive = await getDriveConnectionStatus(studioId)
  return (
    <section className="sf-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
            <HardDriveUpload className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-xl text-foreground mb-0.5">
              Google Drive (entregas)
            </h2>
            <p className="text-xs text-muted-foreground max-w-md">
              Cuenta de Drive donde se suben las galerías de entrega final. Puede ser{' '}
              <strong>distinta</strong> a la de tu Calendar — ideal una con bastante
              almacenamiento.
            </p>
            {drive.connected && (
              <p className="text-sm text-foreground mt-2 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Conectada: <span className="font-medium">{drive.email ?? 'cuenta de Google'}</span>
              </p>
            )}
          </div>
        </div>
        {drive.connected && (
          <form action={disconnectGoogleDriveAction}>
            <button type="submit" className="text-xs font-medium text-danger hover:text-red-800">
              Desconectar
            </button>
          </form>
        )}
      </div>
      {!drive.connected && (
        <form action={connectGoogleDriveAction} className="mt-4">
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
          >
            <Link2 className="h-4 w-4" />
            Conectar Google Drive
          </button>
        </form>
      )}
    </section>
  )
}

async function SyncStatusCard({ studioId }: { studioId: string }) {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('google_events')
    .select('origin')
    .eq('studio_id', studioId)

  type Row = { origin: string }
  const rows = error ? [] : ((data as Row[] | null) ?? [])
  const total = rows.length
  const fromStudioflow = rows.filter(
    (r) => r.origin === 'studioflow' || r.origin === 'synced',
  ).length
  const fromGoogle = rows.filter((r) => r.origin === 'google_calendar').length
  const external = rows.filter((r) => r.origin === 'external').length

  return (
    <section className="sf-card p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="font-display text-xl text-foreground mb-1">
            Sincronización bidireccional
          </h2>
          <p className="text-xs text-muted-foreground">
            Eventos sincronizados desde y hacia tu calendario de Google.
          </p>
        </div>
        <form
          action={async () => {
            'use server'
            await syncGoogleCalendarNowAction()
          }}
        >
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium hover:bg-muted/40 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Sincronizar ahora
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SyncStat label="Total" value={total} className="bg-muted/40" />
        <SyncStat
          label="PixelOS"
          value={fromStudioflow}
          className="bg-violet-50 dark:bg-violet-900/15"
        />
        <SyncStat
          label="Google"
          value={fromGoogle}
          className="bg-emerald-50 dark:bg-emerald-900/15"
        />
        <SyncStat
          label="Personales"
          value={external}
          className="bg-slate-100 dark:bg-slate-900/15"
        />
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        El sync corre automáticamente cuando Google notifica un cambio. Usá
        &quot;Sincronizar ahora&quot; si necesitás forzar un refresh manual.
      </p>
    </section>
  )
}

function SyncStat({
  label,
  value,
  className,
}: {
  label: string
  value: number
  className?: string
}) {
  return (
    <div className={`rounded-lg p-3 ${className ?? ''}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </p>
      <p className="text-2xl font-bold text-foreground tabular-nums mt-1">
        {value}
      </p>
    </div>
  )
}
