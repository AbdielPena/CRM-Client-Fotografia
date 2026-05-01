import 'server-only'

import type { Database } from '@/types/supabase'

import { getDb, run, runMaybe, type RepoOptions } from './base'

type IntegrationRow = Database['public']['Tables']['studio_integrations']['Row']
type IntegrationInsert = Database['public']['Tables']['studio_integrations']['Insert']
type IntegrationService = Database['public']['Enums']['integration_service']

export type StudioIntegration = IntegrationRow

/**
 * Repositorio de integraciones externas del studio (Resend, Google Calendar,
 * dominios custom, pasarelas de pago). La idea: toda lógica que antes leía
 * `process.env.RESEND_API_KEY` ahora debe consultar este repositorio.
 */
export const integrationsRepo = {
  async list(studioId: string, opts: RepoOptions = {}): Promise<StudioIntegration[]> {
    const db = getDb(opts)
    return run(
      db
        .from('studio_integrations')
        .select('*')
        .eq('studio_id', studioId)
        .order('service', { ascending: true }),
      'integrationsRepo.list',
    )
  },

  async get(
    studioId: string,
    service: IntegrationService,
    opts: RepoOptions = {},
  ): Promise<StudioIntegration | null> {
    const db = getDb(opts)
    return runMaybe(
      db
        .from('studio_integrations')
        .select('*')
        .eq('studio_id', studioId)
        .eq('service', service)
        .maybeSingle(),
      'integrationsRepo.get',
    )
  },

  async isEnabled(
    studioId: string,
    service: IntegrationService,
    opts: RepoOptions = {},
  ): Promise<boolean> {
    const row = await this.get(studioId, service, opts)
    return !!row && row.is_enabled
  },

  async upsert(input: IntegrationInsert, opts: RepoOptions = {}): Promise<StudioIntegration> {
    const db = getDb(opts)
    return run(
      db
        .from('studio_integrations')
        .upsert(input, { onConflict: 'studio_id,service' })
        .select('*')
        .single(),
      'integrationsRepo.upsert',
    )
  },

  async markVerified(
    studioId: string,
    service: IntegrationService,
    verifiedBy: string,
    opts: RepoOptions = {},
  ): Promise<void> {
    const db = getDb(opts)
    const { error } = await db
      .from('studio_integrations')
      .update({
        is_enabled: true,
        last_verified_at: new Date().toISOString(),
        last_verified_by: verifiedBy,
        last_error: null,
        last_error_at: null,
      })
      .eq('studio_id', studioId)
      .eq('service', service)
    if (error) throw new Error(`[integrationsRepo.markVerified] ${error.message}`)
  },

  async markError(
    studioId: string,
    service: IntegrationService,
    message: string,
    opts: RepoOptions = {},
  ): Promise<void> {
    const db = getDb(opts)
    const { error } = await db
      .from('studio_integrations')
      .update({
        is_enabled: false,
        last_error: message,
        last_error_at: new Date().toISOString(),
      })
      .eq('studio_id', studioId)
      .eq('service', service)
    if (error) throw new Error(`[integrationsRepo.markError] ${error.message}`)
  },
}
