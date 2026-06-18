import 'server-only'

import {
  createSupabaseServerClient,
  createSupabasePublicClient,
} from '@/server/supabase/server'
import { createSupabaseServiceClient } from '@/server/supabase/service'
import { clientsRepo } from '@/server/repositories'
import type { CreateLeadInput, UpdateLeadInput } from '@/lib/validations/lead.schema'
import { throwServiceError } from '@/lib/utils/api-error'
import { logActivity } from './activity.service'
import { notify } from './notification.service'
import { enqueueEmail, renderLeadReceivedForStudio } from './email.service'
import { getEmailBranding } from './email-template.service'

export type LeadRow = Awaited<ReturnType<typeof getLeadById>>

// ----------------------------------------------------------------------------
// Listado + detalle
// ----------------------------------------------------------------------------

export async function getLeads(
  studioId: string,
  opts: {
    status?: string
    search?: string
    page?: number
    pageSize?: number
  } = {},
) {
  const { status, search, page = 1, pageSize = 50 } = opts
  const supabase = createSupabaseServerClient()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('leads')
    .select('*', { count: 'exact' })
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (status) query = query.eq('status', status as any)
  if (search && search.trim()) {
    const term = `%${search.trim()}%`
    query = query.or(`name.ilike.${term},email.ilike.${term},phone.ilike.${term}`)
  }

  const { data, count, error } = await query
  if (error) throwServiceError("LEAD_OP_FAILED", error)

  const total = count ?? 0
  return {
    items: data ?? [],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  }
}

export async function getLeadsByStatus(studioId: string) {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) throwServiceError("LEAD_OP_FAILED", error)

  const grouped: Record<string, typeof data> = {}
  for (const lead of data ?? []) {
    const key = String(lead.status)
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(lead)
  }
  return grouped
}

export async function getLeadById(studioId: string, leadId: string) {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('leads')
    .select(
      `
        *,
        notes(*)
      `,
    )
    .eq('id', leadId)
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throwServiceError("LEAD_OP_FAILED", error)
  if (!data) return null

  return {
    ...data,
    notes: [...((data.notes ?? []) as unknown as Array<Record<string, unknown>>)]
      .filter((n) => (n.deleted_at ?? null) === null)
      .sort((a, b) => {
        const ad = a.created_at ? new Date(a.created_at as string).getTime() : 0
        const bd = b.created_at ? new Date(b.created_at as string).getTime() : 0
        return bd - ad
      }),
  }
}

// ----------------------------------------------------------------------------
// Crear / actualizar / borrar / mover estado
// ----------------------------------------------------------------------------

export async function createLead(
  studioId: string,
  actorId: string,
  data: CreateLeadInput,
) {
  const supabase = createSupabaseServerClient()
  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      studio_id: studioId,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      source: data.source || 'manual',
      status: 'new',
      event_type: data.eventType || null,
      event_date: data.eventDate
        ? new Date(data.eventDate).toISOString().slice(0, 10)
        : null,
      budget: data.budget ?? null,
      currency: (data.currency || 'DOP').toUpperCase(),
      notes: data.notes || null,
    })
    .select('*')
    .single()

  if (error) throwServiceError("LEAD_OP_FAILED", error)

  await logActivity({
    studioId,
    actorId,
    entityType: 'lead',
    entityId: lead.id,
    action: 'lead.created',
    metadata: { name: lead.name },
  })

  return lead
}

export async function updateLead(
  studioId: string,
  actorId: string,
  leadId: string,
  data: UpdateLeadInput,
) {
  const supabase = createSupabaseServerClient()

  // Ownership check
  const { data: existing } = await supabase
    .from('leads')
    .select('id, studio_id')
    .eq('id', leadId)
    .maybeSingle()
  if (!existing || existing.studio_id !== studioId) {
    throw new Error('LEAD_NOT_FOUND')
  }

  const patch: Record<string, unknown> = {}
  if (data.name !== undefined) patch.name = data.name
  if (data.email !== undefined) patch.email = data.email || null
  if (data.phone !== undefined) patch.phone = data.phone || null
  if (data.source !== undefined) patch.source = data.source
  if (data.status !== undefined) patch.status = data.status
  if (data.eventType !== undefined) patch.event_type = data.eventType || null
  if (data.eventDate !== undefined) {
    patch.event_date = data.eventDate
      ? new Date(data.eventDate).toISOString().slice(0, 10)
      : null
  }
  if (data.budget !== undefined) patch.budget = data.budget ?? null
  if (data.notes !== undefined) patch.notes = data.notes || null

  const { data: lead, error } = await supabase
    .from('leads')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq('id', leadId)
    .select('*')
    .single()

  if (error) throwServiceError("LEAD_OP_FAILED", error)

  await logActivity({
    studioId,
    actorId,
    entityType: 'lead',
    entityId: lead.id,
    action: 'lead.updated',
    metadata: data as Record<string, unknown>,
  })

  return lead
}

export async function updateLeadStatus(
  studioId: string,
  actorId: string,
  leadId: string,
  status: string,
) {
  const supabase = createSupabaseServerClient()

  const { data: existing } = await supabase
    .from('leads')
    .select('id, studio_id')
    .eq('id', leadId)
    .maybeSingle()
  if (!existing || existing.studio_id !== studioId) {
    throw new Error('LEAD_NOT_FOUND')
  }

  const { data: lead, error } = await supabase
    .from('leads')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ status: status as any })
    .eq('id', leadId)
    .select('*')
    .single()

  if (error) throwServiceError("LEAD_OP_FAILED", error)

  await logActivity({
    studioId,
    actorId,
    entityType: 'lead',
    entityId: lead.id,
    action: 'lead.status_changed',
    metadata: { status },
  })

  return lead
}

export async function deleteLead(
  studioId: string,
  actorId: string,
  leadId: string,
) {
  const supabase = createSupabaseServerClient()

  const { data: existing } = await supabase
    .from('leads')
    .select('id, studio_id')
    .eq('id', leadId)
    .maybeSingle()
  if (!existing || existing.studio_id !== studioId) {
    throw new Error('LEAD_NOT_FOUND')
  }

  const { error } = await supabase
    .from('leads')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', leadId)

  if (error) throwServiceError("LEAD_OP_FAILED", error)

  await logActivity({
    studioId,
    actorId,
    entityType: 'lead',
    entityId: leadId,
    action: 'lead.deleted',
  })
}

export async function convertLeadToClient(
  studioId: string,
  actorId: string,
  leadId: string,
) {
  const supabase = createSupabaseServerClient()

  const { data: lead, error: findError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .maybeSingle()

  if (findError) throwServiceError("LEAD_FIND_FAILED", findError)
  if (!lead) throw new Error('Lead no encontrado')

  const client = await clientsRepo.create({
    studio_id: studioId,
    name: lead.name,
    email: lead.email ?? null,
    phone: lead.phone ?? null,
    source: lead.source,
  })
  // actorId disponible por si se requiere auditoría en tablas adicionales
  void actorId

  const { error: updateError } = await supabase
    .from('leads')
    .update({
      status: 'won',
      converted_at: new Date().toISOString(),
      converted_to_client_id: client.id,
    })
    .eq('id', leadId)

  if (updateError) throwServiceError("LEAD_UPDATE_FAILED", updateError)

  await logActivity({
    studioId,
    actorId,
    entityType: 'lead',
    entityId: leadId,
    action: 'lead.converted',
    metadata: { clientId: client.id },
  })

  return client
}

// ----------------------------------------------------------------------------
// Lead público (formulario de contacto del sitio web — abbypixel.com)
// ----------------------------------------------------------------------------

/** URL base del dashboard para los links en el email al estudio. */
function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://my.abbypixel.com'
  )
}

/** Resuelve el studio por slug usando la vista pública (anon, respeta RLS). */
export async function resolveStudioBySlug(slug: string) {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('studios_public')
    .select('id, name, slug, email, primary_color')
    .eq('slug', slug)
    .maybeSingle()
  return (data as {
    id: string
    name: string
    slug: string
    email: string | null
    primary_color: string | null
  } | null)
}

export type PublicLeadInput = {
  studioSlug: string
  name: string
  email?: string | null
  phone?: string | null
  /** Categoría / tipo de evento que eligió el cliente. */
  category?: string | null
  /** Fecha tentativa en texto libre ("Junio 2026"). No es una fecha estricta. */
  tentativeDate?: string | null
  message?: string | null
}

export type PublicLeadResult =
  | { status: 'ok'; leadId: string }
  | { status: 'not_found' }

/**
 * Crea un lead desde el formulario público de contacto del sitio web.
 * - Inserta con service-role (no hay sesión en el contexto público).
 * - source='website', status='new' → entra al pipeline de /leads del CRM.
 * - Avisa al estudio: notificación in-app + email (ambos best-effort).
 * No envía WhatsApp proactivo (dependería de plantillas Meta aprobadas); el
 * cliente continúa por WhatsApp desde la propia web (botón wa.me).
 */
export async function createPublicLead(
  input: PublicLeadInput,
  _meta: { ip?: string; userAgent?: string },
): Promise<PublicLeadResult> {
  const studio = await resolveStudioBySlug(input.studioSlug)
  if (!studio) return { status: 'not_found' }

  // La fecha tentativa es texto libre → va a notas, no a la columna DATE.
  const notesParts: string[] = []
  if (input.message?.trim()) notesParts.push(input.message.trim())
  if (input.tentativeDate?.trim()) {
    notesParts.push(`Fecha tentativa: ${input.tentativeDate.trim()}`)
  }
  const notes = notesParts.join('\n\n') || null

  const service = createSupabaseServiceClient()
  const { data: lead, error } = await service
    .from('leads')
    .insert({
      studio_id: studio.id,
      name: input.name.trim(),
      email: input.email?.trim().toLowerCase() || null,
      phone: input.phone?.trim() || null,
      source: 'website',
      status: 'new',
      event_type: input.category?.trim() || null,
      referral: 'Formulario de contacto (abbypixel.com)',
      notes,
    })
    .select('id, name')
    .single()

  if (error) throwServiceError('LEAD_OP_FAILED', error)

  await notifyStudioOfNewLead({
    studio,
    lead,
    source: 'website',
    clientEmail: input.email ?? null,
    clientPhone: input.phone ?? null,
    category: input.category ?? null,
    tentativeDate: input.tentativeDate ?? null,
    message: input.message ?? null,
  })

  return { status: 'ok', leadId: lead.id }
}

/**
 * Aviso al estudio cuando entra un lead público (formulario de contacto o un
 * inquiry form): auditoría + notificación in-app + email con el marco luxury.
 * Todo best-effort: nunca tumba el flujo público.
 */
export async function notifyStudioOfNewLead(opts: {
  studio: { id: string; name: string; email: string | null; primary_color?: string | null }
  lead: { id: string; name: string }
  source: string
  clientEmail?: string | null
  clientPhone?: string | null
  category?: string | null
  tentativeDate?: string | null
  message?: string | null
  formName?: string | null
}): Promise<void> {
  const { studio, lead } = opts

  await logActivity({
    studioId: studio.id,
    action: 'lead.created',
    entityType: 'lead',
    entityId: lead.id,
    actorType: 'client',
    actorName: lead.name,
    description: opts.formName
      ? `Lead recibido desde el formulario "${opts.formName}"`
      : 'Lead recibido desde el formulario de contacto del sitio web',
    metadata: { source: opts.source, category: opts.category ?? null },
  })

  await notify({
    studioId: studio.id,
    type: 'system',
    title: `🌱 Nuevo contacto del sitio web — ${lead.name}`,
    body: opts.category
      ? `Le interesa: ${opts.category}`
      : opts.formName ?? null,
    actionUrl: `/leads/${lead.id}`,
    relatedEntityType: 'lead',
    relatedEntityId: lead.id,
    metadata: { source: opts.source },
  })

  try {
    if (studio.email) {
      const branding = await getEmailBranding(studio.id)
      const { subject, html } = renderLeadReceivedForStudio({
        studioName: studio.name,
        primaryColor: studio.primary_color ?? undefined,
        branding,
        clientName: lead.name,
        clientEmail: opts.clientEmail ?? null,
        clientPhone: opts.clientPhone ?? null,
        category: opts.category ?? null,
        tentativeDate: opts.tentativeDate ?? null,
        message: opts.message ?? null,
        adminLink: `${appBaseUrl()}/leads/${lead.id}`,
      })
      await enqueueEmail({
        studioId: studio.id,
        toEmail: studio.email,
        toName: studio.name,
        subject,
        bodyHtml: html,
        relatedEntityType: 'lead',
        relatedEntityId: lead.id,
        templateSlug: 'lead_received_studio',
      })
    }
  } catch (e) {
    console.error('[notifyStudioOfNewLead] email al estudio falló', e)
  }
}
