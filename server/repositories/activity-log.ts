import 'server-only'

import type { Database } from '@/types/supabase'

import { getDb, type RepoOptions } from './base'

type ActivityInsert = Database['public']['Tables']['activity_log']['Insert']
type ActorType = Database['public']['Enums']['actor_type']

export interface LogActivityInput {
  studioId: string
  action: string
  entityType: string
  entityId?: string
  actorType?: ActorType
  actorUserId?: string
  actorEmail?: string
  actorName?: string
  description?: string
  beforeState?: Record<string, unknown>
  afterState?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export const activityLogRepo = {
  async log(input: LogActivityInput, opts: RepoOptions = {}): Promise<void> {
    const db = getDb(opts)
    // El tipo `Json` de supabase-js no acepta `Record<string, unknown>` directamente
    // (record vs indexed type), así que casteamos los payloads JSONB.
    const payload: ActivityInsert = {
      studio_id: input.studioId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId,
      actor_type: input.actorType ?? (input.actorUserId ? 'user' : 'system'),
      actor_user_id: input.actorUserId,
      actor_email: input.actorEmail,
      actor_name: input.actorName,
      description: input.description,
      before_state: (input.beforeState ?? null) as ActivityInsert['before_state'],
      after_state: (input.afterState ?? null) as ActivityInsert['after_state'],
      metadata: (input.metadata ?? {}) as ActivityInsert['metadata'],
    }
    const { error } = await db.from('activity_log').insert(payload)
    // no lanzamos — audit log es best-effort, no debe tumbar flujos principales
    if (error) console.error('[activityLogRepo.log]', error.message, input)
  },

  async listForStudio(studioId: string, limit = 50, opts: RepoOptions = {}) {
    const db = getDb(opts)
    const { data, error } = await db
      .from('activity_log')
      .select('*')
      .eq('studio_id', studioId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(`[activityLogRepo.listForStudio] ${error.message}`)
    return data ?? []
  },

  async listForEntity(entityType: string, entityId: string, opts: RepoOptions = {}) {
    const db = getDb(opts)
    const { data, error } = await db
      .from('activity_log')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: true })
    if (error) throw new Error(`[activityLogRepo.listForEntity] ${error.message}`)
    return data ?? []
  },
}
