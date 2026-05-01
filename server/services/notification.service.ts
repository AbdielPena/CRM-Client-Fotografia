import 'server-only'

import { createSupabaseServerClient } from '@/server/supabase/server'
import { createSupabaseServiceClient } from '@/server/supabase/service'
import type { Database } from '@/types/supabase'

type NotificationInsert = Database['public']['Tables']['notifications']['Insert']
type NotificationRow = Database['public']['Tables']['notifications']['Row']
export type NotificationType = Database['public']['Enums']['notification_type']
export type StudioRole = Database['public']['Enums']['studio_role']

export type NotifyInput = {
  studioId: string
  type: NotificationType
  title: string
  body?: string | null
  actionUrl?: string | null
  /** Si se pasa, la notificación es para ese usuario específico. */
  recipientUserId?: string | null
  /**
   * Alternativa: notificar a todos los usuarios con este rol.
   * Si tanto recipientUserId como recipientRole son null,
   * la notificación queda visible para todos los roles del studio.
   */
  recipientRole?: StudioRole | null
  relatedEntityType?: string | null
  relatedEntityId?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Encola una notificación in-app. Usa service-role porque:
 *  - Puede invocarse desde contextos públicos (submit de form anon).
 *  - Simplifica: no dependemos de que el invoker tenga INSERT sobre
 *    notifications, que depende de auth_studio_id().
 *
 * Nunca lanza: las notificaciones son best-effort y no deben tumbar flujos.
 */
export async function notify(input: NotifyInput): Promise<string | null> {
  try {
    const supabase = createSupabaseServiceClient()
    const row: NotificationInsert = {
      studio_id: input.studioId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      action_url: input.actionUrl ?? null,
      recipient_user_id: input.recipientUserId ?? null,
      recipient_role: input.recipientRole ?? null,
      related_entity_type: input.relatedEntityType ?? null,
      related_entity_id: input.relatedEntityId ?? null,
      metadata: (input.metadata ?? {}) as NotificationInsert['metadata'],
    }
    const { data, error } = await supabase
      .from('notifications')
      .insert(row)
      .select('id')
      .single()
    if (error) {
      console.error('[notify] insert failed', error.message, { type: input.type })
      return null
    }
    return (data as { id: string }).id
  } catch (err) {
    console.error('[notify] unexpected error', err)
    return null
  }
}

// ──────────────────────────────────────────────────────────────────────
// Lectura — respeta RLS (SSR client con JWT del usuario)
// ──────────────────────────────────────────────────────────────────────

export type NotificationListItem = NotificationRow

export async function listNotifications(
  studioId: string,
  opts: { onlyUnread?: boolean; limit?: number } = {},
): Promise<NotificationListItem[]> {
  const supabase = createSupabaseServerClient()
  let q = supabase
    .from('notifications')
    .select('*')
    .eq('studio_id', studioId)
    .order('created_at', { ascending: false })

  if (opts.onlyUnread) q = q.eq('is_read', false)
  q = q.limit(opts.limit ?? 50)

  const { data, error } = await q
  if (error) {
    console.error('[listNotifications]', error.message)
    return []
  }
  return (data ?? []) as NotificationListItem[]
}

export async function countUnreadNotifications(
  studioId: string,
): Promise<number> {
  const supabase = createSupabaseServerClient()
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('studio_id', studioId)
    .eq('is_read', false)

  if (error) {
    console.error('[countUnreadNotifications]', error.message)
    return 0
  }
  return count ?? 0
}

/**
 * Marca una notificación como leída. Solo el recipient (o platform admin)
 * puede actualizarla según la policy notifications_update.
 */
export async function markNotificationAsRead(
  notificationId: string,
): Promise<void> {
  const supabase = createSupabaseServerClient()
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId)
  if (error) console.error('[markNotificationAsRead]', error.message)
}

/**
 * Marca como leídas todas las notificaciones visibles al usuario actual.
 * La policy UPDATE solo permite filas con recipient_user_id = auth.uid(),
 * por lo que las de rol genérico no se marcan individualmente — usamos un
 * bulk update sobre las del usuario actual.
 */
export async function markAllNotificationsAsRead(studioId: string): Promise<void> {
  const supabase = createSupabaseServerClient()
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('studio_id', studioId)
    .eq('is_read', false)
  if (error) console.error('[markAllNotificationsAsRead]', error.message)
}
