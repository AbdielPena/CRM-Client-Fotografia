import 'server-only'

import { bookingRequestsRepo } from '@/server/repositories/booking-requests'
import {
  createSupabasePublicClient,
  createSupabaseServerClient,
} from '@/server/supabase/server'
import { createSupabaseServiceClient } from '@/server/supabase/service'
import {
  enqueueEmail,
  renderBookingApprovedForClient,
  renderBookingReceivedForStudio,
  renderBookingRejectedForClient,
} from '@/server/services/email.service'
import { logActivity } from '@/server/services/activity.service'
import { notify } from '@/server/services/notification.service'
import {
  isDateAvailable,
  createProvisionalBlockForBooking,
  removeBlockForBooking,
} from '@/server/services/availability.service'
import { createClientWithBooking } from '@/server/services/client.service'
import { createFormResponsesForBooking } from '@/server/services/form.service'
import { syncProjectById } from '@/server/services/google-calendar.service'
import type { CreateBookingRequestInput } from '@/lib/validations/booking-request.schema'
import type { Database } from '@/types/supabase'

type BookingRequestStatus =
  Database['public']['Enums']['booking_request_status']

/**
 * Resuelve studio + paquete a partir de los slugs públicos.
 * Usa el cliente `public` (anon) para respetar RLS y las vistas whitelisted.
 */
async function resolveStudioAndPackage(studioSlug: string, packageSlug: string) {
  const supabase = createSupabasePublicClient()

  const { data: studio } = await supabase
    .from('studios_public')
    .select('id, name, slug, currency, email, primary_color')
    .eq('slug', studioSlug)
    .maybeSingle()

  if (!studio) return null

  const { data: pkg } = await supabase
    .from('packages_public')
    .select(
      'id, name, slug, price, currency, duration_hours, edited_photos, includes, event_type, deposit_percent, reserve_due_in_days',
    )
    .eq('studio_id', (studio as { id: string }).id)
    .eq('slug', packageSlug)
    .maybeSingle()

  if (!pkg) return null

  return {
    studio: studio as {
      id: string
      name: string
      slug: string
      currency: string | null
      email: string | null
      primary_color: string | null
    },
    pkg: pkg as {
      id: string
      name: string
      slug: string
      price: number | string
      currency: string | null
      duration_hours: number | null
      edited_photos: number | null
      includes: string[] | null
      event_type: string | null
      deposit_percent: number | null
      reserve_due_in_days: number | null
    },
  }
}

/** URL pública base para links en emails (dashboard del studio). */
function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3000'
  )
}

export type BookingRequestCreationResult =
  | { status: 'ok'; requestId: string }
  | { status: 'duplicate'; existingId: string }
  | { status: 'not_found' }
  | { status: 'unavailable_date'; reason: string }

/**
 * Crea una solicitud pública de booking. Incluye:
 *  - Resolución segura de studio/paquete por slug
 *  - Snapshot inmutable del paquete en el momento de la reserva
 *  - Deduplicación por (studio, package, email, fecha)
 *  - Uso de service-role solo para la escritura final (porque anon solo puede
 *    INSERT y necesitamos devolver la fila con `.select('*').single()`)
 */
export async function createPublicBookingRequest(
  input: CreateBookingRequestInput,
  meta: { ip?: string; userAgent?: string },
): Promise<BookingRequestCreationResult> {
  const resolved = await resolveStudioAndPackage(
    input.studioSlug,
    input.packageSlug,
  )
  if (!resolved) return { status: 'not_found' }

  const { studio, pkg } = resolved
  const email = input.clientEmail.trim().toLowerCase()

  // Deduplicación: misma combinación, estado activo → devolver el existente.
  // Usamos elevated porque anon no tiene SELECT sobre booking_requests.
  const existing = await bookingRequestsRepo.findDuplicate({
    studioId: studio.id,
    packageId: pkg.id,
    email,
    eventDate: input.eventDate,
    opts: { elevated: true },
  })
  if (existing) {
    return { status: 'duplicate', existingId: existing.id }
  }

  // Validación de disponibilidad a nivel de día. Si el studio tiene
  // reglas configuradas y el día está cerrado (vacaciones, domingo
  // cerrado, etc.), rechazamos la solicitud antes de crearla.
  // Si el studio aún no configuró reglas, `no_hours_defined` NO bloquea
  // — permitimos la solicitud y el fotógrafo decidirá manualmente.
  const dayCheck = await isDateAvailable(
    studio.id,
    input.eventDate,
    undefined,
    { elevated: true },
  )
  if (!dayCheck.available && dayCheck.reason !== 'no_hours_defined') {
    return {
      status: 'unavailable_date',
      reason: dayCheck.detail ?? 'Esa fecha no está disponible',
    }
  }

  // Snapshot inmutable del paquete — así si luego cambia el precio/contenido,
  // la solicitud queda registrada con los valores al momento de reservar.
  const price = Number(pkg.price)
  const depositPct = pkg.deposit_percent ?? 0
  const depositAmount =
    depositPct > 0 ? Number(((price * depositPct) / 100).toFixed(2)) : 0

  const packageSnapshot = {
    id: pkg.id,
    name: pkg.name,
    slug: pkg.slug,
    duration_hours: pkg.duration_hours,
    edited_photos: pkg.edited_photos,
    includes: pkg.includes ?? [],
    event_type: pkg.event_type,
  }

  const pricingSnapshot = {
    price,
    currency: pkg.currency ?? studio.currency ?? 'DOP',
    deposit_percent: depositPct,
    deposit_amount: depositAmount,
    reserve_due_in_days: pkg.reserve_due_in_days ?? null,
  }

  // La escritura usa service-role (elevated) para poder leer la fila insertada
  // tras el INSERT y devolver el ID. La policy RLS
  // booking_requests_insert_public exige status='pending_review'; service-role
  // la bypassa pero el service también lo fuerza en createPublic().
  const created = await bookingRequestsRepo.createPublic(
    {
      studio_id: studio.id,
      package_id: pkg.id,
      client_name: input.clientName.trim(),
      client_email: email,
      client_phone: input.clientPhone?.trim() || null,
      client_whatsapp: input.clientWhatsapp?.trim() || null,
      event_type: input.eventType?.trim() || pkg.event_type || null,
      event_date: input.eventDate,
      event_time: input.eventTime?.trim() || null,
      event_location: input.eventLocation?.trim() || null,
      guest_count: input.guestCount ?? null,
      additional_notes: input.additionalNotes?.trim() || null,
      submitted_from_ip: meta.ip ?? null,
      submitted_user_agent: meta.userAgent ?? null,
      package_snapshot: packageSnapshot,
      pricing_snapshot: pricingSnapshot,
    },
    { elevated: true },
  )

  // Audit log — actor es el cliente (anon), usamos elevated porque anon no
  // tiene INSERT sobre activity_log.
  await logActivity({
    studioId: studio.id,
    action: 'booking_request.created',
    entityType: 'booking_request',
    entityId: created.id,
    actorType: 'client',
    actorEmail: email,
    actorName: input.clientName.trim(),
    description: `Nueva solicitud de ${input.clientName.trim()} para ${pkg.name}`,
    afterState: {
      status: 'pending_review',
      package_id: pkg.id,
      event_date: input.eventDate,
    },
    metadata: {
      ip: meta.ip ?? null,
      user_agent: meta.userAgent ?? null,
      package_slug: pkg.slug,
    },
    elevated: true,
  })

  // Notificación in-app a todo el staff del studio
  await notify({
    studioId: studio.id,
    type: 'booking_request_received',
    title: `Nueva solicitud de ${input.clientName.trim()}`,
    body: `${pkg.name} · ${input.eventDate}`,
    actionUrl: `/bookings/${created.id}`,
    relatedEntityType: 'booking_request',
    relatedEntityId: created.id,
    metadata: {
      client_email: email,
      package_name: pkg.name,
    },
  })

  // Notificar al studio — best-effort, no queremos fallar la solicitud si el
  // enqueue falla. El worker hace el retry.
  if (studio.email) {
    try {
      const { subject, html } = renderBookingReceivedForStudio({
        studioName: studio.name,
        primaryColor: studio.primary_color ?? '#111827',
        clientName: input.clientName.trim(),
        clientEmail: email,
        clientPhone: input.clientPhone?.trim() || null,
        packageName: pkg.name,
        eventDate: input.eventDate,
        eventTime: input.eventTime?.trim() || null,
        eventLocation: input.eventLocation?.trim() || null,
        adminLink: `${appBaseUrl()}/bookings/${created.id}`,
      })
      await enqueueEmail({
        studioId: studio.id,
        toEmail: studio.email,
        toName: studio.name,
        subject,
        bodyHtml: html,
        templateSlug: 'booking_received_for_studio',
        relatedEntityType: 'booking_request',
        relatedEntityId: created.id,
      })
    } catch (err) {
      console.error('[createPublicBookingRequest] enqueue studio email failed', err)
    }
  }

  return { status: 'ok', requestId: created.id }
}

// ──────────────────────────────────────────────────────────────────────
// Admin — listar, obtener detalle, aprobar, rechazar, cancelar
// ──────────────────────────────────────────────────────────────────────

export type BookingRequestListItem = {
  id: string
  status: BookingRequestStatus
  client_name: string
  client_email: string
  client_phone: string | null
  event_type: string | null
  event_date: string
  event_time: string | null
  event_location: string | null
  guest_count: number | null
  additional_notes: string | null
  created_at: string
  package: {
    id: string
    name: string
    slug: string
    price: number | string
    currency: string | null
  } | null
}

export async function listBookingRequestsForStudio(
  studioId: string,
  opts: { status?: BookingRequestStatus; limit?: number } = {},
): Promise<BookingRequestListItem[]> {
  const supabase = createSupabaseServerClient()
  let query = supabase
    .from('booking_requests')
    .select(
      `
      id, status, client_name, client_email, client_phone,
      event_type, event_date, event_time, event_location,
      guest_count, additional_notes, created_at,
      package:packages!inner ( id, name, slug, price, currency )
    `,
    )
    .eq('studio_id', studioId)
    .order('created_at', { ascending: false })

  if (opts.status) query = query.eq('status', opts.status)
  if (opts.limit) query = query.limit(opts.limit)

  const { data, error } = await query
  if (error) throw new Error(`[listBookingRequestsForStudio] ${error.message}`)

  // Supabase retorna `package` como array en joins; lo normalizamos.
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>
  return rows.map((row) => {
    const pkgRaw = row.package
    const pkg = Array.isArray(pkgRaw) ? pkgRaw[0] : pkgRaw
    return {
      ...(row as unknown as Omit<BookingRequestListItem, 'package'>),
      package: (pkg as BookingRequestListItem['package']) ?? null,
    }
  })
}

export async function getBookingRequestById(
  studioId: string,
  requestId: string,
) {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('booking_requests')
    .select(
      `
      *,
      package:packages!inner ( id, name, slug, price, currency, duration_hours, edited_photos, includes, event_type )
    `,
    )
    .eq('id', requestId)
    .eq('studio_id', studioId)
    .maybeSingle()

  if (error) throw new Error(`[getBookingRequestById] ${error.message}`)
  if (!data) return null

  const pkgRaw = (data as { package: unknown }).package
  const pkg = Array.isArray(pkgRaw) ? pkgRaw[0] : pkgRaw
  return { ...data, package: pkg }
}

export async function countPendingBookingRequests(
  studioId: string,
): Promise<number> {
  const supabase = createSupabaseServerClient()
  const { count, error } = await supabase
    .from('booking_requests')
    .select('*', { count: 'exact', head: true })
    .eq('studio_id', studioId)
    .eq('status', 'pending_review')
  if (error) throw new Error(`[countPendingBookingRequests] ${error.message}`)
  return count ?? 0
}

/** Carga studio + request + package en un solo round-trip para emails. */
async function loadContextForEmail(studioId: string, requestId: string) {
  const svc = createSupabaseServiceClient()
  const { data: request } = await svc
    .from('booking_requests')
    .select(
      'id, client_name, client_email, event_date, pricing_snapshot, package:packages!inner ( name )',
    )
    .eq('id', requestId)
    .eq('studio_id', studioId)
    .maybeSingle()
  if (!request) return null

  const { data: studio } = await svc
    .from('studios')
    .select('name, email, primary_color')
    .eq('id', studioId)
    .maybeSingle()
  if (!studio) return null

  const pkgRaw = (request as { package: unknown }).package
  const pkg = Array.isArray(pkgRaw) ? pkgRaw[0] : pkgRaw

  return {
    request: request as unknown as {
      id: string
      client_name: string
      client_email: string
      event_date: string
      pricing_snapshot: {
        deposit_amount?: number
        currency?: string
        reserve_due_in_days?: number | null
      }
    },
    packageName: (pkg as { name: string } | null)?.name ?? 'Tu paquete',
    studio: studio as {
      name: string
      email: string | null
      primary_color: string | null
    },
  }
}

/**
 * Calcula el rango [startsAt, endsAt] para bloquear la agenda a partir
 * de los campos de la booking_request. Reglas:
 *   - si event_time está seteado: startsAt = event_date + event_time
 *     endsAt = startsAt + duration_hours (fallback 4h)
 *   - si no hay event_time: bloquea todo el día (00:00 → 23:59:59)
 * Todo en timezone del studio (por ahora DEFAULT_TIMEZONE).
 */
function computeBookingTimeRange(row: {
  event_date: string
  event_time: string | null
  package_snapshot?: unknown
}): { startsAtIso: string; endsAtIso: string } {
  const snapshot = (row.package_snapshot ?? {}) as {
    duration_hours?: number | null
  }
  const durationHours =
    typeof snapshot.duration_hours === 'number' && snapshot.duration_hours > 0
      ? snapshot.duration_hours
      : 4

  // Interpretamos las fechas como locales al studio (UTC-4 por defecto, RD).
  // Santo Domingo NO observa DST: siempre offset fijo -04:00.
  const OFFSET = '-04:00'

  if (row.event_time) {
    const time =
      row.event_time.length === 5 ? `${row.event_time}:00` : row.event_time
    const start = new Date(`${row.event_date}T${time}${OFFSET}`)
    const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000)
    return {
      startsAtIso: start.toISOString(),
      endsAtIso: end.toISOString(),
    }
  }

  const start = new Date(`${row.event_date}T00:00:00${OFFSET}`)
  const end = new Date(`${row.event_date}T23:59:59${OFFSET}`)
  return {
    startsAtIso: start.toISOString(),
    endsAtIso: end.toISOString(),
  }
}

/**
 * Convierte una booking_request aprobada en el bundle completo Pixieset-style:
 *   cliente + proyecto + 2 facturas (reserva 50% + saldo) + contrato (draft).
 *
 * Es idempotente: si la booking ya tiene client_id / project_id seteados,
 * devuelve sin re-crear. Linkea contrato e invoices al booking_request_id
 * para auditoría y para poder listar "qué salió de esta solicitud".
 *
 * Falla silenciosa (best-effort): si la RPC falla (p.ej. no hay plantilla de
 * contrato), NO rompe la aprobación — el error se loggea y el operador puede
 * crear el cliente manualmente después.
 */
async function convertBookingToClientBundle(params: {
  studioId: string
  requestId: string
  actorId: string
  row: {
    client_id: string | null
    project_id: string | null
    client_name: string
    client_email: string
    client_phone: string | null
    additional_notes: string | null
    package_id: string
    event_type: string | null
    event_date: string
    event_location: string | null
    package_snapshot: unknown
    pricing_snapshot: unknown
  }
}): Promise<{
  clientId: string
  projectId: string
  contractId: string
  invoice1Id: string
  invoice2Id: string
} | null> {
  const { row } = params

  // Idempotencia: si ya se convirtió, skip. Tiene una pequeña race window
  // (dos requests concurrentes pueden ambos pasar el check). En la práctica
  // está protegida porque approveBookingRequest ya hizo `transition` con
  // un UPDATE atómico de status que sólo el primer request gana.
  // TODO: agregar columna `conversion_started_at` como advisory lock para
  // cubrir el caso patológico de dos llamadas directas a este service sin
  // pasar por approveBookingRequest.
  if (row.client_id || row.project_id) {
    console.log(
      `[convertBookingToClientBundle] booking ${params.requestId} ya tiene client/project — skip`,
    )
    return null
  }

  const snapshot = (row.package_snapshot ?? {}) as {
    event_type?: string | null
  }
  const pricing = (row.pricing_snapshot ?? {}) as {
    reserve_due_in_days?: number | null
  }

  // El RPC `create_client_with_booking` exige event_type; si el cliente no
  // lo completó en el formulario y el paquete tampoco lo tiene, caemos en
  // un placeholder razonable. El operador puede editar después.
  const eventType =
    (row.event_type ?? '').trim() ||
    (snapshot.event_type ?? '').trim() ||
    'Sesión'

  const result = await createClientWithBooking(
    params.studioId,
    params.actorId,
    {
      name: row.client_name,
      email: row.client_email || undefined,
      phone: row.client_phone || undefined,
      source: 'public_link',
      notes: row.additional_notes || undefined,
      packageId: row.package_id,
      eventType,
      eventDate: row.event_date,
      location: row.event_location || undefined,
      reserveDueInDays: pricing.reserve_due_in_days ?? undefined,
    },
  )

  // Backlink: guardar ids en la booking_request + apuntar contrato y
  // facturas a la solicitud original para trazabilidad full-circle.
  const svc = createSupabaseServiceClient()

  const { error: updateReqErr } = await svc
    .from('booking_requests')
    .update({
      client_id: result.client_id,
      project_id: result.project_id,
    })
    .eq('id', params.requestId)
  if (updateReqErr) {
    console.error(
      '[convertBookingToClientBundle] update booking_request failed',
      updateReqErr,
    )
  }

  const { error: contractLinkErr } = await svc
    .from('contracts')
    .update({ booking_request_id: params.requestId })
    .eq('id', result.contract_id)
  if (contractLinkErr) {
    console.error(
      '[convertBookingToClientBundle] link contract → booking failed',
      contractLinkErr,
    )
  }

  const { error: invoiceLinkErr } = await svc
    .from('invoices')
    .update({ booking_request_id: params.requestId })
    .in('id', [result.invoice1_id, result.invoice2_id])
  if (invoiceLinkErr) {
    console.error(
      '[convertBookingToClientBundle] link invoices → booking failed',
      invoiceLinkErr,
    )
  }

  return {
    clientId: result.client_id,
    projectId: result.project_id,
    contractId: result.contract_id,
    invoice1Id: result.invoice1_id,
    invoice2Id: result.invoice2_id,
  }
}

/**
 * Construye la URL pública de firma para un signing_token.
 * Alineada con la ruta Next `app/sign/[token]/page.tsx`.
 */
function buildContractSignUrl(signingToken: string): string {
  return `${appBaseUrl()}/sign/${signingToken}`
}

export async function approveBookingRequest(params: {
  studioId: string
  requestId: string
  actorId: string
}) {
  // Validación: no se puede aprobar una solicitud con fecha pasada.
  // Cargamos mínimo el event_date para chequear.
  const current = await bookingRequestsRepo.findById(params.requestId, {
    elevated: true,
  })
  if (!current) {
    throw new Error('[approveBookingRequest] solicitud no existe')
  }
  if (current.studio_id !== params.studioId) {
    throw new Error('[approveBookingRequest] solicitud pertenece a otro studio')
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const eventDate = new Date(current.event_date + 'T00:00:00')
  if (eventDate.getTime() < today.getTime()) {
    throw new Error(
      '[approveBookingRequest] la fecha del evento ya pasó; cancela o rechaza en su lugar',
    )
  }

  // Transición con optimistic locking (expectedUpdatedAt) — evita doble
  // aprobación concurrente. Si dos operadores hacen click simultáneo, uno gana.
  const transitioned = await bookingRequestsRepo.transition({
    id: params.requestId,
    from: 'pending_review',
    to: 'approved',
    expectedUpdatedAt: current.updated_at ?? undefined,
    patch: {
      approved_at: new Date().toISOString(),
      approved_by: params.actorId,
    },
  })

  // Audit log
  await logActivity({
    studioId: params.studioId,
    action: 'booking_request.approved',
    entityType: 'booking_request',
    entityId: params.requestId,
    actorId: params.actorId,
    description: 'Solicitud aprobada',
    beforeState: { status: 'pending_review' },
    afterState: { status: 'approved' },
  })

  // Notificación in-app al actor (confirmación suave) + al resto del staff
  await notify({
    studioId: params.studioId,
    type: 'booking_approved',
    title: 'Solicitud aprobada',
    body: 'El cliente recibirá un email con los próximos pasos.',
    actionUrl: `/bookings/${params.requestId}`,
    relatedEntityType: 'booking_request',
    relatedEntityId: params.requestId,
  })

  // Auto-bloqueo provisional en la agenda. No se confirma hasta que la
  // booking pase a 'scheduled'. Si no tenemos event_time concreto,
  // bloqueamos todo el día (operador puede refinarlo después).
  try {
    const startEnd = computeBookingTimeRange(current)
    await createProvisionalBlockForBooking({
      studioId: params.studioId,
      bookingRequestId: params.requestId,
      startsAtIso: startEnd.startsAtIso,
      endsAtIso: startEnd.endsAtIso,
      title: `Reserva: ${current.client_name ?? 'cliente'}`,
      notes: 'Bloqueo automático al aprobar solicitud',
      createdBy: params.actorId,
    })
  } catch (err) {
    console.error('[approveBookingRequest] createProvisionalBlock failed', err)
  }

  // Auto-generación del bundle Pixieset-style: cliente + proyecto + 2 facturas
  // + contrato draft. Best-effort: si falla (p.ej. falta plantilla de
  // contrato), la aprobación sigue válida y el operador puede crear el
  // cliente manualmente desde el CRM.
  let conversionBundle: Awaited<
    ReturnType<typeof convertBookingToClientBundle>
  > = null
  try {
    conversionBundle = await convertBookingToClientBundle({
      studioId: params.studioId,
      requestId: params.requestId,
      actorId: params.actorId,
      row: current,
    })
    if (conversionBundle) {
      await logActivity({
        studioId: params.studioId,
        action: 'booking_request.converted',
        entityType: 'booking_request',
        entityId: params.requestId,
        actorId: params.actorId,
        description: `Cliente, proyecto, contrato y 2 facturas generados desde la solicitud`,
        metadata: {
          client_id: conversionBundle.clientId,
          project_id: conversionBundle.projectId,
          contract_id: conversionBundle.contractId,
          invoice1_id: conversionBundle.invoice1Id,
          invoice2_id: conversionBundle.invoice2Id,
        },
      })

      // Google Calendar sync (best-effort). Si el studio conectó Google,
      // crea el evento al aprobar la solicitud. Si no, no pasa nada.
      await syncProjectById(params.studioId, conversionBundle.projectId).catch(
        () => {},
      )
    }
  } catch (err) {
    console.error('[approveBookingRequest] convertBookingToClientBundle failed', err)
  }

  // Auto-crear form_responses ligados al paquete (si hay form_templates
  // vinculados vía package_forms). Best-effort.
  try {
    const forms = await createFormResponsesForBooking({
      studioId: params.studioId,
      bookingRequestId: params.requestId,
      packageId: current.package_id,
      clientEmail: current.client_email,
      actorId: params.actorId,
    })
    if (forms.length > 0) {
      console.log(
        `[approveBookingRequest] generados ${forms.length} form(s) para booking ${params.requestId}`,
      )
    }
  } catch (err) {
    console.error('[approveBookingRequest] createFormResponsesForBooking failed', err)
  }

  // Resolver URL de firma si tenemos contrato recién creado.
  let contractSignUrl: string | null = null
  if (conversionBundle) {
    try {
      const svc = createSupabaseServiceClient()
      const { data: contractRow } = await svc
        .from('contracts')
        .select('signing_token')
        .eq('id', conversionBundle.contractId)
        .maybeSingle()
      if (contractRow?.signing_token) {
        contractSignUrl = buildContractSignUrl(contractRow.signing_token)
      }
    } catch (err) {
      console.error(
        '[approveBookingRequest] fetch contract signing_token failed',
        err,
      )
    }
  }

  // Enqueue email al cliente (best-effort)
  try {
    const ctx = await loadContextForEmail(params.studioId, params.requestId)
    if (ctx) {
      const { subject, html } = renderBookingApprovedForClient({
        studioName: ctx.studio.name,
        primaryColor: ctx.studio.primary_color ?? '#111827',
        clientName: ctx.request.client_name,
        packageName: ctx.packageName,
        eventDate: ctx.request.event_date,
        depositAmount: ctx.request.pricing_snapshot?.deposit_amount ?? null,
        depositCurrency: ctx.request.pricing_snapshot?.currency ?? null,
        reserveDueInDays:
          ctx.request.pricing_snapshot?.reserve_due_in_days ?? null,
        replyToEmail: ctx.studio.email,
        contractSignUrl,
      })
      await enqueueEmail({
        studioId: params.studioId,
        toEmail: ctx.request.client_email,
        toName: ctx.request.client_name,
        subject,
        bodyHtml: html,
        replyTo: ctx.studio.email ?? null,
        templateSlug: 'booking_approved_for_client',
        relatedEntityType: 'booking_request',
        relatedEntityId: params.requestId,
      })
    }
  } catch (err) {
    console.error('[approveBookingRequest] enqueue client email failed', err)
  }

  return transitioned
}

export async function rejectBookingRequest(params: {
  studioId: string
  requestId: string
  actorId: string
  reason?: string
}) {
  const transitioned = await bookingRequestsRepo.transition({
    id: params.requestId,
    from: 'pending_review',
    to: 'rejected',
    patch: {
      rejected_at: new Date().toISOString(),
      rejected_by: params.actorId,
      rejection_reason: params.reason ?? null,
    },
  })

  // Audit log
  await logActivity({
    studioId: params.studioId,
    action: 'booking_request.rejected',
    entityType: 'booking_request',
    entityId: params.requestId,
    actorId: params.actorId,
    description: params.reason
      ? `Solicitud rechazada: ${params.reason}`
      : 'Solicitud rechazada',
    beforeState: { status: 'pending_review' },
    afterState: { status: 'rejected' },
    metadata: { reason: params.reason ?? null },
  })

  // Notificación in-app
  await notify({
    studioId: params.studioId,
    type: 'booking_rejected',
    title: 'Solicitud rechazada',
    body: params.reason
      ? `Motivo: ${params.reason}`
      : 'Se envió un email al cliente.',
    actionUrl: `/bookings/${params.requestId}`,
    relatedEntityType: 'booking_request',
    relatedEntityId: params.requestId,
  })

  // Defensiva: por si ya había un bloque (p.ej. al rechazar tras aprobar
  // y luego revertir), lo quitamos.
  try {
    await removeBlockForBooking({
      studioId: params.studioId,
      bookingRequestId: params.requestId,
    })
  } catch (err) {
    console.error('[rejectBookingRequest] removeBlock failed', err)
  }

  // Enqueue email al cliente con motivo
  try {
    const ctx = await loadContextForEmail(params.studioId, params.requestId)
    if (ctx) {
      const { subject, html } = renderBookingRejectedForClient({
        studioName: ctx.studio.name,
        primaryColor: ctx.studio.primary_color ?? '#111827',
        clientName: ctx.request.client_name,
        packageName: ctx.packageName,
        eventDate: ctx.request.event_date,
        reason: params.reason ?? null,
      })
      await enqueueEmail({
        studioId: params.studioId,
        toEmail: ctx.request.client_email,
        toName: ctx.request.client_name,
        subject,
        bodyHtml: html,
        replyTo: ctx.studio.email ?? null,
        templateSlug: 'booking_rejected_for_client',
        relatedEntityType: 'booking_request',
        relatedEntityId: params.requestId,
      })
    }
  } catch (err) {
    console.error('[rejectBookingRequest] enqueue client email failed', err)
  }

  return transitioned
}

export async function cancelBookingRequest(params: {
  studioId: string
  requestId: string
  actorId: string
  reason?: string
  fromStatus: BookingRequestStatus
}) {
  const transitioned = await bookingRequestsRepo.transition({
    id: params.requestId,
    from: params.fromStatus,
    to: 'cancelled',
    patch: {
      cancelled_at: new Date().toISOString(),
      cancelled_by: params.actorId,
      cancellation_reason: params.reason ?? null,
    },
  })

  // Audit log
  await logActivity({
    studioId: params.studioId,
    action: 'booking_request.cancelled',
    entityType: 'booking_request',
    entityId: params.requestId,
    actorId: params.actorId,
    description: params.reason
      ? `Cancelada: ${params.reason}`
      : 'Solicitud cancelada',
    beforeState: { status: params.fromStatus },
    afterState: { status: 'cancelled' },
    metadata: { reason: params.reason ?? null },
  })

  // Notificación in-app
  await notify({
    studioId: params.studioId,
    type: 'session_cancelled',
    title: 'Solicitud cancelada',
    body: params.reason ? `Motivo: ${params.reason}` : null,
    actionUrl: `/bookings/${params.requestId}`,
    relatedEntityType: 'booking_request',
    relatedEntityId: params.requestId,
  })

  // Liberar la agenda: quitar el bloque ligado a esta booking (si existe)
  try {
    await removeBlockForBooking({
      studioId: params.studioId,
      bookingRequestId: params.requestId,
    })
  } catch (err) {
    console.error('[cancelBookingRequest] removeBlock failed', err)
  }

  return transitioned
}
