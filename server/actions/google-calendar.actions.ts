'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createHmac } from 'crypto'

import { requireRole } from '@/server/middleware/auth'
import {
  getAuthorizeUrl,
  setActiveCalendar,
  disconnectGoogleCalendar,
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
  revalidatePath('/settings/integrations/google')
}
