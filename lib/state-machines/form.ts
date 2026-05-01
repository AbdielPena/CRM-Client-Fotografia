/**
 * State machine canónica para form_responses.
 *
 * Flujo normal:
 *   pending → sent → in_progress → completed
 *                  ↘ expired (timeout sin completar)
 *
 * - pending: creado pero aún no se le envió el link al cliente.
 * - sent: link emitido (sent_at timestamp).
 * - in_progress: cliente abrió el form y guardó avance parcial.
 * - completed: cliente submit final (completed_at).
 * - expired: terminal por timeout (expires_at pasado).
 */
import type { Database } from '@/types/supabase'

export type FormStatus = Database['public']['Enums']['form_status']

export const FORM_TRANSITIONS: Record<
  FormStatus,
  readonly FormStatus[]
> = {
  pending: ['sent', 'expired'],
  sent: ['in_progress', 'completed', 'expired'],
  in_progress: ['completed', 'expired'],
  completed: [], // terminal
  expired: [], // terminal
}

export const TERMINAL_FORM_STATUSES: readonly FormStatus[] = [
  'completed',
  'expired',
]

export function canTransitionForm(from: FormStatus, to: FormStatus): boolean {
  return FORM_TRANSITIONS[from]?.includes(to) ?? false
}

export function assertCanTransitionForm(
  from: FormStatus,
  to: FormStatus,
  context?: string,
): void {
  if (!canTransitionForm(from, to)) {
    const prefix = context ? `[${context}] ` : ''
    throw new FormStateMachineError(
      `${prefix}Transición ilegal de form: ${from} → ${to}. ` +
        `Permitidas desde ${from}: ${
          FORM_TRANSITIONS[from].join(', ') || '(terminal)'
        }`,
      { from, to },
    )
  }
}

export class FormStateMachineError extends Error {
  from: string
  to: string
  constructor(message: string, meta: { from: string; to: string }) {
    super(message)
    this.name = 'FormStateMachineError'
    this.from = meta.from
    this.to = meta.to
  }
}
