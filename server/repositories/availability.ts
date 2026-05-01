import 'server-only'

import type { Database } from '@/types/supabase'

import { getDb, run, runMaybe, type RepoOptions } from './base'

type RuleRow = Database['public']['Tables']['availability_rules']['Row']
type RuleInsert = Database['public']['Tables']['availability_rules']['Insert']
type BlockRow = Database['public']['Tables']['availability_blocks']['Row']
type BlockInsert = Database['public']['Tables']['availability_blocks']['Insert']

export type AvailabilityRule = RuleRow
export type AvailabilityBlock = BlockRow

/**
 * Convención de tipos (sin check constraints en DB, libres en backend):
 *
 * rule_type:
 *   - 'weekly_open'       → day_of_week + start_time + end_time. Ventana abierta recurrente.
 *   - 'weekly_closed'     → day_of_week. Día completo cerrado (override, p.ej. domingos).
 *   - 'date_closed'       → start_date [+ end_date]. Vacaciones.
 *   - 'date_open_override'→ start_date + start_time + end_time. Apertura excepcional.
 *
 * block_type:
 *   - 'booking'           → generado por un booking aprobado/confirmado/scheduled.
 *   - 'manual'            → bloqueo manual del operador.
 *   - 'google'            → importado de Google Calendar.
 *   - 'personal'          → tiempo personal del fotógrafo.
 */

export const availabilityRepo = {
  // ── Rules ─────────────────────────────────────────────────────────
  async listRules(
    studioId: string,
    opts: RepoOptions = {},
  ): Promise<AvailabilityRule[]> {
    const db = getDb(opts)
    return run<AvailabilityRule[]>(
      db
        .from('availability_rules')
        .select('*')
        .eq('studio_id', studioId)
        .eq('is_active', true)
        .order('rule_type', { ascending: true })
        .order('day_of_week', { ascending: true }),
      'availabilityRepo.listRules',
    )
  },

  async upsertRule(
    input: RuleInsert,
    opts: RepoOptions = {},
  ): Promise<AvailabilityRule> {
    const db = getDb(opts)
    return run<AvailabilityRule>(
      db.from('availability_rules').insert(input).select('*').single(),
      'availabilityRepo.upsertRule',
    )
  },

  async deactivateRule(id: string, opts: RepoOptions = {}): Promise<void> {
    const db = getDb(opts)
    const { error } = await db
      .from('availability_rules')
      .update({ is_active: false })
      .eq('id', id)
    if (error) throw new Error(`[availabilityRepo.deactivateRule] ${error.message}`)
  },

  async deleteRule(id: string, opts: RepoOptions = {}): Promise<void> {
    const db = getDb(opts)
    const { error } = await db.from('availability_rules').delete().eq('id', id)
    if (error) throw new Error(`[availabilityRepo.deleteRule] ${error.message}`)
  },

  // ── Blocks ────────────────────────────────────────────────────────
  async listBlocksInRange(
    studioId: string,
    fromIso: string,
    toIso: string,
    opts: RepoOptions = {},
  ): Promise<AvailabilityBlock[]> {
    const db = getDb(opts)
    // Un bloque solapa el rango si starts_at < to AND ends_at > from.
    return run<AvailabilityBlock[]>(
      db
        .from('availability_blocks')
        .select('*')
        .eq('studio_id', studioId)
        .lt('starts_at', toIso)
        .gt('ends_at', fromIso)
        .order('starts_at', { ascending: true }),
      'availabilityRepo.listBlocksInRange',
    )
  },

  async findOverlappingBlock(
    studioId: string,
    startsAtIso: string,
    endsAtIso: string,
    opts: RepoOptions = {},
  ): Promise<AvailabilityBlock | null> {
    const db = getDb(opts)
    return runMaybe<AvailabilityBlock>(
      db
        .from('availability_blocks')
        .select('*')
        .eq('studio_id', studioId)
        .lt('starts_at', endsAtIso)
        .gt('ends_at', startsAtIso)
        .limit(1)
        .maybeSingle(),
      'availabilityRepo.findOverlappingBlock',
    )
  },

  async createBlock(
    input: BlockInsert,
    opts: RepoOptions = {},
  ): Promise<AvailabilityBlock> {
    const db = getDb(opts)
    return run<AvailabilityBlock>(
      db.from('availability_blocks').insert(input).select('*').single(),
      'availabilityRepo.createBlock',
    )
  },

  async deleteBlock(id: string, opts: RepoOptions = {}): Promise<void> {
    const db = getDb(opts)
    const { error } = await db.from('availability_blocks').delete().eq('id', id)
    if (error) throw new Error(`[availabilityRepo.deleteBlock] ${error.message}`)
  },

  async findByBookingRequest(
    studioId: string,
    bookingRequestId: string,
    opts: RepoOptions = {},
  ): Promise<AvailabilityBlock | null> {
    const db = getDb(opts)
    return runMaybe<AvailabilityBlock>(
      db
        .from('availability_blocks')
        .select('*')
        .eq('studio_id', studioId)
        .eq('booking_request_id', bookingRequestId)
        .limit(1)
        .maybeSingle(),
      'availabilityRepo.findByBookingRequest',
    )
  },

  async confirmBlock(
    id: string,
    opts: RepoOptions = {},
  ): Promise<AvailabilityBlock> {
    const db = getDb(opts)
    return run<AvailabilityBlock>(
      db
        .from('availability_blocks')
        .update({ is_confirmed: true })
        .eq('id', id)
        .select('*')
        .single(),
      'availabilityRepo.confirmBlock',
    )
  },
}
