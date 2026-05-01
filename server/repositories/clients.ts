import 'server-only'

import type { Database } from '@/types/supabase'

import { getDb, run, runMaybe, type RepoOptions } from './base'

type ClientRow = Database['public']['Tables']['clients']['Row']
type ClientInsert = Database['public']['Tables']['clients']['Insert']
type ClientUpdate = Database['public']['Tables']['clients']['Update']

export type Client = ClientRow

export interface ListClientsFilters {
  search?: string
  tagId?: string
  limit?: number
  offset?: number
}

/**
 * Repositorio de clientes. Todas las operaciones van por RLS:
 * el studio_id se infiere del JWT del usuario autenticado.
 */
export const clientsRepo = {
  async list(studioId: string, filters: ListClientsFilters = {}, opts: RepoOptions = {}) {
    const db = getDb(opts)
    let q = db
      .from('clients')
      .select('*')
      .eq('studio_id', studioId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (filters.search) {
      const s = `%${filters.search}%`
      q = q.or(`name.ilike.${s},email.ilike.${s},phone.ilike.${s}`)
    }
    if (filters.limit) q = q.limit(filters.limit)
    if (filters.offset) q = q.range(filters.offset, filters.offset + (filters.limit ?? 50) - 1)

    return run(q, 'clientsRepo.list')
  },

  async findById(id: string, opts: RepoOptions = {}): Promise<Client | null> {
    const db = getDb(opts)
    return runMaybe(
      db.from('clients').select('*').eq('id', id).is('deleted_at', null).single(),
      'clientsRepo.findById',
    )
  },

  async findByEmail(studioId: string, email: string, opts: RepoOptions = {}): Promise<Client | null> {
    const db = getDb(opts)
    return runMaybe(
      db
        .from('clients')
        .select('*')
        .eq('studio_id', studioId)
        .eq('email', email)
        .is('deleted_at', null)
        .maybeSingle(),
      'clientsRepo.findByEmail',
    )
  },

  async create(input: ClientInsert, opts: RepoOptions = {}): Promise<Client> {
    const db = getDb(opts)
    return run(db.from('clients').insert(input).select('*').single(), 'clientsRepo.create')
  },

  async update(id: string, input: ClientUpdate, opts: RepoOptions = {}): Promise<Client> {
    const db = getDb(opts)
    return run(
      db.from('clients').update(input).eq('id', id).select('*').single(),
      'clientsRepo.update',
    )
  },

  async softDelete(id: string, opts: RepoOptions = {}): Promise<void> {
    const db = getDb(opts)
    await run(
      db
        .from('clients')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')
        .single(),
      'clientsRepo.softDelete',
    )
  },

  async countActive(studioId: string, opts: RepoOptions = {}): Promise<number> {
    const db = getDb(opts)
    const { count, error } = await db
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('studio_id', studioId)
      .is('deleted_at', null)
    if (error) throw new Error(`[clientsRepo.countActive] ${error.message}`)
    return count ?? 0
  },
}
