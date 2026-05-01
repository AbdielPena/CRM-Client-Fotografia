import 'server-only'

import { availabilityRepo, type AvailabilityRule, type AvailabilityBlock } from '@/server/repositories'
import type { RepoOptions } from '@/server/repositories'

/**
 * ── Disponibilidad ──
 *
 * Combina dos fuentes de verdad:
 *   1) availability_rules (horarios recurrentes + overrides de fecha)
 *   2) availability_blocks (eventos puntuales que bloquean la agenda)
 *
 * Decisión final: un slot [startAt, endAt] está disponible si y solo si
 *   a) NO solapa con ningún bloque activo del studio
 *   b) está completamente contenido dentro de una ventana abierta para ese día
 *      (determinada por override de fecha si existe, sino regla semanal)
 *
 * Zonas horarias: aceptamos `timezone` IANA (p.ej. 'America/Santo_Domingo').
 * Por defecto usamos Santo Domingo (toda RD opera en UTC-4 sin DST).
 */

export const DEFAULT_TIMEZONE = 'America/Santo_Domingo'

export type SlotAvailabilityOk = { available: true }
export type SlotAvailabilityBlocked = {
  available: false
  reason:
    | 'block_overlap'
    | 'date_closed'
    | 'weekly_closed'
    | 'no_hours_defined'
    | 'outside_hours'
    | 'invalid_range'
  detail?: string
  block?: AvailabilityBlock
  rule?: AvailabilityRule
}
export type SlotAvailabilityResult = SlotAvailabilityOk | SlotAvailabilityBlocked

// ──────────────────────────────────────────────────────────────────────
// Utilidades de fecha/hora con soporte de timezone
// ──────────────────────────────────────────────────────────────────────

type LocalParts = {
  year: number
  month: number // 1-12
  day: number
  weekday: number // 0=Domingo, 6=Sábado (ISO/JS)
  hours: number
  minutes: number
  seconds: number
  isoDate: string // YYYY-MM-DD
  minutesOfDay: number // 0..1440
}

/**
 * Convierte un ISO UTC a sus componentes en la zona dada.
 * Usa Intl.DateTimeFormat — no depende de librerías externas.
 */
function toLocalParts(iso: string, timezone: string): LocalParts {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    throw new Error(`[availability] fecha inválida: ${iso}`)
  }

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  })
  const parts = fmt.formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0'

  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }

  const year = Number(get('year'))
  const month = Number(get('month'))
  const day = Number(get('day'))
  const hours = Number(get('hour')) % 24
  const minutes = Number(get('minute'))
  const seconds = Number(get('second'))
  const weekday = weekdayMap[get('weekday')] ?? 0

  const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  return {
    year,
    month,
    day,
    weekday,
    hours,
    minutes,
    seconds,
    isoDate,
    minutesOfDay: hours * 60 + minutes,
  }
}

/** Convierte "HH:MM" o "HH:MM:SS" en minutos del día. */
function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null
  const [h, m] = time.split(':')
  const hh = Number(h)
  const mm = Number(m ?? 0)
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null
  return hh * 60 + mm
}

// ──────────────────────────────────────────────────────────────────────
// Core: ¿Está disponible este slot?
// ──────────────────────────────────────────────────────────────────────

type IsSlotAvailableInput = {
  studioId: string
  startAtIso: string
  endAtIso: string
  timezone?: string
  /** Excluir estos IDs de bloques de la comprobación (p.ej. al editar). */
  excludeBlockIds?: string[]
}

export async function isSlotAvailable(
  input: IsSlotAvailableInput,
  opts: RepoOptions = {},
): Promise<SlotAvailabilityResult> {
  const { studioId, startAtIso, endAtIso, timezone = DEFAULT_TIMEZONE } = input

  const startMs = new Date(startAtIso).getTime()
  const endMs = new Date(endAtIso).getTime()
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return {
      available: false,
      reason: 'invalid_range',
      detail: 'El horario de fin debe ser posterior al de inicio',
    }
  }

  // 1) Bloques que solapen
  const blocks = await availabilityRepo.listBlocksInRange(
    studioId,
    startAtIso,
    endAtIso,
    opts,
  )
  const conflicting = blocks.find(
    (b) => !input.excludeBlockIds?.includes(b.id),
  )
  if (conflicting) {
    return {
      available: false,
      reason: 'block_overlap',
      detail: `Solapa con bloque ${conflicting.block_type ?? ''} (${conflicting.starts_at} → ${conflicting.ends_at})`,
      block: conflicting,
    }
  }

  // 2) Reglas del studio
  const rules = await availabilityRepo.listRules(studioId, opts)

  const startParts = toLocalParts(startAtIso, timezone)
  const endParts = toLocalParts(endAtIso, timezone)

  // Por simplicidad: solo permitimos slots que empiezan y terminan el mismo día
  // local. Eventos multi-día deben dividirse (no es un caso esperado en XV).
  if (startParts.isoDate !== endParts.isoDate) {
    return {
      available: false,
      reason: 'invalid_range',
      detail: 'El slot cruza más de un día (no soportado aún)',
    }
  }

  const isoDate = startParts.isoDate
  const dow = startParts.weekday
  const slotStart = startParts.minutesOfDay
  // Si el slot termina justo a medianoche de otro día la clausura fallaría;
  // como ya validamos que no cruza días, endParts.isoDate === startParts.isoDate
  // y endParts.minutesOfDay puede ser hasta 1440 si end cae en 00:00 del día
  // siguiente — usamos 1440 como tope seguro.
  const slotEnd =
    endParts.minutesOfDay === 0 && startParts.minutesOfDay > 0
      ? 1440
      : endParts.minutesOfDay

  // 2a) ¿Hay override de fecha cerrada que cubra este día?
  const dateClosed = rules.find(
    (r) =>
      r.rule_type === 'date_closed' &&
      isDateWithinRule(isoDate, r),
  )
  if (dateClosed) {
    return {
      available: false,
      reason: 'date_closed',
      detail: `Fecha bloqueada por regla (${dateClosed.start_date ?? ''}${dateClosed.end_date ? ` → ${dateClosed.end_date}` : ''})`,
      rule: dateClosed,
    }
  }

  // 2b) ¿Hay override de fecha abierta para este día? Gana sobre regla semanal.
  const dateOpen = rules.find(
    (r) => r.rule_type === 'date_open_override' && r.start_date === isoDate,
  )
  if (dateOpen) {
    return checkWindow(slotStart, slotEnd, dateOpen)
  }

  // 2c) Regla semanal cerrada (override de día entero)
  const weeklyClosed = rules.find(
    (r) => r.rule_type === 'weekly_closed' && r.day_of_week === dow,
  )
  if (weeklyClosed) {
    return {
      available: false,
      reason: 'weekly_closed',
      detail: `Día ${dow} cerrado por regla semanal`,
      rule: weeklyClosed,
    }
  }

  // 2d) Ventanas semanales abiertas
  const weeklyOpens = rules.filter(
    (r) => r.rule_type === 'weekly_open' && r.day_of_week === dow,
  )
  if (weeklyOpens.length === 0) {
    return {
      available: false,
      reason: 'no_hours_defined',
      detail: `No hay horario configurado para el día ${dow}`,
    }
  }

  // ¿El slot cabe COMPLETO dentro de alguna ventana abierta?
  const fits = weeklyOpens.find((r) => windowContains(r, slotStart, slotEnd))
  if (fits) return { available: true }

  return {
    available: false,
    reason: 'outside_hours',
    detail: 'El slot cae fuera del horario abierto del día',
    rule: weeklyOpens[0],
  }
}

function checkWindow(
  slotStart: number,
  slotEnd: number,
  rule: AvailabilityRule,
): SlotAvailabilityResult {
  if (windowContains(rule, slotStart, slotEnd)) return { available: true }
  return {
    available: false,
    reason: 'outside_hours',
    detail: 'El slot cae fuera de la ventana definida',
    rule,
  }
}

function windowContains(
  rule: AvailabilityRule,
  slotStart: number,
  slotEnd: number,
): boolean {
  const winStart = timeToMinutes(rule.start_time)
  const winEnd = timeToMinutes(rule.end_time)
  if (winStart === null || winEnd === null) return false
  return slotStart >= winStart && slotEnd <= winEnd
}

function isDateWithinRule(isoDate: string, rule: AvailabilityRule): boolean {
  if (!rule.start_date) return false
  const from = rule.start_date
  const to = rule.end_date ?? rule.start_date
  return isoDate >= from && isoDate <= to
}

// ──────────────────────────────────────────────────────────────────────
// Helpers para el flujo de negocio
// ──────────────────────────────────────────────────────────────────────

/**
 * Crea un bloque provisional ligado a una booking_request aprobada.
 * Se confirma cuando la booking pasa a 'scheduled'.
 * Si ya existe un bloque para ese booking_request_id, lo reusa.
 */
export async function createProvisionalBlockForBooking(params: {
  studioId: string
  bookingRequestId: string
  startsAtIso: string
  endsAtIso: string
  title?: string
  notes?: string
  createdBy?: string | null
}): Promise<AvailabilityBlock> {
  const existing = await availabilityRepo.findByBookingRequest(
    params.studioId,
    params.bookingRequestId,
    { elevated: true },
  )
  if (existing) return existing

  return availabilityRepo.createBlock(
    {
      studio_id: params.studioId,
      booking_request_id: params.bookingRequestId,
      starts_at: params.startsAtIso,
      ends_at: params.endsAtIso,
      block_type: 'booking',
      title: params.title ?? 'Sesión reservada',
      notes: params.notes ?? null,
      is_confirmed: false,
      metadata: {
        created_by: params.createdBy ?? null,
        source: 'booking_request',
      },
    },
    { elevated: true },
  )
}

/**
 * Marca como confirmado el bloque ligado a un booking (cuando pasa a
 * scheduled/confirmed). Silencioso si no hay bloque.
 */
export async function confirmBlockForBooking(params: {
  studioId: string
  bookingRequestId: string
}): Promise<void> {
  const existing = await availabilityRepo.findByBookingRequest(
    params.studioId,
    params.bookingRequestId,
    { elevated: true },
  )
  if (!existing) return
  await availabilityRepo.confirmBlock(existing.id, { elevated: true })
}

/**
 * Elimina el bloque ligado a un booking (cuando se rechaza o cancela).
 * Silencioso si no hay bloque.
 */
export async function removeBlockForBooking(params: {
  studioId: string
  bookingRequestId: string
}): Promise<void> {
  const existing = await availabilityRepo.findByBookingRequest(
    params.studioId,
    params.bookingRequestId,
    { elevated: true },
  )
  if (!existing) return
  await availabilityRepo.deleteBlock(existing.id, { elevated: true })
}

/**
 * Check de día completo (sin hora). Útil para el form público donde
 * solo pedimos event_date. Devuelve false si el día está cerrado por:
 *   - date_closed que cubre esa fecha
 *   - weekly_closed para ese día de la semana (salvo que exista
 *     date_open_override para esa fecha exacta)
 * Devuelve true si el día tiene al menos una ventana abierta o un
 * override de apertura.
 */
export async function isDateAvailable(
  studioId: string,
  isoDate: string,
  timezone: string = DEFAULT_TIMEZONE,
  opts: RepoOptions = {},
): Promise<SlotAvailabilityResult> {
  const rules = await availabilityRepo.listRules(studioId, opts)

  // Interpreta isoDate (YYYY-MM-DD) en el tz del studio a las 12:00 para
  // extraer el día de semana sin ambigüedad.
  const midday = new Date(`${isoDate}T12:00:00Z`)
  const parts = toLocalParts(midday.toISOString(), timezone)
  // parts.isoDate podría diferir si el tz desfasa; preferimos el isoDate
  // del caller para las reglas date_*.
  const dow = parts.weekday

  const dateClosed = rules.find(
    (r) => r.rule_type === 'date_closed' && isDateWithinRule(isoDate, r),
  )
  if (dateClosed) {
    return {
      available: false,
      reason: 'date_closed',
      detail: `Fecha bloqueada (${dateClosed.start_date ?? ''}${dateClosed.end_date ? ` → ${dateClosed.end_date}` : ''})`,
      rule: dateClosed,
    }
  }

  const dateOpen = rules.find(
    (r) => r.rule_type === 'date_open_override' && r.start_date === isoDate,
  )
  if (dateOpen) return { available: true }

  const weeklyClosed = rules.find(
    (r) => r.rule_type === 'weekly_closed' && r.day_of_week === dow,
  )
  if (weeklyClosed) {
    return {
      available: false,
      reason: 'weekly_closed',
      detail: `Día ${dow} cerrado por regla semanal`,
      rule: weeklyClosed,
    }
  }

  const weeklyOpens = rules.filter(
    (r) => r.rule_type === 'weekly_open' && r.day_of_week === dow,
  )
  if (weeklyOpens.length === 0) {
    return {
      available: false,
      reason: 'no_hours_defined',
      detail: `No hay horario configurado para el día ${dow}`,
    }
  }

  return { available: true }
}

/**
 * Lista bloques + rules dentro de un rango. Útil para calendar view.
 */
export async function listAvailabilityWindow(
  studioId: string,
  fromIso: string,
  toIso: string,
  opts: RepoOptions = {},
): Promise<{ rules: AvailabilityRule[]; blocks: AvailabilityBlock[] }> {
  const [rules, blocks] = await Promise.all([
    availabilityRepo.listRules(studioId, opts),
    availabilityRepo.listBlocksInRange(studioId, fromIso, toIso, opts),
  ])
  return { rules, blocks }
}
