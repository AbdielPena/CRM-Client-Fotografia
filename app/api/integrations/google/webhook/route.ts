import { NextResponse, type NextRequest } from 'next/server'

import { createSupabaseServiceClient } from '@/server/supabase/service'
import {
  pullIncrementalChanges,
  importGoogleEvents,
} from '@/server/services/google-calendar.service'
import type { Database } from '@/types/supabase'

type ProjectsUpdate = Database['public']['Tables']['projects']['Update']

/**
 * Webhook endpoint para Google Calendar push notifications.
 *
 * Google envía headers:
 *   x-goog-channel-id     — id del watch que creamos
 *   x-goog-resource-state — 'sync' | 'exists' | 'not_exists'
 *   x-goog-resource-id    — id del recurso (calendario)
 *
 * La primera notificación es 'sync' (handshake), las siguientes 'exists'.
 * Usamos channel_id para resolver studio_id y traer cambios incrementales.
 */
export async function POST(req: NextRequest) {
  const channelId = req.headers.get('x-goog-channel-id')
  const resourceState = req.headers.get('x-goog-resource-state')

  if (!channelId) {
    return NextResponse.json({ error: 'missing channel id' }, { status: 400 })
  }

  // Handshake inicial: solo ACK
  if (resourceState === 'sync') {
    return new NextResponse(null, { status: 200 })
  }

  const supabase = createSupabaseServiceClient()
  const { data: watch } = await supabase
    .from('google_calendar_watches')
    .select('studio_id, calendar_id')
    .eq('channel_id', channelId)
    .maybeSingle()

  if (!watch) {
    // Canal desconocido (probablemente expirado y olvidado)
    return new NextResponse(null, { status: 200 })
  }

  try {
    // 1) Espejo COMPLETO en google_events (incluye personales/externos)
    await importGoogleEvents(watch.studio_id).catch((err) => {
      console.error('[google webhook] importGoogleEvents failed', err)
    })

    // 2) Sincronización con `projects` (eventos creados desde PixelOS)
    const { events } = await pullIncrementalChanges(watch.studio_id)

    for (const ev of events) {
      if (!ev.id) continue

      // Cancelado → limpiar sync del proyecto
      if (ev.status === 'cancelled') {
        await supabase
          .from('projects')
          .update({
            google_event_id: null,
            google_calendar_id: null,
            google_synced_at: null,
          })
          .eq('studio_id', watch.studio_id)
          .eq('google_event_id', ev.id)
        continue
      }

      // Modificado → política last-write-wins basada en timestamps:
      // si Google.updated > project.google_synced_at, aplicamos los cambios.
      // Esto evita un loop infinito donde nuestro propio sync dispara
      // un push notification y reescribimos los mismos datos.
      const { data: project } = await supabase
        .from('projects')
        .select('id, event_date, location, google_synced_at')
        .eq('studio_id', watch.studio_id)
        .eq('google_event_id', ev.id)
        .maybeSingle()

      if (!project) continue

      const evWithUpdated = ev as { updated?: string }
      const googleUpdatedAt = evWithUpdated.updated
        ? new Date(evWithUpdated.updated).getTime()
        : 0
      const lastSyncedAt = project.google_synced_at
        ? new Date(project.google_synced_at).getTime()
        : 0

      // Margen de 2s para absorber latencia entre nuestro PATCH y el push
      if (googleUpdatedAt <= lastSyncedAt + 2000) continue

      // Extraer fecha (all-day) o dateTime
      const newDate: string | null =
        ev.start?.date ?? // all-day: YYYY-MM-DD
        (ev.start?.dateTime
          ? String(ev.start.dateTime).slice(0, 10)
          : null)

      const newLocation: string | null =
        typeof ev.location === 'string' ? ev.location : null

      const patch: ProjectsUpdate = {
        google_synced_at: new Date().toISOString(),
        google_sync_error: null,
      }
      if (newDate && newDate !== project.event_date) patch.event_date = newDate
      if (newLocation !== null && newLocation !== project.location) {
        patch.location = newLocation
      }

      await supabase.from('projects').update(patch).eq('id', project.id)
    }
  } catch (e) {
    // Loggeamos pero respondemos 200 para que Google no reintente indefinidamente
    console.error('Google webhook error:', e)
  }

  return new NextResponse(null, { status: 200 })
}
