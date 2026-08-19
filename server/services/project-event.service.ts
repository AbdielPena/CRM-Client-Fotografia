import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"

/**
 * Los EVENTOS de una sesión.
 *
 * Una quinceañera no siempre cabe en una sola fecha: la sesión de fotos va un
 * día con uno de los planes, y la fiesta va otro día, cotizada aparte, con su
 * propio tiempo de entrega. Antes solo existía `projects.event_date` —una sola
 * fecha— así que la fiesta no aparecía en ningún calendario y su plazo no se
 * podía separar del de la sesión.
 *
 * Decisión del dueño: NO se parten en dos sesiones. Es UNA sesión con varias
 * fechas, un contrato y una factura por el total. Cada fila de aquí es una de
 * esas fechas, con lo que incluye ESE evento.
 *
 * Las filas nacen al COTIZAR (`project_id` null, colgando de la cotización) y
 * se enganchan al proyecto cuando el cliente acepta.
 */

export type ProjectEventInput = {
  name: string
  eventType?: string | null
  /** `YYYY-MM-DD`. */
  eventDate: string
  eventTime?: string | null
  eventEndTime?: string | null
  location?: string | null
  /** Plan de la lista vinculado a este evento. Vacío = cotizado libre. */
  packageId?: string | null
  amount?: number | null
  isPrimary?: boolean
  /** Cuántas fotos entrega ESTE evento. */
  photoCount?: number | null
  /** Días de entrega de ESTE evento. Mandan sobre el plan y la categoría. */
  deliveryDays?: number | null
  includesPrints?: boolean
  includesBook?: boolean
  notes?: string | null
}

export type ProjectEvent = ProjectEventInput & {
  id: string
  bookingRequestId: string | null
  projectId: string | null
  sortOrder: number
  packageName: string | null
  googleEventId: string | null
  googleCalendarId: string | null
}

function num(v: unknown): number | null {
  if (v === "" || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Hora suelta del formulario (`19:30`) → lo que acepta Postgres, o null. */
function hora(v: unknown): string | null {
  const s = String(v ?? "").trim()
  return /^\d{1,2}:\d{2}/.test(s) ? s.slice(0, 5) : null
}

/**
 * Limpia lo que llega del formulario. Lo comparten la creación de la
 * cotización y la edición desde la sesión, para que no haya dos criterios.
 */
export function normalizeEvents(raw: unknown): ProjectEventInput[] {
  if (!Array.isArray(raw)) return []
  const out = raw
    .map((e): ProjectEventInput | null => {
      const o = (e ?? {}) as Record<string, unknown>
      const fecha = String(o.eventDate ?? "").slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
      const nombre = String(o.name ?? "").trim()
      return {
        name: nombre || "Evento",
        eventType: String(o.eventType ?? "").trim() || null,
        eventDate: fecha,
        eventTime: hora(o.eventTime),
        eventEndTime: hora(o.eventEndTime),
        location: String(o.location ?? "").trim() || null,
        packageId: String(o.packageId ?? "").trim() || null,
        amount: num(o.amount),
        isPrimary: o.isPrimary === true || o.isPrimary === "true",
        photoCount: num(o.photoCount),
        // `0` es un valor válido (entrega el mismo día), no un "sin definir".
        deliveryDays: num(o.deliveryDays),
        includesPrints: o.includesPrints === true || o.includesPrints === "true",
        includesBook: o.includesBook === true || o.includesBook === "true",
        notes: String(o.notes ?? "").trim() || null,
      }
    })
    .filter((e): e is ProjectEventInput => e !== null)

  if (out.length === 0) return out
  // Exactamente uno principal. Si el formulario no marcó ninguno (o marcó
  // varios), manda el primero: el índice único de la base lo exige y fallar
  // aquí por una casilla sin marcar sería absurdo.
  const marcados = out.filter((e) => e.isPrimary)
  if (marcados.length !== 1) {
    out.forEach((e, i) => {
      e.isPrimary = i === 0
    })
  }
  return out
}

/** Suma de lo que cuesta cada evento (para el total de la cotización). */
export function eventsTotal(events: ProjectEventInput[]): number {
  return events.reduce((s, e) => s + (e.amount ?? 0), 0)
}

/** El que manda como fecha de la sesión. */
export function primaryEvent<T extends { isPrimary?: boolean }>(
  events: T[],
): T | null {
  return events.find((e) => e.isPrimary) ?? events[0] ?? null
}

function toRow(
  studioId: string,
  e: ProjectEventInput,
  i: number,
  parents: { bookingRequestId?: string | null; projectId?: string | null },
) {
  return {
    studio_id: studioId,
    booking_request_id: parents.bookingRequestId ?? null,
    project_id: parents.projectId ?? null,
    name: e.name,
    event_type: e.eventType ?? null,
    event_date: e.eventDate,
    event_time: e.eventTime ?? null,
    event_end_time: e.eventEndTime ?? null,
    location: e.location ?? null,
    package_id: e.packageId ?? null,
    amount: e.amount ?? null,
    is_primary: e.isPrimary === true,
    sort_order: i,
    photo_count: e.photoCount ?? null,
    delivery_days: e.deliveryDays ?? null,
    includes_prints: e.includesPrints === true,
    includes_book: e.includesBook === true,
    notes: e.notes ?? null,
  }
}

const CAMPOS =
  "id, studio_id, booking_request_id, project_id, name, event_type, " +
  "event_date, event_time, event_end_time, location, package_id, amount, " +
  "is_primary, sort_order, photo_count, delivery_days, includes_prints, " +
  "includes_book, notes, google_event_id, google_calendar_id, " +
  "package:packages(name)"

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function fromRow(r: Record<string, unknown>): ProjectEvent {
  const pkg = one(r.package as { name: string } | Array<{ name: string }> | null)
  const hi = r.event_time as string | null
  const hf = r.event_end_time as string | null
  return {
    id: String(r.id),
    bookingRequestId: (r.booking_request_id as string) ?? null,
    projectId: (r.project_id as string) ?? null,
    name: String(r.name ?? ""),
    eventType: (r.event_type as string) ?? null,
    eventDate: String(r.event_date ?? "").slice(0, 10),
    eventTime: hi ? hi.slice(0, 5) : null,
    eventEndTime: hf ? hf.slice(0, 5) : null,
    location: (r.location as string) ?? null,
    packageId: (r.package_id as string) ?? null,
    packageName: pkg?.name ?? null,
    amount: r.amount == null ? null : Number(r.amount),
    isPrimary: r.is_primary === true,
    sortOrder: Number(r.sort_order ?? 0),
    photoCount: r.photo_count == null ? null : Number(r.photo_count),
    deliveryDays: r.delivery_days == null ? null : Number(r.delivery_days),
    includesPrints: r.includes_prints === true,
    includesBook: r.includes_book === true,
    notes: (r.notes as string) ?? null,
    googleEventId: (r.google_event_id as string) ?? null,
    googleCalendarId: (r.google_calendar_id as string) ?? null,
  }
}

/** Guarda los eventos de una cotización recién creada (aún sin sesión). */
export async function createQuoteEvents(
  studioId: string,
  bookingRequestId: string,
  events: ProjectEventInput[],
): Promise<void> {
  if (events.length === 0) return
  const sb = untypedService()
  const { error } = await sb
    .from("project_events")
    .insert(events.map((e, i) => toRow(studioId, e, i, { bookingRequestId })))
  if (error)
    throwServiceError("PROJECT_EVENTS_CREATE_FAILED", error, {
      studioId,
      bookingRequestId,
    })
}

export async function listEventsByQuote(
  studioId: string,
  bookingRequestId: string,
): Promise<ProjectEvent[]> {
  const sb = untypedService()
  const { data } = await sb
    .from("project_events")
    .select(CAMPOS)
    .eq("studio_id", studioId)
    .eq("booking_request_id", bookingRequestId)
    .order("sort_order", { ascending: true })
  return ((data ?? []) as Array<Record<string, unknown>>).map(fromRow)
}

/** Público (sin sesión): la cotización se abre por token, no por estudio. */
export async function listEventsByQuotePublic(
  bookingRequestId: string,
): Promise<ProjectEvent[]> {
  const sb = untypedService()
  const { data } = await sb
    .from("project_events")
    .select(CAMPOS)
    .eq("booking_request_id", bookingRequestId)
    .order("sort_order", { ascending: true })
  return ((data ?? []) as Array<Record<string, unknown>>).map(fromRow)
}

export async function listEventsByProject(
  studioId: string,
  projectId: string,
): Promise<ProjectEvent[]> {
  const sb = untypedService()
  const { data } = await sb
    .from("project_events")
    .select(CAMPOS)
    .eq("studio_id", studioId)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
  return ((data ?? []) as Array<Record<string, unknown>>).map(fromRow)
}

/**
 * El cliente aceptó: los eventos de la cotización pasan a ser los de la sesión.
 * Devuelve el evento principal, que es de donde salen la fecha, el lugar y el
 * plazo de la sesión.
 */
export async function attachQuoteEventsToProject(
  bookingRequestId: string,
  projectId: string,
): Promise<ProjectEvent | null> {
  const sb = untypedService()
  const { error } = await sb
    .from("project_events")
    .update({ project_id: projectId, updated_at: new Date().toISOString() })
    .eq("booking_request_id", bookingRequestId)
    .is("project_id", null)
  if (error)
    throwServiceError("PROJECT_EVENTS_ATTACH_FAILED", error, {
      bookingRequestId,
      projectId,
    })

  const { data } = await sb
    .from("project_events")
    .select(CAMPOS)
    .eq("booking_request_id", bookingRequestId)
    .order("sort_order", { ascending: true })
  const eventos = ((data ?? []) as Array<Record<string, unknown>>).map(fromRow)
  return primaryEvent(eventos)
}

export async function updateProjectEvent(
  studioId: string,
  eventId: string,
  patch: Partial<ProjectEventInput>,
): Promise<ProjectEvent | null> {
  const sb = untypedService()
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) row.name = patch.name.trim() || "Evento"
  if (patch.eventType !== undefined) row.event_type = patch.eventType || null
  if (patch.eventDate !== undefined) row.event_date = patch.eventDate.slice(0, 10)
  if (patch.eventTime !== undefined) row.event_time = hora(patch.eventTime)
  if (patch.eventEndTime !== undefined) row.event_end_time = hora(patch.eventEndTime)
  if (patch.location !== undefined) row.location = patch.location || null
  if (patch.packageId !== undefined) row.package_id = patch.packageId || null
  if (patch.amount !== undefined) row.amount = patch.amount
  if (patch.photoCount !== undefined) row.photo_count = patch.photoCount
  if (patch.deliveryDays !== undefined) row.delivery_days = patch.deliveryDays
  if (patch.includesPrints !== undefined)
    row.includes_prints = patch.includesPrints === true
  if (patch.includesBook !== undefined)
    row.includes_book = patch.includesBook === true
  if (patch.notes !== undefined) row.notes = patch.notes || null

  const { data, error } = await sb
    .from("project_events")
    .update(row)
    .eq("id", eventId)
    .eq("studio_id", studioId)
    .select(CAMPOS)
    .maybeSingle()
  if (error) throwServiceError("PROJECT_EVENT_UPDATE_FAILED", error, { eventId })
  return data ? fromRow(data as Record<string, unknown>) : null
}

/**
 * Cambia cuál es el evento principal. Se hace en dos pasos porque la base tiene
 * un índice único: hay que soltar el que estaba antes de marcar el nuevo.
 */
export async function setPrimaryEvent(
  studioId: string,
  projectId: string,
  eventId: string,
): Promise<void> {
  const sb = untypedService()
  await sb
    .from("project_events")
    .update({ is_primary: false })
    .eq("studio_id", studioId)
    .eq("project_id", projectId)
    .neq("id", eventId)
  const { error } = await sb
    .from("project_events")
    .update({ is_primary: true, updated_at: new Date().toISOString() })
    .eq("studio_id", studioId)
    .eq("id", eventId)
  if (error) throwServiceError("PROJECT_EVENT_PRIMARY_FAILED", error, { eventId })
}

/** Añade un evento a una sesión que ya existe. */
export async function addProjectEvent(
  studioId: string,
  projectId: string,
  input: ProjectEventInput,
): Promise<ProjectEvent | null> {
  const sb = untypedService()
  const { count } = await sb
    .from("project_events")
    .select("id", { count: "exact", head: true })
    .eq("studio_id", studioId)
    .eq("project_id", projectId)
  const orden = Number(count ?? 0)
  // El primero de una sesión es el principal; los siguientes nunca lo son de
  // entrada (el índice único lo rechazaría y hay que elegirlo a mano).
  const row = toRow(studioId, { ...input, isPrimary: orden === 0 }, orden, {
    projectId,
  })
  const { data, error } = await sb
    .from("project_events")
    .insert(row)
    .select(CAMPOS)
    .maybeSingle()
  if (error) throwServiceError("PROJECT_EVENT_ADD_FAILED", error, { projectId })
  return data ? fromRow(data as Record<string, unknown>) : null
}

export async function deleteProjectEvent(
  studioId: string,
  eventId: string,
): Promise<void> {
  const sb = untypedService()
  const { error } = await sb
    .from("project_events")
    .delete()
    .eq("studio_id", studioId)
    .eq("id", eventId)
  if (error) throwServiceError("PROJECT_EVENT_DELETE_FAILED", error, { eventId })
}
