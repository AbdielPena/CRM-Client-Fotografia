import 'server-only'

import { untypedServer, untypedService } from '@/server/supabase/untyped'
import { throwServiceError } from '@/lib/utils/api-error'
import { logActivity } from './activity.service'
import { notifyStudioOfNewLead } from './lead.service'
import {
  assertFormSchema,
  validateFormData,
  type FormSchema,
} from '@/lib/forms/types'
import type {
  CreateInquiryFormInput,
  UpdateInquiryFormInput,
} from '@/lib/validations/inquiry-form.schema'

export type InquiryFormRow = {
  id: string
  studio_id: string
  name: string
  description: string | null
  schema: FormSchema
  default_category: string | null
  submit_label: string
  success_message: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// ──────────────────────────────────────────────────────────────────────
// CRUD admin (untypedServer = sesión del usuario, respeta RLS de tenant)
// ──────────────────────────────────────────────────────────────────────

export async function listInquiryForms(studioId: string): Promise<InquiryFormRow[]> {
  const sb = untypedServer()
  const { data, error } = await sb
    .from('inquiry_forms')
    .select('*')
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) {
    if (error.code === '42501') return []
    throwServiceError('INQUIRY_FORM_OP_FAILED', error)
  }
  return (data ?? []) as InquiryFormRow[]
}

export async function getInquiryFormById(
  studioId: string,
  id: string,
): Promise<InquiryFormRow | null> {
  const sb = untypedServer()
  const { data, error } = await sb
    .from('inquiry_forms')
    .select('*')
    .eq('id', id)
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throwServiceError('INQUIRY_FORM_OP_FAILED', error)
  return (data ?? null) as InquiryFormRow | null
}

function parseSchema(raw: string): FormSchema {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('El formato de los campos es inválido')
  }
  assertFormSchema(parsed)
  return parsed as FormSchema
}

export async function createInquiryForm(
  studioId: string,
  actorId: string,
  data: CreateInquiryFormInput,
): Promise<{ id: string }> {
  const schema = parseSchema(data.schema)
  const sb = untypedServer()
  const { data: row, error } = await sb
    .from('inquiry_forms')
    .insert({
      studio_id: studioId,
      name: data.name,
      description: data.description || null,
      schema,
      default_category: data.defaultCategory || null,
      submit_label: data.submitLabel?.trim() || 'Enviar',
      success_message:
        data.successMessage?.trim() || 'Gracias, te contactaremos muy pronto.',
      is_active: data.isActive ?? true,
      created_by: actorId,
    })
    .select('id')
    .single()
  if (error) throwServiceError('INQUIRY_FORM_OP_FAILED', error)
  const created = row as { id: string }
  await logActivity({
    studioId,
    actorId,
    entityType: 'inquiry_form',
    entityId: created.id,
    action: 'inquiry_form.created',
    metadata: { name: data.name },
  })
  return created
}

export async function updateInquiryForm(
  studioId: string,
  actorId: string,
  id: string,
  data: UpdateInquiryFormInput,
): Promise<void> {
  const existing = await getInquiryFormById(studioId, id)
  if (!existing) throw new Error('INQUIRY_FORM_NOT_FOUND')

  const patch: Record<string, unknown> = {}
  if (data.name !== undefined) patch.name = data.name
  if (data.description !== undefined) patch.description = data.description || null
  if (data.defaultCategory !== undefined)
    patch.default_category = data.defaultCategory || null
  if (data.submitLabel !== undefined)
    patch.submit_label = data.submitLabel?.trim() || 'Enviar'
  if (data.successMessage !== undefined)
    patch.success_message =
      data.successMessage?.trim() || 'Gracias, te contactaremos muy pronto.'
  if (data.isActive !== undefined) patch.is_active = data.isActive
  if (data.schema !== undefined) patch.schema = parseSchema(data.schema)

  const sb = untypedServer()
  const { error } = await sb
    .from('inquiry_forms')
    .update(patch)
    .eq('id', id)
    .eq('studio_id', studioId)
  if (error) throwServiceError('INQUIRY_FORM_OP_FAILED', error)
  await logActivity({
    studioId,
    actorId,
    entityType: 'inquiry_form',
    entityId: id,
    action: 'inquiry_form.updated',
  })
}

export async function deleteInquiryForm(
  studioId: string,
  actorId: string,
  id: string,
): Promise<void> {
  const sb = untypedServer()
  const { error } = await sb
    .from('inquiry_forms')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id)
    .eq('studio_id', studioId)
  if (error) throwServiceError('INQUIRY_FORM_OP_FAILED', error)
  await logActivity({
    studioId,
    actorId,
    entityType: 'inquiry_form',
    entityId: id,
    action: 'inquiry_form.deleted',
  })
}

// ──────────────────────────────────────────────────────────────────────
// Público (embed): leer definición + recibir envío → crear lead
// ──────────────────────────────────────────────────────────────────────

export type PublicInquiryForm = {
  id: string
  studioId: string
  name: string
  description: string | null
  schema: FormSchema
  submitLabel: string
  successMessage: string
  defaultCategory: string | null
}

export async function getPublicInquiryForm(
  formId: string,
): Promise<PublicInquiryForm | null> {
  // service-role: el endpoint controla qué campos expone (solo los públicos).
  const sb = untypedService()
  const { data } = await sb
    .from('inquiry_forms')
    .select(
      'id, studio_id, name, description, schema, default_category, submit_label, success_message',
    )
    .eq('id', formId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle()
  if (!data) return null
  const r = data as {
    id: string
    studio_id: string
    name: string
    description: string | null
    schema: FormSchema
    default_category: string | null
    submit_label: string
    success_message: string
  }
  return {
    id: r.id,
    studioId: r.studio_id,
    name: r.name,
    description: r.description,
    schema: r.schema,
    submitLabel: r.submit_label,
    successMessage: r.success_message,
    defaultCategory: r.default_category,
  }
}

// Claves reconocidas que mapean a columnas del lead.
const NAME_KEYS = ['name', 'nombre', 'nombre_completo', 'full_name']
const EMAIL_KEYS = ['email', 'correo', 'e_mail']
const PHONE_KEYS = ['phone', 'telefono', 'whatsapp', 'tel', 'celular', 'movil']
const CATEGORY_KEYS = ['category', 'categoria', 'event_type', 'tipo_evento', 'interes']

function pick(data: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = data[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

export type SubmitInquiryResult =
  | { status: 'ok'; leadId: string }
  | { status: 'not_found' }
  | { status: 'invalid'; errors: Record<string, string> }

export async function submitPublicInquiryForm(
  formId: string,
  data: Record<string, unknown>,
  _meta: { ip?: string; userAgent?: string },
): Promise<SubmitInquiryResult> {
  const form = await getPublicInquiryForm(formId)
  if (!form) return { status: 'not_found' }

  const errors = validateFormData(form.schema, data)
  if (Object.keys(errors).length > 0) return { status: 'invalid', errors }

  const name =
    pick(data, NAME_KEYS) || pick(data, EMAIL_KEYS) || 'Contacto sin nombre'
  const email = pick(data, EMAIL_KEYS)
  const phone = pick(data, PHONE_KEYS)
  const category = pick(data, CATEGORY_KEYS) || form.defaultCategory

  // Campos no mapeados a columnas → notas legibles.
  const usedKeys = new Set([
    ...NAME_KEYS,
    ...EMAIL_KEYS,
    ...PHONE_KEYS,
    ...CATEGORY_KEYS,
  ])
  const lines: string[] = []
  for (const field of form.schema.fields) {
    if (field.type === 'explanation') continue
    if (usedKeys.has(field.key)) continue
    const raw = data[field.key]
    if (raw === undefined || raw === null || raw === '') continue
    const val =
      field.type === 'checkbox' ? (raw === true ? 'Sí' : 'No') : String(raw)
    lines.push(`${field.label}: ${val}`)
  }
  const notes = lines.join('\n') || null

  const svc = untypedService()

  const { data: studioRow } = await svc
    .from('studios')
    .select('id, name, email, primary_color')
    .eq('id', form.studioId)
    .maybeSingle()
  const studio = (studioRow as {
    id: string
    name: string
    email: string | null
    primary_color: string | null
  } | null) ?? {
    id: form.studioId,
    name: 'Estudio',
    email: null,
    primary_color: null,
  }

  const { data: leadRow, error } = await svc
    .from('leads')
    .insert({
      studio_id: form.studioId,
      name,
      email: email?.toLowerCase() || null,
      phone: phone || null,
      source: 'inquiry_form',
      status: 'new',
      event_type: category || null,
      inquiry_form_id: form.id,
      referral: `Formulario: ${form.name}`,
      notes,
    })
    .select('id, name')
    .single()
  if (error) throwServiceError('LEAD_OP_FAILED', error)
  const lead = leadRow as { id: string; name: string }

  await notifyStudioOfNewLead({
    studio,
    lead,
    source: 'inquiry_form',
    clientEmail: email,
    clientPhone: phone,
    category,
    message: notes,
    formName: form.name,
  })

  return { status: 'ok', leadId: lead.id }
}
