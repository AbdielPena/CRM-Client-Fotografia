/**
 * State machine canónica para contracts.
 *
 * Alineada con studioflow_state_machines.md. El DB trigger
 * `trg_contract_state_machine` hace defense in depth.
 *
 * Happy path:
 *   draft → sent → viewed → signed
 *
 * Paths alternativos:
 *   · cancelled: admin anula antes de enviarlo (o cliente se arrepiente).
 *   · expired:   venció sin firma.
 *   · voided:    admin anula post-signed (caso legal / error).
 */
import type { Database } from '@/types/supabase'

export type ContractStatus = Database['public']['Enums']['contract_status']

export const CONTRACT_TRANSITIONS: Record<
  ContractStatus,
  readonly ContractStatus[]
> = {
  draft: ['sent', 'cancelled', 'voided'],
  sent: ['viewed', 'signed', 'expired', 'cancelled', 'voided'],
  viewed: ['signed', 'expired', 'voided'],
  signed: ['voided'], // casi terminal — sólo void por decisión legal
  expired: [], // terminal
  cancelled: [], // terminal
  voided: [], // terminal
}

export const TERMINAL_CONTRACT_STATUSES: readonly ContractStatus[] = [
  'expired',
  'cancelled',
  'voided',
]

export function canTransitionContract(
  from: ContractStatus,
  to: ContractStatus,
): boolean {
  return CONTRACT_TRANSITIONS[from]?.includes(to) ?? false
}

export function assertCanTransitionContract(
  from: ContractStatus,
  to: ContractStatus,
  context?: string,
): void {
  if (!canTransitionContract(from, to)) {
    const prefix = context ? `[${context}] ` : ''
    throw new ContractStateMachineError(
      `${prefix}Transición ilegal de contrato: ${from} → ${to}. ` +
        `Permitidas desde ${from}: ${
          CONTRACT_TRANSITIONS[from].join(', ') || '(terminal)'
        }`,
      { from, to },
    )
  }
}

export class ContractStateMachineError extends Error {
  from: string
  to: string
  constructor(message: string, meta: { from: string; to: string }) {
    super(message)
    this.name = 'ContractStateMachineError'
    this.from = meta.from
    this.to = meta.to
  }
}
