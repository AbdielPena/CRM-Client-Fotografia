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
  linkCalendarEventToEntity,
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
 */
export async function connectGoogleCalendarAction() {
  const session = await requireRole('admin')
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

  revalidatePath('/settings/integrations/google')
  revalidatePath('/calendar')
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
