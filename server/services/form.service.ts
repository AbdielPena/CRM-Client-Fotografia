import 'server-only'

import type { Json } from '@/types/supabase'
import { formTemplatesRepo, formResponsesRepo } from '@/server/repositories'
import { createSupabaseServerClient, createSupabasePublicClient } from '@/server/supabase/server'
import { createSupabaseServiceClient } from '@/server/supabase/service'
import {
  assertFormSchema,
  validateFormData,
  type FormSchema,
} from '@/lib/forms/types'
import { throwServiceError } from '@/lib/utils/api-error'
import { logActivity } from './activity.service'
import { notify } from './notification.service'
import {
  enqueueEmail,
  renderFormInvitationForClient,
} from './email.service'

// ----------------------------------------------------------------------------
// Templates (admin)
// ----------------------------------------------------------------------------

export async function createFormTemplate(params: {
  studioId: string
  actorId: string
  name: string
  description?: string | null
  schema: FormSchema
  isDefault?: boolean
}) {
  assertFormSchema(params.schema)

  // Si este es default, unset del anterior default (best-effort).
  if (params.isDefault) {
    const svc = createSupabaseServiceClient()
    await svc
      .from('form_templates')
      .update({ is_default: false })
      .eq('studio_id', params.studioId)
      .eq('is_default', true)
      .is('deleted_at', null)
  }

  const template = await formTemplatesRepo.create({
    studio_id: params.studioId,
    name: params.name,
    description: params.description ?? null,
    schema: params.schema as unknown as Json,
    is_default: params.isDefault ?? false,
    is_active: true,
    created_by: params.actorId ?? null,
  })

  await logActivity({
    studioId: params.studioId,
    actorId: params.actorId,
    entityType: 'form_template',
    entityId: template.id,
    action: 'form_template.created',
    metadata: { name: params.name },
  })

  return template
}

export async function updateFormTemplate(params: {
  studioId: string
  actorId: string
  templateId: string
  name?: string
  description?: string | null
  schema?: FormSchema
  isActive?: boolean
  isDefault?: boolean
}) {
  const existing = await formTemplatesRepo.findById(params.templateId)
  if (!existing || existing.studio_id !== params.studioId) {
    throw new Error('FORM_TEMPLATE_NOT_FOUND')
  }

  if (params.schema) assertFormSchema(params.schema)

  if (params.isDefault) {
    const svc = createSupabaseServiceClient()
    await svc
      .from('form_templates')
      .update({ is_default: false })
      .eq('studio_id', params.studioId)
      .eq('is_default', true)
      .neq('id', params.templateId)
      .is('deleted_at', null)
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (params.name !== undefined) patch.name = params.name
  if (params.description !== undefined) patch.description = params.description
  if (params.schema !== undefined) patch.schema = params.schema
  if (params.isActive !== undefined) patch.is_active = params.isActive
  if (params.isDefault !== undefined) patch.is_default = params.isDefault

  const updated = await formTemplatesRepo.update(params.templateId, patch)

  await logActivity({
    studioId: params.studioId,
    actorId: params.actorId,
    entityType: 'form_template',
    entityId: params.templateId,
    action: 'form_template.updated',
    metadata: patch,
  })

  return updated
}

export async function deleteFormTemplate(params: {
  studioId: string
  actorId: string
  templateId: string
}) {
  const existing = await formTemplatesRepo.findById(params.templateId)
  if (!existing || existing.studio_id !== params.studioId) {
    throw new Error('FORM_TEMPLATE_NOT_FOUND')
  }
  await formTemplatesRepo.softDelete(params.templateId)
  await logActivity({
    studioId: params.studioId,
    actorId: params.actorId,
    entityType: 'form_template',
    entityId: params.templateId,
    action: 'form_template.deleted',
  })
}

export async function listFormTemplates(studioId: string) {
  return formTemplatesRepo.listForStudio(studioId)
}

// ----------------------------------------------------------------------------
// Package ↔ Template links
// ----------------------------------------------------------------------------

/**
 * Devuelve los package_id que tienen ligado este template (sólo del studio).
 */
export async function listPackagesLinkedToTemplate(params: {
  studioId: string
  templateId: string
}): Promise<string[]> {
  const svc = createSupabaseServerClient()
  const { data, error } = await svc
    .from('package_forms')
    .select('package_id')
    .eq('studio_id', params.studioId)
    .eq('form_template_id', params.templateId)
  if (error) throwServiceError("FORM_OP_FAILED", error)
  return (data as Array<{ package_id: string }> | null ?? []).map((r) => r.package_id)
}

/**
 * Reemplaza atómicamente el set de paquetes ligados a un template.
 * Inserta faltantes, borra los que ya no aplican. No toca otras filas.
 */
export async function setPackagesLinkedToTemplate(params: {
  studioId: string
  actorId: string
  templateId: string
  packageIds: string[]
}) {
  const svc = createSupabaseServerClient()

  // Leer estado actual
  const { data: current, error: readErr } = await svc
    .from('package_forms')
    .select('id, package_id')
    .eq('studio_id', params.studioId)
    .eq('form_template_id', params.templateId)
  if (readErr) throwServiceError("FORM_PACKAGES_READ_FAILED", readErr)

  const currentRows =
    (current as Array<{ id: string; package_id: string }> | null) ?? []
  const currentIds = new Set(currentRows.map((r) => r.package_id))
  const targetIds = new Set(params.packageIds)

  const toAdd = [...targetIds].filter((id) => !currentIds.has(id))
  const toRemove = currentRows
    .filter((r) => !targetIds.has(r.package_id))
    .map((r) => r.id)

  if (toAdd.length > 0) {
    const { error: insErr } = await svc.from('package_forms').insert(
      toAdd.map((packageId, i) => ({
        studio_id: params.studioId,
        package_id: packageId,
        form_template_id: params.templateId,
        is_required: false,
        sort_order: i,
      })),
    )
    if (insErr) throwServiceError("FORM_PACKAGES_INSERT_FAILED", insErr)
  }

  if (toRemove.length > 0) {
    const { error: delErr } = await svc
      .from('package_forms')
      .delete()
      .in('id', toRemove)
    if (delErr) throwServiceError("FORM_PACKAGES_DELETE_FAILED", delErr)
  }

  await logActivity({
    studioId: params.studioId,
    actorId: params.actorId,
    entityType: 'form_template',
    entityId: params.templateId,
    action: 'form_template.packages_updated',
    metadata: {
      added: toAdd.length,
      removed: toRemove.length,
      total: targetIds.size,
    },
  })
}

// ----------------------------------------------------------------------------
// Responses — lectura para admin
// ----------------------------------------------------------------------------

export type FormResponseSummary = {
  id: string
  status: string
  templateId: string | null
  templateName: string
  accessToken: string
  data: Record<string, unknown>
  schema: FormSchema
  completedAt: string | null
  firstViewedAt: string | null
  expiresAt: string | null
  updatedAt: string
  createdAt: string
}

/**
 * Lista los form_responses asociados a un booking request, con el nombre
 * de la plantilla resuelto (nullable si fue eliminada).
 */
export async function listFormResponsesForBooking(params: {
  studioId: string
  bookingRequestId: string
}): Promise<FormResponseSummary[]> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('form_responses')
    .select(
      `id, status, form_template_id, access_token, data, schema_snapshot,
       completed_at, first_viewed_at, expires_at, updated_at, created_at,
       template:form_templates(name)`,
    )
    .eq('studio_id', params.studioId)
    .eq('booking_request_id', params.bookingRequestId)
    .order('created_at', { ascending: true })

  if (error) throwServiceError("FORM_OP_FAILED", error)

  type Row = {
    id: string
    status: string
    form_template_id: string | null
    access_token: string
    data: Record<string, unknown> | null
    schema_snapshot: unknown
    completed_at: string | null
    first_viewed_at: string | null
    expires_at: string | null
    updated_at: string
    created_at: string
    template: { name: string } | { name: string }[] | null
  }

  return ((data as Row[] | null) ?? []).map((r) => {
    const templateName = Array.isArray(r.template)
      ? (r.template[0]?.name ?? '(plantilla eliminada)')
      : (r.template?.name ?? '(plantilla eliminada)')
    return {
      id: r.id,
      status: r.status,
      templateId: r.form_template_id,
      templateName,
      accessToken: r.access_token,
      data: (r.data ?? {}) as Record<string, unknown>,
      schema: (r.schema_snapshot as unknown as FormSchema) ?? {
        version: 1,
        fields: [],
      },
      completedAt: r.completed_at,
      firstViewedAt: r.first_viewed_at,
      expiresAt: r.expires_at,
      updatedAt: r.updated_at,
      createdAt: r.created_at,
    }
  })
}

/**
 * Versión para proyectos: lista todos los form_responses asociados a un
 * proyecto, ya sea directamente (project_id) o indirectamente vía el
 * booking_request del que nació el proyecto.
 */
export async function listFormResponsesForProject(params: {
  studioId: string
  projectId: string
  bookingRequestId?: string | null
}): Promise<FormResponseSummary[]> {
  const supabase = createSupabaseServerClient()
  const orFilter = params.bookingRequestId
    ? `project_id.eq.${params.projectId},booking_request_id.eq.${params.bookingRequestId}`
    : `project_id.eq.${params.projectId}`

  const { data, error } = await supabase
    .from('form_responses')
    .select(
      `id, status, form_template_id, access_token, data, schema_snapshot,
       completed_at, first_viewed_at, expires_at, updated_at, created_at,
       template:form_templates(name)`,
    )
    .eq('studio_id', params.studioId)
    .or(orFilter)
    .order('created_at', { ascending: true })

  if (error) throwServiceError("FORM_OP_FAILED", error)

  type Row = {
    id: string
    status: string
    form_template_id: string | null
    access_token: string
    data: Record<string, unknown> | null
    schema_snapshot: unknown
    completed_at: string | null
    first_viewed_at: string | null
    expires_at: string | null
    updated_at: string
    created_at: string
    template: { name: string } | { name: string }[] | null
  }

  return ((data as Row[] | null) ?? []).map((r) => {
    const templateName = Array.isArray(r.template)
      ? (r.template[0]?.name ?? '(plantilla eliminada)')
      : (r.template?.name ?? '(plantilla eliminada)')
    return {
      id: r.id,
      status: r.status,
      templateId: r.form_template_id,
      templateName,
      accessToken: r.access_token,
      data: (r.data ?? {}) as Record<string, unknown>,
      schema: (r.schema_snapshot as unknown as FormSchema) ?? {
        version: 1,
        fields: [],
      },
      completedAt: r.completed_at,
      firstViewedAt: r.first_viewed_at,
      expiresAt: r.expires_at,
      updatedAt: r.updated_at,
      createdAt: r.created_at,
    }
  })
}

// ----------------------------------------------------------------------------
// Responses — creación desde booking
// ----------------------------------------------------------------------------

/**
 * Crea un form_response en estado 'pending' para cada form template que
 * esté ligado al paquete vía package_forms. Idempotente: si ya existen
 * responses para este booking, no recrea.
 *
 * Usa service-role porque el caller suele ser un flujo server-side
 * autenticado pero el INSERT sobre form_responses requiere coincidencia
 * de studio_id vía RLS; el service simplifica.
 */
export async function createFormResponsesForBooking(params: {
  studioId: string
  bookingRequestId: string
  /** Proyecto recién creado en la aprobación; liga el form al proyecto desde el inicio. */
  projectId?: string | null
  packageId: string
  clientEmail: string
  actorId?: string | null
}): Promise<Array<{ id: string; templateId: string; accessToken: string }>> {
  const svc = createSupabaseServiceClient()

  // Fuente 1: formulario vinculado DIRECTAMENTE al paquete
  // (packages.default_form_template_id — lo que el owner elige en /settings/packages).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pkgRow } = await svc
    .from('packages')
    .select('default_form_template_id')
    .eq('id', params.packageId)
    .eq('studio_id', params.studioId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const defaultFormId = (pkgRow as any)?.default_form_template_id as
    | string
    | null

  // Fuente 2: links package_forms (vinculación M-N alternativa, compat)
  const { data: pkgLinks, error: linksErr } = await svc
    .from('package_forms')
    .select(
      `id, is_required, sort_order, form_template_id,
       template:form_templates(id, name, schema, is_active, deleted_at)`,
    )
    .eq('studio_id', params.studioId)
    .eq('package_id', params.packageId)
    .order('sort_order', { ascending: true })

  if (linksErr) throwServiceError("FORM_BOOKING_LINKS_FAILED", linksErr)

  // Combinar ambas fuentes en una lista de links (default primero), sin duplicar
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const links: any[] = []
  const seenTemplateIds = new Set<string>()

  if (defaultFormId) {
    const { data: defTmpl } = await svc
      .from('form_templates')
      .select('id, name, schema, is_active, deleted_at')
      .eq('id', defaultFormId)
      .eq('studio_id', params.studioId)
      .maybeSingle()
    if (defTmpl) {
      links.push({ form_template_id: defaultFormId, template: defTmpl })
      seenTemplateIds.add(defaultFormId)
    }
  }
  for (const l of (pkgLinks as unknown as any[]) ?? []) {
    if (seenTemplateIds.has(l.form_template_id)) continue
    seenTemplateIds.add(l.form_template_id)
    links.push(l)
  }

  if (links.length === 0) return []

  // Ya existentes para idempotencia
  const existing = await formResponsesRepo.listByBookingRequest(
    params.bookingRequestId,
    { elevated: true },
  )
  const existingTemplateIds = new Set(existing.map((r) => r.form_template_id))

  const results: Array<{ id: string; templateId: string; accessToken: string }> = []

  for (const link of links as unknown as Array<{
    form_template_id: string
    template: {
      id: string
      name: string
      schema: unknown
      is_active: boolean
      deleted_at: string | null
    } | null
  }>) {
    if (!link.template) continue
    if (!link.template.is_active || link.template.deleted_at) continue
    if (existingTemplateIds.has(link.form_template_id)) continue

    const response = await formResponsesRepo.create(
      {
        studio_id: params.studioId,
        form_template_id: link.form_template_id,
        booking_request_id: params.bookingRequestId,
        project_id: params.projectId ?? null,
        client_email: params.clientEmail,
        // 'sent' (no 'pending'): el form ya está disponible para el cliente.
        // El state machine permite sent→completed; pending→completed es ilegal,
        // lo que rompía el submit en el wizard embebido.
        status: 'sent',
        data: {},
        schema_snapshot: link.template.schema as unknown as Json,
      },
      { elevated: true },
    )
    results.push({
      id: response.id,
      templateId: link.form_template_id,
      accessToken: response.access_token,
    })
  }

  if (results.length > 0) {
    await logActivity({
      studioId: params.studioId,
      actorId: params.actorId ?? undefined,
      entityType: 'booking_request',
      entityId: params.bookingRequestId,
      action: 'forms.auto_created',
      description: `${results.length} formulario(s) generados desde el paquete`,
      metadata: { count: results.length, template_ids: results.map((r) => r.templateId) },
      elevated: true,
    })
  }

  return results
}

/** Marca el form como 'sent' (el link ya se envió al cliente). */
export async function markFormAsSent(params: {
  studioId: string
  actorId?: string
  responseId: string
}) {
  const response = await formResponsesRepo.findById(params.responseId, {
    elevated: true,
  })
  if (!response || response.studio_id !== params.studioId) {
    throw new Error('FORM_RESPONSE_NOT_FOUND')
  }
  if (response.status !== 'pending') return response

  return formResponsesRepo.transition({
    id: params.responseId,
    from: 'pending',
    to: 'sent',
    patch: {
      sent_at: new Date().toISOString(),
    },
    opts: { elevated: true },
  })
}

/**
 * Envía el formulario al cliente: encola el email con el link público y
 * transiciona el status `pending` → `sent`. Idempotente para forms que ya
 * estén en `sent`, `in_progress` o `completed` — en esos casos sólo
 * re-envía el email.
 */
export async function sendFormToClient(params: {
  studioId: string
  actorId: string
  responseId: string
  appBaseUrl: string
}): Promise<{ emailQueueId: string; status: string }> {
  const svc = createSupabaseServiceClient()

  const { data, error } = await svc
    .from('form_responses')
    .select(
      `id, status, access_token, client_email, form_template_id, booking_request_id,
       template:form_templates(name),
       booking:booking_requests(client_name)`,
    )
    .eq('id', params.responseId)
    .eq('studio_id', params.studioId)
    .maybeSingle()
  if (error) throwServiceError("FORM_OP_FAILED", error)
  if (!data) throw new Error('FORM_RESPONSE_NOT_FOUND')

  const row = data as {
    id: string
    status: string
    access_token: string
    client_email: string | null
    form_template_id: string
    booking_request_id: string | null
    template: { name: string } | { name: string }[] | null
    booking: { client_name: string } | { client_name: string }[] | null
  }

  if (!row.client_email) {
    throw new Error('El formulario no tiene email del cliente asignado')
  }

  const clientName = Array.isArray(row.booking)
    ? (row.booking[0]?.client_name ?? 'hola')
    : (row.booking?.client_name ?? 'hola')

  const { data: studio, error: studioErr } = await svc
    .from('studios')
    .select('name, email, primary_color')
    .eq('id', params.studioId)
    .maybeSingle()
  if (studioErr) throwServiceError("STUDIO_LOOKUP_FAILED", studioErr)
  if (!studio) throw new Error('STUDIO_NOT_FOUND')

  const studioRow = studio as {
    name: string
    email: string | null
    primary_color: string | null
  }

  const templateName = Array.isArray(row.template)
    ? (row.template[0]?.name ?? 'Formulario')
    : (row.template?.name ?? 'Formulario')

  const formUrl = `${params.appBaseUrl.replace(/\/$/, '')}/f/${row.access_token}`

  const { subject, html } = renderFormInvitationForClient({
    studioName: studioRow.name,
    primaryColor: studioRow.primary_color ?? '#111827',
    clientName,
    formTitle: templateName,
    formUrl,
    replyToEmail: studioRow.email,
  })

  const emailQueueId = await enqueueEmail({
    studioId: params.studioId,
    toEmail: row.client_email,
    toName: clientName,
    subject,
    bodyHtml: html,
    replyTo: studioRow.email,
    templateSlug: 'form_invitation',
    relatedEntityType: 'form_response',
    relatedEntityId: row.id,
    metadata: { template: templateName, formUrl },
  })

  // Transición pending → sent (solo si todavía estamos en pending).
  let finalStatus = row.status
  if (row.status === 'pending') {
    await formResponsesRepo.transition({
      id: row.id,
      from: 'pending',
      to: 'sent',
      patch: { sent_at: new Date().toISOString() },
      opts: { elevated: true },
    })
    finalStatus = 'sent'
  }

  await logActivity({
    studioId: params.studioId,
    actorId: params.actorId,
    entityType: 'form_response',
    entityId: row.id,
    action: 'form_response.sent',
    metadata: { email_queue_id: emailQueueId, resend: row.status !== 'pending' },
  })

  return { emailQueueId, status: finalStatus }
}

// ----------------------------------------------------------------------------
// Public — ver y submit
// ----------------------------------------------------------------------------

/**
 * Carga un form_response por access_token. Usa el cliente público con
 * header `x-public-token` para que la RLS lo permita (asume que existe
 * policy correspondiente).
 */
export async function getPublicFormResponse(accessToken: string): Promise<{
  response: {
    id: string
    status: string
    data: Record<string, unknown>
    schema_snapshot: unknown
    completed_at: string | null
    expires_at: string | null
  }
  template: { name: string; description: string | null }
  studio: { id: string; name: string; primary_color: string | null } | null
} | null> {
  const supabase = createSupabasePublicClient(accessToken)

  const { data: response, error } = await supabase
    .from('form_responses')
    .select(
      `id, status, data, schema_snapshot, completed_at, expires_at, studio_id,
       template:form_templates(name, description)`,
    )
    .eq('access_token', accessToken)
    .maybeSingle()

  if (error) throwServiceError("FORM_OP_FAILED", error)
  if (!response) return null

  const templateRaw = (response as { template: unknown }).template
  const template = Array.isArray(templateRaw) ? templateRaw[0] : templateRaw

  // Si no está ya en estado viewed, marcamos first_viewed_at (best-effort)
  // Esto no cambia status (el state machine lo hace al submit).
  if (
    (response.status === 'sent' || response.status === 'pending') &&
    !(response as { first_viewed_at?: string | null }).first_viewed_at
  ) {
    try {
      await supabase
        .from('form_responses')
        .update({ first_viewed_at: new Date().toISOString() })
        .eq('access_token', accessToken)
    } catch {
      // no-op
    }
  }

  // Resolvemos studio con service (público no lo ve) — best-effort
  let studio: { id: string; name: string; primary_color: string | null } | null =
    null
  try {
    const svc = createSupabaseServiceClient()
    const { data: s } = await svc
      .from('studios')
      .select('id, name, primary_color')
      .eq('id', response.studio_id as string)
      .maybeSingle()
    if (s) studio = s as unknown as typeof studio
  } catch {
    // no-op
  }

  return {
    response: {
      id: response.id as string,
      status: response.status as string,
      data: (response.data as Record<string, unknown>) ?? {},
      schema_snapshot: response.schema_snapshot,
      completed_at: response.completed_at as string | null,
      expires_at: response.expires_at as string | null,
    },
    template: {
      name: (template as { name?: string } | null)?.name ?? 'Formulario',
      description:
        (template as { description?: string | null } | null)?.description ?? null,
    },
    studio,
  }
}

/**
 * Guarda un avance parcial del form (no lo completa).
 * Requiere estado 'sent' o 'in_progress'; transiciona a 'in_progress'.
 */
export async function saveFormProgress(
  accessToken: string,
  data: Record<string, unknown>,
) {
  const supabase = createSupabasePublicClient(accessToken)

  const { data: response, error } = await supabase
    .from('form_responses')
    .select('id, status, schema_snapshot')
    .eq('access_token', accessToken)
    .maybeSingle()
  if (error) throwServiceError("FORM_OP_FAILED", error)
  if (!response) throw new Error('Formulario no encontrado')
  if (response.status === 'completed' || response.status === 'expired') {
    throw new Error('Este formulario ya no acepta cambios')
  }

  const { error: updateErr } = await supabase
    .from('form_responses')
    .update({
      status: 'in_progress',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: data as any,
      updated_at: new Date().toISOString(),
    })
    .eq('access_token', accessToken)
    .in('status', ['sent', 'in_progress'])

  if (updateErr) throwServiceError("FORM_UPDATE_FAILED", updateErr)
}

/** Submit final del formulario. Valida contra schema_snapshot. */
export async function submitPublicForm(
  accessToken: string,
  data: Record<string, unknown>,
) {
  const supabase = createSupabasePublicClient(accessToken)

  const { data: response, error } = await supabase
    .from('form_responses')
    .select('id, studio_id, status, schema_snapshot, booking_request_id, form_template_id')
    .eq('access_token', accessToken)
    .maybeSingle()
  if (error) throwServiceError("FORM_OP_FAILED", error)
  if (!response) throw new Error('Formulario no encontrado')
  if (response.status === 'completed') {
    throw new Error('Este formulario ya fue enviado')
  }
  if (response.status === 'expired') {
    throw new Error('Este formulario ha expirado')
  }

  const schema = response.schema_snapshot as unknown as FormSchema
  const errors = validateFormData(schema, data)
  if (Object.keys(errors).length > 0) {
    const err = new Error('VALIDATION_ERROR') as Error & {
      fieldErrors: Record<string, string>
    }
    err.fieldErrors = errors
    throw err
  }

  const now = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('form_responses')
    .update({
      status: 'completed',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: data as any,
      completed_at: now,
      updated_at: now,
    })
    .eq('access_token', accessToken)
    .in('status', ['sent', 'in_progress', 'pending'])

  if (updateErr) throwServiceError("FORM_UPDATE_FAILED", updateErr)

  // Notificar al studio (best-effort)
  try {
    await notify({
      studioId: response.studio_id as string,
      type: 'form_completed',
      title: 'Formulario completado',
      body: 'El cliente envió un formulario',
      relatedEntityType: 'form_response',
      relatedEntityId: response.id as string,
      actionUrl: `/forms/responses/${response.id as string}`,
    })
  } catch {
    // no-op
  }
}
