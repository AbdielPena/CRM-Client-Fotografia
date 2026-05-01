import 'server-only'

import { activityLogRepo } from '@/server/repositories'
import { createSupabaseServerClient } from '@/server/supabase/server'

export type ActorType = 'user' | 'system' | 'client'

export type LogActivityParams = {
  studioId: string
  action: string
  entityType: string
  entityId?: string
  actorId?: string | null
  actorType?: ActorType
  actorEmail?: string | null
  actorName?: string | null
  description?: string | null
  beforeState?: Record<string, unknown> | null
  afterState?: Record<string, unknown> | null
  metadata?: Record<string, unknown>
  /**
   * Cuando la acción ocurre desde un contexto público (anon), el invoker no
   * tiene INSERT sobre activity_log. Pasa true para usar service-role.
   */
  elevated?: boolean
}

/**
 * Registra un evento de auditoría. Nunca lanza — el audit log es
 * best-effort, no debe tumbar el flujo de negocio.
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await activityLogRepo.log(
      {
        studioId: params.studioId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        actorType:
          params.actorType ?? (params.actorId ? 'user' : 'system'),
        actorUserId: params.actorId ?? undefined,
        actorEmail: params.actorEmail ?? undefined,
        actorName: params.actorName ?? undefined,
        description: params.description ?? undefined,
        beforeState: params.beforeState ?? undefined,
        afterState: params.afterState ?? undefined,
        metadata: params.metadata ?? {},
      },
      { elevated: params.elevated ?? false },
    )
  } catch (err) {
    console.error('[logActivity] unexpected error', err)
  }
}

/**
 * Timeline de actividad para una entidad específica (orden cronológico asc).
 */
export async function getEntityActivity(
  studioId: string,
  entityType: string,
  entityId: string,
  limit = 50,
) {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('activity_log')
    .select(
      'id, action, entity_type, entity_id, actor_type, actor_user_id, actor_email, actor_name, description, metadata, created_at',
    )
    .eq('studio_id', studioId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[getEntityActivity]', error.message)
    return []
  }
  return data ?? []
}
