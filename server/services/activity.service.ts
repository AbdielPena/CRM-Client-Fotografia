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

/** Una línea del historial, ya lista para pintar en el dashboard. */
export interface RecentActivityItem {
  id: string
  action: string
  description: string | null
  actorName: string | null
  actorType: string | null
  entityType: string | null
  entityId: string | null
  createdAt: string
  /** A dónde lleva el clic (null si esa entidad no tiene pantalla propia). */
  href: string | null
}

/** Ruta de la pantalla de cada tipo de entidad (para poder abrirla del historial). */
const ENTITY_HREF: Record<string, (id: string) => string> = {
  project: (id) => `/projects/${id}`,
  client: (id) => `/clients/${id}`,
  invoice: (id) => `/invoices/${id}`,
  contract: (id) => `/contracts/${id}`,
  gallery: (id) => `/galleries/${id}`,
  booking_request: (id) => `/bookings/${id}`,
  lead: (id) => `/leads/${id}`,
}

/**
 * Últimos movimientos del estudio, sin filtrar por entidad: es el "Registros
 * recientes" del dashboard — qué pasó hoy, en orden, con enlace a cada cosa.
 */
export async function getRecentActivity(
  studioId: string,
  limit = 12,
): Promise<RecentActivityItem[]> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('activity_log')
    .select(
      'id, action, entity_type, entity_id, actor_type, actor_name, description, created_at',
    )
    .eq('studio_id', studioId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[getRecentActivity]', error.message)
    return []
  }

  return ((data ?? []) as Array<{
    id: string
    action: string
    entity_type: string | null
    entity_id: string | null
    actor_type: string | null
    actor_name: string | null
    description: string | null
    created_at: string
  }>).map((r) => ({
    id: r.id,
    action: r.action,
    description: r.description,
    actorName: r.actor_name,
    actorType: r.actor_type,
    entityType: r.entity_type,
    entityId: r.entity_id,
    createdAt: r.created_at,
    href:
      r.entity_type && r.entity_id && ENTITY_HREF[r.entity_type]
        ? ENTITY_HREF[r.entity_type](r.entity_id)
        : null,
  }))
}
