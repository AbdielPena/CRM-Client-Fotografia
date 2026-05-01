import 'server-only'

import type { Database } from '@/types/supabase'

import { getDb, run, runMaybe, type RepoOptions } from './base'

type ProjectRow = Database['public']['Tables']['projects']['Row']
type ProjectInsert = Database['public']['Tables']['projects']['Insert']
type ProjectUpdate = Database['public']['Tables']['projects']['Update']

export type Project = ProjectRow

export const projectsRepo = {
  async list(studioId: string, opts: RepoOptions = {}) {
    const db = getDb(opts)
    return run(
      db
        .from('projects')
        .select('*')
        .eq('studio_id', studioId)
        .is('deleted_at', null)
        .order('event_date', { ascending: true, nullsFirst: false }),
      'projectsRepo.list',
    )
  },

  async findById(id: string, opts: RepoOptions = {}): Promise<Project | null> {
    const db = getDb(opts)
    return runMaybe(
      db.from('projects').select('*').eq('id', id).is('deleted_at', null).single(),
      'projectsRepo.findById',
    )
  },

  async create(input: ProjectInsert, opts: RepoOptions = {}): Promise<Project> {
    const db = getDb(opts)
    return run(db.from('projects').insert(input).select('*').single(), 'projectsRepo.create')
  },

  async update(id: string, input: ProjectUpdate, opts: RepoOptions = {}): Promise<Project> {
    const db = getDb(opts)
    return run(
      db.from('projects').update(input).eq('id', id).select('*').single(),
      'projectsRepo.update',
    )
  },
}
