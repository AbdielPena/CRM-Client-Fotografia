import 'server-only'

import type { Database } from '@/types/supabase'
import { assertCanTransitionForm } from '@/lib/state-machines/form'

import { getDb, run, runMaybe, type RepoOptions } from './base'

type TemplateRow = Database['public']['Tables']['form_templates']['Row']
type TemplateInsert = Database['public']['Tables']['form_templates']['Insert']
type TemplateUpdate = Database['public']['Tables']['form_templates']['Update']

type ResponseRow = Database['public']['Tables']['form_responses']['Row']
type ResponseInsert = Database['public']['Tables']['form_responses']['Insert']
type ResponseUpdate = Database['public']['Tables']['form_responses']['Update']

type FormStatus = Database['public']['Enums']['form_status']

export type FormTemplate = TemplateRow
export type FormResponse = ResponseRow

export const formTemplatesRepo = {
  async findById(id: string, opts: RepoOptions = {}): Promise<FormTemplate | null> {
    const db = getDb(opts)
    return runMaybe<FormTemplate>(
      db.from('form_templates').select('*').eq('id', id).is('deleted_at', null).maybeSingle(),
      'formTemplatesRepo.findById',
    )
  },

  async listForStudio(studioId: string, opts: RepoOptions = {}): Promise<FormTemplate[]> {
    const db = getDb(opts)
    return run<FormTemplate[]>(
      db
        .from('form_templates')
        .select('*')
        .eq('studio_id', studioId)
        .is('deleted_at', null)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true }),
      'formTemplatesRepo.listForStudio',
    )
  },

  async create(input: TemplateInsert, opts: RepoOptions = {}): Promise<FormTemplate> {
    const db = getDb(opts)
    return run<FormTemplate>(
      db.from('form_templates').insert(input).select('*').single(),
      'formTemplatesRepo.create',
    )
  },

  async update(id: string, input: TemplateUpdate, opts: RepoOptions = {}): Promise<FormTemplate> {
    const db = getDb(opts)
    return run<FormTemplate>(
      db.from('form_templates').update(input).eq('id', id).select('*').single(),
      'formTemplatesRepo.update',
    )
  },

  async softDelete(id: string, opts: RepoOptions = {}): Promise<void> {
    const db = getDb(opts)
    const { error } = await db
      .from('form_templates')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(`[formTemplatesRepo.softDelete] ${error.message}`)
  },
}

export const formResponsesRepo = {
  async findById(id: string, opts: RepoOptions = {}): Promise<FormResponse | null> {
    const db = getDb(opts)
    return runMaybe<FormResponse>(
      db.from('form_responses').select('*').eq('id', id).maybeSingle(),
      'formResponsesRepo.findById',
    )
  },

  async findByAccessToken(token: string, opts: RepoOptions = {}): Promise<FormResponse | null> {
    const db = getDb(opts)
    return runMaybe<FormResponse>(
      db.from('form_responses').select('*').eq('access_token', token).maybeSingle(),
      'formResponsesRepo.findByAccessToken',
    )
  },

  async listByBookingRequest(
    bookingRequestId: string,
    opts: RepoOptions = {},
  ): Promise<FormResponse[]> {
    const db = getDb(opts)
    return run<FormResponse[]>(
      db
        .from('form_responses')
        .select('*')
        .eq('booking_request_id', bookingRequestId)
        .order('created_at', { ascending: true }),
      'formResponsesRepo.listByBookingRequest',
    )
  },

  async create(input: ResponseInsert, opts: RepoOptions = {}): Promise<FormResponse> {
    const db = getDb(opts)
    return run<FormResponse>(
      db.from('form_responses').insert(input).select('*').single(),
      'formResponsesRepo.create',
    )
  },

  async update(id: string, input: ResponseUpdate, opts: RepoOptions = {}): Promise<FormResponse> {
    const db = getDb(opts)
    return run<FormResponse>(
      db.from('form_responses').update(input).eq('id', id).select('*').single(),
      'formResponsesRepo.update',
    )
  },

  async transition(params: {
    id: string
    from: FormStatus
    to: FormStatus
    patch?: Partial<ResponseInsert>
    opts?: RepoOptions
  }): Promise<FormResponse> {
    const { id, from, to, patch, opts = {} } = params

    assertCanTransitionForm(from, to, 'formResponsesRepo.transition')

    const db = getDb(opts)
    const result = await runMaybe<FormResponse>(
      db
        .from('form_responses')
        .update({
          status: to,
          updated_at: new Date().toISOString(),
          ...(patch ?? {}),
        })
        .eq('id', id)
        .eq('status', from)
        .select('*')
        .single(),
      'formResponsesRepo.transition',
    )
    if (!result) {
      throw new Error(
        `[formResponsesRepo.transition] conflicto: el form ${id} ya no está en "${from}". Recarga la página.`,
      )
    }
    return result
  },
}
