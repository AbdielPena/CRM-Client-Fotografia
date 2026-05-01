import 'server-only'

import type { Database } from '@/types/supabase'
import {
  assertCanTransition,
  ACTIVE_BOOKING_STATUSES,
} from '@/lib/state-machines/booking-request'

import { getDb, run, runMaybe, type RepoOptions } from './base'

type BookingRow = Database['public']['Tables']['booking_requests']['Row']
type BookingInsert = Database['public']['Tables']['booking_requests']['Insert']
type BookingStatus = Database['public']['Enums']['booking_request_status']

export type BookingRequest = BookingRow

export const bookingRequestsRepo = {
  async list(
    studioId: string,
    filters: { status?: BookingStatus; limit?: number } = {},
    opts: RepoOptions = {},
  ) {
    const db = getDb(opts)
    let q = db
      .from('booking_requests')
      .select('*')
      .eq('studio_id', studioId)
      .order('created_at', { ascending: false })

    if (filters.status) q = q.eq('status', filters.status)
    if (filters.limit) q = q.limit(filters.limit)

    return run<BookingRequest[]>(q, 'bookingRequestsRepo.list')
  },

  async findById(id: string, opts: RepoOptions = {}): Promise<BookingRequest | null> {
    const db = getDb(opts)
    return runMaybe<BookingRequest>(
      db.from('booking_requests').select('*').eq('id', id).single(),
      'bookingRequestsRepo.findById',
    )
  },

  /**
   * Crea una solicitud desde el formulario público. Fuerza status pending_review
   * para que la RLS `booking_requests_insert_public` lo acepte.
   */
  async createPublic(
    input: Omit<BookingInsert, 'status'>,
    opts: RepoOptions = {},
  ): Promise<BookingRequest> {
    const db = getDb(opts)
    return run<BookingRequest>(
      db
        .from('booking_requests')
        .insert({ ...input, status: 'pending_review' })
        .select('*')
        .single(),
      'bookingRequestsRepo.createPublic',
    )
  },

  /**
   * Transición de estado con optimistic locking por updated_at.
   * Lanza si el estado esperado no coincide (race condition / transición ilegal).
   */
  async transition(params: {
    id: string
    from: BookingStatus
    to: BookingStatus
    patch?: Partial<BookingInsert>
    expectedUpdatedAt?: string
    opts?: RepoOptions
  }): Promise<BookingRequest> {
    const { id, from, to, patch, expectedUpdatedAt, opts = {} } = params

    // Fast-fail: si la transición no existe en la state machine, no hacemos
    // viaje a DB. El trigger trg_booking_request_state_machine es el respaldo.
    assertCanTransition(from, to, 'bookingRequestsRepo.transition')

    const db = getDb(opts)

    const now = new Date().toISOString()
    let q = db
      .from('booking_requests')
      .update({
        status: to,
        updated_at: now,
        ...(patch ?? {}),
      })
      .eq('id', id)
      .eq('status', from)

    if (expectedUpdatedAt) {
      q = q.eq('updated_at', expectedUpdatedAt)
    }

    const result = await runMaybe<BookingRequest>(
      q.select('*').single(),
      'bookingRequestsRepo.transition',
    )
    if (!result) {
      throw new Error(
        `[bookingRequestsRepo.transition] transición ilegal o conflicto de concurrencia: ${from} → ${to} para ${id}`,
      )
    }
    return result
  },

  /**
   * Anti-duplicado en dos pasos:
   *  1) Match exacto por (studio, package, email, event_date) activo
   *     → evita doble submit del mismo formulario.
   *  2) Cualquier submit activo del mismo email+package en las últimas 24h
   *     → evita re-envíos oportunistas con fechas distintas.
   */
  async findDuplicate(params: {
    studioId: string
    packageId: string
    email: string
    eventDate: string
    windowHours?: number
    opts?: RepoOptions
  }): Promise<BookingRequest | null> {
    const {
      studioId,
      packageId,
      email,
      eventDate,
      windowHours = 24,
      opts = {},
    } = params
    const db = getDb(opts)

    // 1) Match exacto
    const exact = await runMaybe<BookingRequest>(
      db
        .from('booking_requests')
        .select('*')
        .eq('studio_id', studioId)
        .eq('package_id', packageId)
        .eq('client_email', email)
        .eq('event_date', eventDate)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .in('status', ACTIVE_BOOKING_STATUSES as any)
        .limit(1)
        .maybeSingle(),
      'bookingRequestsRepo.findDuplicate.exact',
    )
    if (exact) return exact

    // 2) Ventana 24h — mismo email+package, cualquier fecha, pendiente o activo
    const cutoff = new Date(
      Date.now() - windowHours * 60 * 60 * 1000,
    ).toISOString()
    return runMaybe<BookingRequest>(
      db
        .from('booking_requests')
        .select('*')
        .eq('studio_id', studioId)
        .eq('package_id', packageId)
        .eq('client_email', email)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .in('status', ACTIVE_BOOKING_STATUSES as any)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      'bookingRequestsRepo.findDuplicate.window',
    )
  },
}
