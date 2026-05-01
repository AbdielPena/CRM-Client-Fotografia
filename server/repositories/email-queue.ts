import 'server-only'

import type { Database } from '@/types/supabase'

import { getDb, run, type RepoOptions } from './base'

type EmailQueueInsert = Database['public']['Tables']['email_queue']['Insert']
type EmailQueueRow = Database['public']['Tables']['email_queue']['Row']

export const emailQueueRepo = {
  async enqueue(input: EmailQueueInsert, opts: RepoOptions = {}): Promise<EmailQueueRow> {
    const db = getDb(opts)
    return run(
      db.from('email_queue').insert(input).select('*').single(),
      'emailQueueRepo.enqueue',
    )
  },

  async enqueueMany(inputs: EmailQueueInsert[], opts: RepoOptions = {}): Promise<void> {
    if (inputs.length === 0) return
    const db = getDb(opts)
    const { error } = await db.from('email_queue').insert(inputs)
    if (error) throw new Error(`[emailQueueRepo.enqueueMany] ${error.message}`)
  },

  /**
   * Usado por el worker. Requiere elevated=true (service role).
   */
  async claimBatch(limit: number, opts: RepoOptions = { elevated: true }) {
    const db = getDb(opts)
    const now = new Date().toISOString()

    // Marca como 'sending' los que estén pending y ready (for update skip locked
    // requeriría función plpgsql; usamos un patrón simple: update...returning)
    const { data, error } = await db
      .from('email_queue')
      .update({ status: 'sending', updated_at: now })
      .in('status', ['pending', 'retrying'])
      .lte('scheduled_for', now)
      .lt('attempts', 3)
      .select('*')
      .limit(limit)
    if (error) throw new Error(`[emailQueueRepo.claimBatch] ${error.message}`)
    return data ?? []
  },

  async markSent(
    id: string,
    providerMessageId: string | null,
    opts: RepoOptions = { elevated: true },
  ) {
    const db = getDb(opts)
    const { error } = await db
      .from('email_queue')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        provider_message_id: providerMessageId,
      })
      .eq('id', id)
    if (error) throw new Error(`[emailQueueRepo.markSent] ${error.message}`)
  },

  async markFailed(id: string, errorMessage: string, opts: RepoOptions = { elevated: true }) {
    const db = getDb(opts)
    const { data: current } = await db
      .from('email_queue')
      .select('attempts, max_attempts')
      .eq('id', id)
      .single()

    const attempts = (current?.attempts ?? 0) + 1
    const maxAttempts = current?.max_attempts ?? 3
    const nextStatus = attempts >= maxAttempts ? 'failed' : 'retrying'

    const { error } = await db
      .from('email_queue')
      .update({
        status: nextStatus,
        attempts,
        last_error: errorMessage,
        failed_at: nextStatus === 'failed' ? new Date().toISOString() : null,
      })
      .eq('id', id)
    if (error) throw new Error(`[emailQueueRepo.markFailed] ${error.message}`)
  },
}
