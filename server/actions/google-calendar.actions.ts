'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createHmac } from 'crypto'

import { requireRole, requireStudioAuth } from '@/server/middleware/auth'
import {
  getAuthorizeUrl,
  setActiveCalendar,
  disconnectGoogleCalendar,
  importGoogleEvents,
  backfillProjectsToGoogle,
  linkCalendarEventToEntity,
  registerCalendarWatch,
} from '@/server/services/google-calendar.service'

function signState(studioId: string): string {
  const secret = process.env.OAUTH_STATE_SECRET
  if (!secret) {
    throw new Error('OAUTH_STATE_SECRET no configurado')
  }
  const payload = Buffer.from(studioId, 'utf8').toString('base64')
  const signature = createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${signature}`
}

/**
 * Inicia flow OAuth. Firma studioId en el state y redirige a Google.
 * Si falta configuración del servidor (credenciales OAuth o secret de firma),
 * redirige de vuelta a settings con un mensaje claro en lugar de reventar la
 * página con un 500.
 */
export async function connectGoogleCalendarAction() {
  const session = await requireRole('admin')

  const missing: string[] = []
  if (!process.env.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID')
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET')
  if (!process.env.OAUTH_STATE_SECRET) missing.push('OAUTH_STATE_SECRET')
  if (missing.length > 0) {
    const msg = encodeURIComponent(
      `Google Calendar aún no está configurado en el servidor (falta: ${missing.join(', ')}). ` +
        `Configura las credenciales OAuth de Google para habilitarlo.`,
    )
    redirect(`/settings/integrations/google?error=${msg}`)
  }

  const state = signState(session.studioId)
  const url = getAuthorizeUrl(state)
  redirect(url)
}

export async function disconnectGoogleCalendarAction() {
  const session = await requireRole('admin')
  await disconnectGoogleCalendar(session.studioId)
  revalidatePath('/settings/integrations/google')
}

export async function setActiveCalendarAction(formData: FormData) {
  const session = await requireRole('admin')
  const calendarId = String(formData.get('calendarId') ?? '').trim()
  const calendarName = String(formData.get('calendarName') ?? '').trim()
  if (!calendarId) throw new Error('calendarId requerido')

  await setActiveCalendar(session.studioId, calendarId, calendarName || calendarId)

  // Al elegir calendario activo, hacemos un import inicial automático para
  // que el usuario vea sus eventos existentes ya en /calendar.
  await importGoogleEvents(session.studioId, { fullSync: true }).catch((err) => {
    console.error('[setActiveCalendar] initial import failed', err)
  })

  // BACKFILL: empujar a Google las sesiones FUTURAS que se crearon mientras
  // Google estaba desconectado (reservas recibidas sin vínculo). Best-effort.
  await backfillProjectsToGoogle(session.studioId).catch((err) => {
    console.error('[setActiveCalendar] backfill to Google failed', err)
  })

  // Registrar watch para que Google nos notifique cambios (push notifications
  // bidireccionales). Best-effort: si NEXT_PUBLIC_APP_URL es localhost,
  // Google rechazará el HTTPS requerido — no rompe el flow.
  await registerCalendarWatch(session.studioId).catch((err) => {
    console.error('[setActiveCalendar] watch registration failed', err)
  })

  revalidatePath('/settings/integrations/google')
  revalidatePath('/calendar')
}

/**
 * Re-registra el watch del calendario (útil si el watch expiró y el cron
 * de renovación no corrió aún, o para forzar restart después de error).
 */
export async function registerWatchAction() {
  const session = await requireRole('admin')
  const result = await registerCalendarWatch(session.studioId)
  revalidatePath('/settings/integrations/google')
  return result
}

/**
 * Manual sync: recompute google_events desde Google.
 * Útil si el usuario sospecha que hay desync (ej. cambió cosas offline).
 */
export async function syncGoogleCalendarNowAction() {
  const session = await requireRole('admin')
  const result = await importGoogleEvents(session.studioId, { fullSync: false })
  revalidatePath('/calendar')
  revalidatePath('/dashboard')
  return result
}

/**
 * Vincula un evento de Google al cliente/proyecto/contrato/etc. Esto es lo
 * que cubre el caso "evento personal de Google que ahora quiero asociar
 * a un cliente concreto".
 */
export async function linkCalendarEventAction(input: {
  eventId: string
  projectId?: string | null
  clientId?: string | null
  bookingRequestId?: string | null
  contractId?: string | null
  invoiceId?: string | null
  galleryId?: string | null
  deliveryId?: string | null
}) {
  const session = await requireStudioAuth()
  await linkCalendarEventToEntity(session.studioId, input.eventId, input)
  revalidatePath('/calendar')
}
