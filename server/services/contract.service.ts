import 'server-only'

import { contractsRepo, contractTemplatesRepo } from '@/server/repositories'
import { createSupabaseServerClient } from '@/server/supabase/server'
import { createSupabaseServiceClient } from '@/server/supabase/service'
import type { CreateContractInput } from '@/lib/validations/contract.schema'
import type { Database } from '@/types/supabase'
import { logActivity } from './activity.service'

/** Replace {{variable}} placeholders in contract body with actual data */
export function interpolateContract(
  body: string,
  vars: Record<string, string>,
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

// ----------------------------------------------------------------------------
// Listado + detalle
// ----------------------------------------------------------------------------

export async function getContracts(
  studioId: string,
  opts: { status?: string; page?: number; pageSize?: number } = {},
) {
  const { status, page = 1, pageSize = 50 } = opts
  const supabase = createSupabaseServerClient()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('contracts')
    .select(
      `
        *,
        project:projects(id, name, client:clients(id, name))
      `,
      { count: 'exact' },
    )
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (status) query = query.eq('status', status as any)

  const { data, count, error } = await query
  if (error) throw new Error(error.message)

  // Aplanar: cliente va embebido vía project.client (no hay FK directa
  // contracts→clients). Exponemos `client` a nivel raíz para compat con UI.
  const items = (data ?? []).map((c: Record<string, unknown>) => {
    const project = pickOne(c.project) as Record<string, unknown> | null
    const client = project ? pickOne(project.client) : null
    return { ...c, project, client }
  })

  const total = count ?? 0
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  }
}

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  if (Array.isArray(v)) return (v[0] as T | undefined) ?? null
  return v
}

export async function getContractById(studioId: string, contractId: string) {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('contracts')
    .select(
      `
        *,
        project:projects(id, name, event_type, event_date, client:clients(*)),
        template:contract_templates(id, name)
      `,
    )
    .eq('id', contractId)
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  // Aplanar client al nivel raíz (no hay FK contracts→clients)
  const project = pickOne((data as Record<string, unknown>).project) as Record<string, unknown> | null
  const client = project ? pickOne(project.client) : null
  return { ...(data as Record<string, unknown>), project, client }
}

export async function getContractTemplates(studioId: string) {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('contract_templates')
    .select('*')
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

// ----------------------------------------------------------------------------
// Crear / enviar / firmar / anular / borrar
// ----------------------------------------------------------------------------

/**
 * Valida que el proyecto exista, sea del studio, no esté en trash y
 * que su cliente exista y NO esté en trash. Lanza error semántico.
 */
async function assertProjectAndClientActive(
  studioId: string,
  projectId: string,
  context: string,
): Promise<void> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('projects')
    .select('id, deleted_at, client:clients(id, deleted_at)')
    .eq('id', projectId)
    .eq('studio_id', studioId)
    .maybeSingle()
  if (error) throw new Error(`[${context}] ${error.message}`)
  if (!data) throw new Error('PROJECT_NOT_FOUND')
  if (data.deleted_at) throw new Error('PROJECT_TRASHED')
  const client = Array.isArray(data.client) ? data.client[0] : data.client
  if (!client) throw new Error('CLIENT_NOT_FOUND')
  if (client.deleted_at) throw new Error('CLIENT_TRASHED')
}

export async function createContract(
  studioId: string,
  actorId: string,
  data: CreateContractInput,
) {
  // Integridad: el proyecto debe existir, ser del studio, estar activo, y
  // su cliente debe existir y NO estar en trash.
  if (!data.projectId) throw new Error('PROJECT_REQUIRED')
  await assertProjectAndClientActive(studioId, data.projectId, 'createContract')

  const contract = await contractsRepo.create({
    studio_id: studioId,
    project_id: data.projectId,
    template_id: data.templateId || null,
    title: data.title,
    body_html: data.body,
    status: 'draft',
    expires_at: data.expiresAt ? new Date(data.expiresAt).toISOString() : null,
    created_by: actorId || null,
  })

  await logActivity({
    studioId,
    actorId,
    entityType: 'contract',
    entityId: contract.id,
    action: 'contract.created',
    metadata: { title: data.title },
  })

  return contract
}

export async function sendContract(
  studioId: string,
  actorId: string,
  contractId: string,
) {
  const existing = await contractsRepo.findById(contractId)
  if (!existing || existing.studio_id !== studioId) {
    throw new Error('CONTRACT_NOT_FOUND')
  }

  // signing_token ya se genera al crear el contrato (default en el schema).
  // Aquí solo transicionamos draft → sent.
  const contract = await contractsRepo.transition({
    id: contractId,
    from: 'draft',
    to: 'sent',
    patch: { sent_at: new Date().toISOString() },
  })

  await logActivity({
    studioId,
    actorId,
    entityType: 'contract',
    entityId: contractId,
    action: 'contract.sent',
  })

  // Email al cliente con link de firma (best-effort)
  try {
    void (async () => {
      const { emailContractSent } = await import('./contract-emails.service')
      await emailContractSent(contractId)
    })()
  } catch (err) {
    console.error('[sendContract] email failed', err)
  }

  return contract
}

/**
 * Llamado desde la página pública de firma (/c/[token]).
 * Usa el client público con x-public-token para que las RLS lo dejen pasar.
 */
/**
 * Firma del contrato por el cliente desde la página pública /sign/[token].
 * Permite firmar desde cualquier estado no-terminal (draft, sent, viewed) —
 * el contrato está disponible si tiene token, no fue firmado/anulado/expirado.
 */
export async function signContract(
  signingToken: string,
  signerName: string,
  signerEmail?: string,
  signerIp?: string,
  signerUserAgent?: string,
  signatureImageDataUrl?: string,
) {
  const supabase = createSupabaseServiceClient()

  const { data: contract, error: findError } = await supabase
    .from('contracts')
    .select('*')
    .eq('signing_token', signingToken)
    .is('deleted_at', null)
    .maybeSingle()

  if (findError) throw new Error(findError.message)
  if (!contract) throw new Error('Contrato inválido o ya firmado')
  if (contract.status === 'signed') throw new Error('Este contrato ya fue firmado')

  // Estados terminales que sí impiden firmar
  if (
    contract.status === 'voided' ||
    contract.status === 'cancelled' ||
    contract.status === 'expired'
  ) {
    throw new Error('Este contrato fue anulado o cancelado')
  }
  if (contract.expires_at && new Date() > new Date(contract.expires_at)) {
    throw new Error('El enlace de firma ha expirado')
  }

  const now = new Date().toISOString()

  // Guardar la imagen de firma como data URL (suficientemente compacta para
  // canvas pequeños). Para storage real, guardar en bucket `contract-signatures`.
  const signatureUrl = signatureImageDataUrl ?? null

  // Hash de evidencia: hash del payload firmable + firma + timestamp
  const evidence = JSON.stringify({
    contractId: contract.id,
    bodyLen: (contract.body_html ?? '').length,
    signedAt: now,
    name: signerName,
    email: signerEmail ?? null,
    ip: signerIp ?? null,
    userAgent: signerUserAgent ?? null,
    hasSignatureImage: !!signatureUrl,
  })
  const { createHash } = await import('node:crypto')
  const evidenceHash = createHash('sha256').update(evidence).digest('hex')

  // UPDATE atómico: solo si el contrato sigue sin firmar.
  // Evita race condition: dos firmas concurrentes ya no pueden sobrescribirse —
  // la segunda recibe 0 filas afectadas y vemos contract_already_signed.
  const { data: signed, error: updateError } = await supabase
    .from('contracts')
    .update({
      status: 'signed',
      signed_at: now,
      signed_name: signerName,
      signed_email: signerEmail ?? null,
      signed_ip: signerIp ?? null,
      signed_user_agent: signerUserAgent ?? null,
      signature_image_url: signatureUrl,
      evidence_hash: evidenceHash,
      body_snapshot: contract.body_html ?? null,
    })
    .eq('id', contract.id)
    .neq('status', 'signed')
    .neq('status', 'voided')
    .neq('status', 'cancelled')
    .neq('status', 'expired')
    .select('*')
    .maybeSingle()

  if (updateError) throw new Error(updateError.message)
  if (!signed) {
    // Otra request (o doble click) ya firmó este contrato. Idempotente.
    throw new Error('Este contrato ya fue firmado')
  }

  // Notificar al studio + email al cliente con copia (best-effort)
  try {
    void (async () => {
      const { onContractSigned } = await import('./contract-post-sign.service')
      await onContractSigned(signed.id as string)
    })()
  } catch (err) {
    console.error('[signContract] post-sign hook failed', err)
  }

  return signed
}

/**
 * Firma del estudio (admin) sobre un contrato.
 * Puede aplicarse antes o después de la firma del cliente.
 * Si la firma del studio existe en `studios.signature_image_url`, se reusa.
 */
export async function signContractByStudio(
  studioId: string,
  actorUserId: string,
  contractId: string,
  options?: { signatureImageDataUrl?: string; signedName?: string },
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { data: contract } = await supabase
    .from('contracts')
    .select('id, studio_id, studio_signed_at, status')
    .eq('id', contractId)
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!contract) throw new Error('Contrato no encontrado')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = contract as any
  if (c.studio_signed_at) {
    throw new Error('Este contrato ya tiene firma del estudio')
  }

  // Resolver firma: si viene en el body, úsala; sino usa la del studio guardada
  let signatureUrl = options?.signatureImageDataUrl ?? null
  let signedName = options?.signedName ?? null

  if (!signatureUrl || !signedName) {
    const { data: studio } = await supabase
      .from('studios')
      .select('name, signature_image_url')
      .eq('id', studioId)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = studio as any
    if (!signatureUrl) signatureUrl = (s?.signature_image_url as string | null) ?? null
    if (!signedName) signedName = (s?.name as string | null) ?? 'Estudio'
  }

  if (!signatureUrl) {
    throw new Error(
      'No hay firma del estudio guardada. Cargá una en Settings o pasá la firma manualmente.',
    )
  }

  const now = new Date().toISOString()
  // UPDATE atómico: solo si studio_signed_at sigue null. Si dos clicks
  // concurrentes intentan firmar, el segundo recibe 0 filas y rechazamos.
  const { data: updated, error } = await supabase
    .from('contracts')
    .update({
      studio_signed_at: now,
      studio_signed_by_user_id: actorUserId,
      studio_signed_name: signedName,
      studio_signature_image_url: signatureUrl,
    })
    .eq('id', contractId)
    .is('studio_signed_at', null)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!updated) throw new Error('Este contrato ya tiene firma del estudio')

  // Email final si ambas firmas presentes (best-effort)
  try {
    void (async () => {
      const { onContractSigned } = await import('./contract-post-sign.service')
      await onContractSigned(contractId)
    })()
  } catch (err) {
    console.error('[signContractByStudio] post-sign hook failed', err)
  }
}

/** Marca el contrato como "viewed" (best-effort) cuando el cliente abre la página. */
export async function markContractViewed(
  signingToken: string,
  ip?: string,
  userAgent?: string,
): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { data: contract } = await supabase
    .from('contracts')
    .select('id, status, viewed_at, expires_at')
    .eq('signing_token', signingToken)
    .is('deleted_at', null)
    .maybeSingle()
  if (!contract) return
  // Solo actualizar si está en estados intermedios y no fue visto antes
  if (contract.status === 'signed' || contract.status === 'voided') return
  if (contract.viewed_at) return
  // Bloquear si el contrato expiró (consistencia con signContract)
  if (contract.expires_at && new Date() > new Date(contract.expires_at)) return
  type ContractsUpdate = Database['public']['Tables']['contracts']['Update']
  const update: ContractsUpdate = {
    viewed_at: new Date().toISOString(),
    viewed_ip: ip ?? null,
    viewed_user_agent: userAgent ?? null,
  }
  if (contract.status === 'draft' || contract.status === 'sent') {
    update.status = 'viewed'
  }
  await supabase.from('contracts').update(update).eq('id', contract.id)

  // Notificar al studio que el cliente abrió el contrato (best-effort)
  try {
    void (async () => {
      const { emailContractViewed } = await import('./contract-emails.service')
      await emailContractViewed(contract.id as string)
    })()
  } catch (err) {
    console.error('[markContractViewed] email failed', err)
  }
}

export async function voidContract(
  studioId: string,
  actorId: string,
  contractId: string,
) {
  const existing = await contractsRepo.findById(contractId)
  if (!existing || existing.studio_id !== studioId) {
    throw new Error('CONTRACT_NOT_FOUND')
  }

  // 'voided' es un estado nativo del enum — válido como destino desde
  // draft / sent / viewed / signed. Si ya está en un terminal no-voided
  // (expired/cancelled), solo soft-delete sin tocar status.
  if (existing.status !== 'voided' && existing.status !== 'expired' && existing.status !== 'cancelled') {
    await contractsRepo.transition({
      id: contractId,
      from: existing.status,
      to: 'voided',
    })
  }
  await contractsRepo.update(contractId, {
    deleted_at: new Date().toISOString(),
  })

  await logActivity({
    studioId,
    actorId,
    entityType: 'contract',
    entityId: contractId,
    action: 'contract.voided',
  })
}

export async function deleteContract(
  studioId: string,
  actorId: string,
  contractId: string,
) {
  const existing = await contractsRepo.findById(contractId)
  if (!existing || existing.studio_id !== studioId) {
    throw new Error('CONTRACT_NOT_FOUND')
  }

  await contractsRepo.update(contractId, {
    deleted_at: new Date().toISOString(),
  })

  await logActivity({
    studioId,
    actorId,
    entityType: 'contract',
    entityId: contractId,
    action: 'contract.deleted',
  })
}

// ----------------------------------------------------------------------------
// Plantillas de contrato — admin CRUD
// ----------------------------------------------------------------------------

export async function listContractTemplates(studioId: string) {
  return contractTemplatesRepo.listForStudio(studioId)
}

export async function getContractTemplateById(studioId: string, id: string) {
  const tpl = await contractTemplatesRepo.findById(id)
  if (!tpl || tpl.studio_id !== studioId) return null
  return tpl
}

export type ContractTemplateInput = {
  name: string
  description?: string | null
  bodyHtml: string
  defaultValidityDays?: number | null
  isDefault?: boolean
  isActive?: boolean
}

export async function createContractTemplate(params: {
  studioId: string
  actorId: string
  data: ContractTemplateInput
}) {
  const { studioId, actorId, data } = params

  if (!data.name.trim()) throw new Error('El nombre es requerido')
  if (!data.bodyHtml.trim()) throw new Error('El cuerpo del contrato no puede estar vacío')

  // La DB tiene un índice único parcial `(studio_id) WHERE is_default AND
  // deleted_at IS NULL`. Si el usuario marca esta plantilla como default,
  // limpiamos la bandera en las otras ANTES de insertar, no después.
  if (data.isDefault) {
    await contractTemplatesRepo.clearDefault(studioId, null)
  }

  const tpl = await contractTemplatesRepo.create({
    studio_id: studioId,
    name: data.name.trim(),
    description: data.description?.trim() || null,
    body_html: data.bodyHtml,
    ...(data.defaultValidityDays != null
      ? { default_validity_days: data.defaultValidityDays }
      : {}),
    is_default: data.isDefault ?? false,
    is_active: data.isActive ?? true,
    created_by: actorId || null,
  })

  await logActivity({
    studioId,
    actorId,
    entityType: 'contract_template',
    entityId: tpl.id,
    action: 'contract_template.created',
    metadata: { name: tpl.name },
  })

  return tpl
}

export async function updateContractTemplate(params: {
  studioId: string
  actorId: string
  id: string
  patch: Partial<ContractTemplateInput>
}) {
  const { studioId, actorId, id, patch } = params

  const existing = await contractTemplatesRepo.findById(id)
  if (!existing || existing.studio_id !== studioId) {
    throw new Error('CONTRACT_TEMPLATE_NOT_FOUND')
  }

  const update: Partial<Parameters<typeof contractTemplatesRepo.update>[1]> = {}
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) throw new Error('El nombre es requerido')
    update.name = name
  }
  if (patch.description !== undefined) {
    update.description = patch.description?.trim() || null
  }
  if (patch.bodyHtml !== undefined) {
    if (!patch.bodyHtml.trim()) throw new Error('El cuerpo del contrato no puede estar vacío')
    update.body_html = patch.bodyHtml
  }
  if (patch.defaultValidityDays !== undefined && patch.defaultValidityDays !== null) {
    update.default_validity_days = patch.defaultValidityDays
  }
  if (patch.isDefault !== undefined) update.is_default = patch.isDefault
  if (patch.isActive !== undefined) update.is_active = patch.isActive

  // Mismo patrón que en create: limpiar default ANTES para no colisionar
  // con el índice único parcial.
  if (update.is_default === true) {
    await contractTemplatesRepo.clearDefault(studioId, id)
  }

  const tpl = await contractTemplatesRepo.update(id, update)

  await logActivity({
    studioId,
    actorId,
    entityType: 'contract_template',
    entityId: id,
    action: 'contract_template.updated',
    metadata: { fields: Object.keys(update) },
  })

  return tpl
}

export async function deleteContractTemplate(params: {
  studioId: string
  actorId: string
  id: string
}) {
  const { studioId, actorId, id } = params
  const existing = await contractTemplatesRepo.findById(id)
  if (!existing || existing.studio_id !== studioId) {
    throw new Error('CONTRACT_TEMPLATE_NOT_FOUND')
  }

  await contractTemplatesRepo.softDelete(id)

  await logActivity({
    studioId,
    actorId,
    entityType: 'contract_template',
    entityId: id,
    action: 'contract_template.deleted',
  })
}
