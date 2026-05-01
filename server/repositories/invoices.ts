import 'server-only'

import type { Database } from '@/types/supabase'

import { getDb, run, runMaybe, type RepoOptions } from './base'

type InvoiceRow = Database['public']['Tables']['invoices']['Row']
type InvoiceInsert = Database['public']['Tables']['invoices']['Insert']
type InvoiceUpdate = Database['public']['Tables']['invoices']['Update']
type InvoiceItemInsert = Database['public']['Tables']['invoice_items']['Insert']

export type Invoice = InvoiceRow

export const invoicesRepo = {
  async listByProject(projectId: string, opts: RepoOptions = {}): Promise<Invoice[]> {
    const db = getDb(opts)
    return run(
      db
        .from('invoices')
        .select('*')
        .eq('project_id', projectId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
      'invoicesRepo.listByProject',
    )
  },

  async findById(id: string, opts: RepoOptions = {}): Promise<Invoice | null> {
    const db = getDb(opts)
    return runMaybe(
      db.from('invoices').select('*').eq('id', id).is('deleted_at', null).single(),
      'invoicesRepo.findById',
    )
  },

  /**
   * Genera el siguiente número de invoice llamando a la función SQL.
   */
  async nextInvoiceNumber(
    studioId: string,
    prefix?: string,
    opts: RepoOptions = {},
  ): Promise<string> {
    const db = getDb(opts)
    const { data, error } = await db.rpc('next_invoice_number', {
      p_studio_id: studioId,
      p_prefix: prefix ?? undefined,
    })
    if (error) throw new Error(`[invoicesRepo.nextInvoiceNumber] ${error.message}`)
    return data as string
  },

  async create(input: InvoiceInsert, opts: RepoOptions = {}): Promise<Invoice> {
    const db = getDb(opts)
    return run(db.from('invoices').insert(input).select('*').single(), 'invoicesRepo.create')
  },

  async addItems(items: InvoiceItemInsert[], opts: RepoOptions = {}): Promise<void> {
    if (items.length === 0) return
    const db = getDb(opts)
    const { error } = await db.from('invoice_items').insert(items)
    if (error) throw new Error(`[invoicesRepo.addItems] ${error.message}`)
  },

  async update(id: string, input: InvoiceUpdate, opts: RepoOptions = {}): Promise<Invoice> {
    const db = getDb(opts)
    return run(
      db.from('invoices').update(input).eq('id', id).select('*').single(),
      'invoicesRepo.update',
    )
  },

  async findFirstUnpaidForProject(projectId: string, opts: RepoOptions = {}) {
    const db = getDb(opts)
    return runMaybe(
      db
        .from('invoices')
        .select('*')
        .eq('project_id', projectId)
        .in('status', ['draft', 'sent', 'pending', 'partially_paid', 'overdue'])
        .is('deleted_at', null)
        .order('installment_number', { ascending: true, nullsFirst: true })
        .limit(1)
        .maybeSingle(),
      'invoicesRepo.findFirstUnpaidForProject',
    )
  },
}
