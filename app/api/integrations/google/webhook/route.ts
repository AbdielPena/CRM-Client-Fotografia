import { NextResponse, type NextRequest } from 'next/server'

import { createSupabaseServiceClient } from '@/server/supabase/service'
import { pullIncrementalChanges } from '@/server/services/google-calendar.service'

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

  // Nota: casts a `any` porque `google_calendar_watches` y las columnas
  // `google_event_id/google_calendar_id/google_synced_at` aún no están en
  // los types generados de Supabase. Regenerar types para removerlos.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createSupabaseServiceClient() as any
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
    const { events } = await pullIncrementalChanges(watch.studio_id)
    // Por cada evento cancelado (status='cancelled'), limpiar sync en el proyecto
    for (const ev of events) {
      if (ev.status === 'cancelled' && ev.id) {
        await supabase
          .from('projects')
          .update({
            google_event_id: null,
            google_calendar_id: null,
            google_synced_at: null,
          })
          .eq('studio_id', watch.studio_id)
          .eq('google_event_id', ev.id)
      }
      // TODO: aplicar cambios de fecha/hora desde Google → proyecto.
      // Necesita mapping via google_event_id. En esta iteración solo tracked.
    }
  } catch (e) {
    // Logeamos pero respondemos 200 para que Google no reintente indefinidamente
    console.error('Google webhook error:', e)
  }

  return new NextResponse(null, { status: 200 })
}
