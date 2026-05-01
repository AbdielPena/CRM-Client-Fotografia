import 'server-only'

import type { Database } from '@/types/supabase'

import { getDb, run, runMaybe, type RepoOptions } from './base'

type Row = Database['public']['Tables']['contract_templates']['Row']
type Insert = Database['public']['Tables']['contract_templates']['Insert']
type Update = Database['public']['Tables']['contract_templates']['Update']

export type ContractTemplate = Row

export const contractTemplatesRepo = {
  async findById(id: string, opts: RepoOptions = {}): Promise<ContractTemplate | null> {
    const db = getDb(opts)
    return runMaybe<ContractTemplate>(
      db
        .from('contract_templates')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle(),
      'contractTemplatesRepo.findById',
    )
  },

  async listForStudio(studioId: string, opts: RepoOptions = {}): Promise<ContractTemplate[]> {
    const db = getDb(opts)
    return run<ContractTemplate[]>(
      db
        .from('contract_templates')
        .select('*')
        .eq('studio_id', studioId)
        .is('deleted_at', null)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true }),
      'contractTemplatesRepo.listForStudio',
    )
  },

  async create(input: Insert, opts: RepoOptions = {}): Promise<ContractTemplate> {
    const db = getDb(opts)
    return run<ContractTemplate>(
      db.from('contract_templates').insert(input).select('*').single(),
      'contractTemplatesRepo.create',
    )
  },

  async update(
    id: string,
    input: Update,
    opts: RepoOptions = {},
  ): Promise<ContractTemplate> {
    const db = getDb(opts)
    return run<ContractTemplate>(
      db.from('contract_templates').update(input).eq('id', id).select('*').single(),
      'contractTemplatesRepo.update',
    )
  },

  async softDelete(id: string, opts: RepoOptions = {}): Promise<void> {
    const db = getDb(opts)
    const { error } = await db
      .from('contract_templates')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(`[contractTemplatesRepo.softDelete] ${error.message}`)
  },

  async clearDefault(
    studioId: string,
    exceptId: string | null,
    opts: RepoOptions = {},
  ): Promise<void> {
    const db = getDb(opts)
    let query = db
      .from('contract_templates')
      .update({ is_default: false })
      .eq('studio_id', studioId)
      .is('deleted_at', null)
    if (exceptId) query = query.neq('id', exceptId)
    const { error } = await query
    if (error) throw new Error(`[contractTemplatesRepo.clearDefault] ${error.message}`)
  },
}
