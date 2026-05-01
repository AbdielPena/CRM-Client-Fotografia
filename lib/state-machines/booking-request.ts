/**
 * State machine canónica para booking_requests.
 *
 * Single source of truth para qué transiciones son legales. Toda capa
 * (servicio, repositorio, API route) debe validar contra este mapa antes
 * de escribir. El DB trigger `trg_booking_request_state_machine` hace
 * defense in depth en caso de bypass.
 */
import type { Database } from '@/types/supabase'

export type BookingRequestStatus =
  Database['public']['Enums']['booking_request_status']

/**
 * Transiciones permitidas: from → to[].
 * Derivada de studioflow_state_machines.md (memoria de decisiones).
 */
export const BOOKING_REQUEST_TRANSITIONS: Record<
  BookingRequestStatus,
  readonly BookingRequestStatus[]
> = {
  pending_review: ['approved', 'rejected', 'cancelled'],
  approved: ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['confirmed', 'cancelled'],
  confirmed: ['scheduled', 'cancelled'],
  scheduled: ['completed', 'cancelled'],
  completed: [], // terminal
  rejected: [], // terminal
  cancelled: [], // terminal
}

export const TERMINAL_BOOKING_STATUSES: readonly BookingRequestStatus[] = [
  'completed',
  'rejected',
  'cancelled',
]

/** Estados "activos" que compiten por la misma fecha. */
export const ACTIVE_BOOKING_STATUSES: readonly BookingRequestStatus[] = [
  'pending_review',
  'approved',
  'awaiting_payment',
  'confirmed',
  'scheduled',
]

export function canTransition(
  from: BookingRequestStatus,
  to: BookingRequestStatus,
): boolean {
  return BOOKING_REQUEST_TRANSITIONS[from]?.includes(to) ?? false
}

export function assertCanTransition(
  from: BookingRequestStatus,
  to: BookingRequestStatus,
  context?: string,
): void {
  if (!canTransition(from, to)) {
    const prefix = context ? `[${context}] ` : ''
    throw new StateMachineError(
      `${prefix}Transición ilegal: ${from} → ${to}. ` +
        `Permitidas desde ${from}: ${
          BOOKING_REQUEST_TRANSITIONS[from].join(', ') || '(terminal)'
        }`,
      { from, to },
    )
  }
}

export class StateMachineError extends Error {
  from: string
  to: string
  constructor(message: string, meta: { from: string; to: string }) {
    super(message)
    this.name = 'StateMachineError'
    this.from = meta.from
    this.to = meta.to
  }
}
