import 'server-only'

import type { Database } from '@/types/supabase'
import { assertCanTransitionContract } from '@/lib/state-machines/contract'

import { getDb, run, runMaybe, type RepoOptions } from './base'

type ContractRow = Database['public']['Tables']['contracts']['Row']
type ContractInsert = Database['public']['Tables']['contracts']['Insert']
type ContractUpdate = Database['public']['Tables']['contracts']['Update']
type ContractStatus = Database['public']['Enums']['contract_status']

export type Contract = ContractRow

export const contractsRepo = {
  async findById(id: string, opts: RepoOptions = {}): Promise<Contract | null> {
    const db = getDb(opts)
    return runMaybe<Contract>(
      db.from('contracts').select('*').eq('id', id).is('deleted_at', null).single(),
      'contractsRepo.findById',
    )
  },

  async findBySigningToken(token: string, opts: RepoOptions = {}): Promise<Contract | null> {
    const db = getDb(opts)
    return runMaybe<Contract>(
      db
        .from('contracts')
        .select('*')
        .eq('signing_token', token)
        .is('deleted_at', null)
        .maybeSingle(),
      'contractsRepo.findBySigningToken',
    )
  },

  async listByProject(projectId: string, opts: RepoOptions = {}): Promise<Contract[]> {
    const db = getDb(opts)
    return run<Contract[]>(
      db
        .from('contracts')
        .select('*')
        .eq('project_id', projectId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      'contractsRepo.listByProject',
    )
  },

  async create(input: ContractInsert, opts: RepoOptions = {}): Promise<Contract> {
    const db = getDb(opts)
    return run<Contract>(
      db.from('contracts').insert(input).select('*').single(),
      'contractsRepo.create',
    )
  },

  async update(id: string, input: ContractUpdate, opts: RepoOptions = {}): Promise<Contract> {
    const db = getDb(opts)
    return run<Contract>(
      db.from('contracts').update(input).eq('id', id).select('*').single(),
      'contractsRepo.update',
    )
  },

  async transition(params: {
    id: string
    from: ContractStatus
    to: ContractStatus
    patch?: Partial<ContractInsert>
    opts?: RepoOptions
  }): Promise<Contract> {
    const { id, from, to, patch, opts = {} } = params

    // Validación en TS (fast-fail). El trigger DB es defense-in-depth.
    assertCanTransitionContract(from, to, 'contractsRepo.transition')

    const db = getDb(opts)
    const result = await runMaybe<Contract>(
      db
        .from('contracts')
        .update({
          status: to,
          updated_at: new Date().toISOString(),
          ...(patch ?? {}),
        })
        .eq('id', id)
        .eq('status', from)
        .select('*')
        .single(),
      'contractsRepo.transition',
    )
    if (!result) {
      // Optimistic-lock fail: otro proceso cambió el status entre nuestro
      // read y el update. Mensaje que la UI pueda mapear a "recarga".
      throw new Error(
        `[contractsRepo.transition] conflicto: el contrato ${id} ya no está en "${from}". Recarga la página.`,
      )
    }
    return result
  },
}
