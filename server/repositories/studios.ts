import 'server-only'

import type { Database } from '@/types/supabase'

import { getDb, run, runMaybe, type RepoOptions } from './base'

type StudioRow = Database['public']['Tables']['studios']['Row']
type StudioInsert = Database['public']['Tables']['studios']['Insert']
type StudioUpdate = Database['public']['Tables']['studios']['Update']

export type Studio = StudioRow

export const studiosRepo = {
  async findById(id: string, opts: RepoOptions = {}): Promise<Studio | null> {
    const db = getDb(opts)
    return runMaybe(db.from('studios').select('*').eq('id', id).single(), 'studiosRepo.findById')
  },

  async create(input: StudioInsert, opts: RepoOptions = { elevated: true }): Promise<Studio> {
    // Registros nuevos usan service role (RLS requiere platform_admin para INSERT)
    const db = getDb(opts)
    return run(db.from('studios').insert(input).select('*').single(), 'studiosRepo.create')
  },

  async update(id: string, input: StudioUpdate, opts: RepoOptions = {}): Promise<Studio> {
    const db = getDb(opts)
    return run(
      db.from('studios').update(input).eq('id', id).select('*').single(),
      'studiosRepo.update',
    )
  },

  async checkFeature(
    studioId: string,
    featureKey: string,
    opts: RepoOptions = {},
  ): Promise<boolean> {
    const db = getDb(opts)
    const { data, error } = await db.rpc('studio_has_feature', {
      p_studio_id: studioId,
      p_feature_key: featureKey,
    })
    if (error) throw new Error(`[studiosRepo.checkFeature] ${error.message}`)
    return data === true
  },

  async checkWithinLimit(
    studioId: string,
    featureKey: string,
    currentCount: number,
    opts: RepoOptions = {},
  ): Promise<boolean> {
    const db = getDb(opts)
    const { data, error } = await db.rpc('studio_within_limit', {
      p_studio_id: studioId,
      p_feature_key: featureKey,
      p_current_count: currentCount,
    })
    if (error) throw new Error(`[studiosRepo.checkWithinLimit] ${error.message}`)
    return data === true
  },

  async isActive(studioId: string, opts: RepoOptions = {}): Promise<boolean> {
    const db = getDb(opts)
    const { data, error } = await db.rpc('studio_is_active', { p_studio_id: studioId })
    if (error) throw new Error(`[studiosRepo.isActive] ${error.message}`)
    return data === true
  },
}
