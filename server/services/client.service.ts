import 'server-only'

import { createSupabaseServerClient } from '@/server/supabase/server'
import { createSupabaseServiceClient } from '@/server/supabase/service'
import { clientsRepo } from '@/server/repositories'
import { throwServiceError } from '@/lib/utils/api-error'
import { logActivity } from './activity.service'
import type { Database } from '@/types/supabase'
import type {
  CreateClientInput,
  CreateClientWithBookingInput,
  UpdateClientInput,
} from '@/lib/validations/client.schema'

// ----------------------------------------------------------------------------
// Tipos snake_case ↔ camelCase mapping helpers
// ----------------------------------------------------------------------------

type ClientSource = Database['public']['Enums']['lead_source']

type ClientRow = Database['public']['Tables']['clients']['Row']

// ----------------------------------------------------------------------------
// Listado + detalle
// ----------------------------------------------------------------------------

export async function getClients(
  studioId: string,
  opts: { search?: string; page?: number; pageSize?: number } = {},
) {
  const { search, page = 1, pageSize = 50 } = opts
  const supabase = createSupabaseServerClient()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('clients')
    .select('*, projects:projects(id, deleted_at)', { count: 'exact' })
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .range(from, to)

  if (search && search.trim()) {
    const term = `%${search.trim()}%`
    query = query.or(
      `name.ilike.${term},email.ilike.${term},phone.ilike.${term}`,
    )
  }

  const { data, count, error } = await query
  if (error) throwServiceError("CLIENT_OP_FAILED", error)

  const items = (data ?? []).map((c: ClientRow & { projects?: { deleted_at: string | null }[] }) => ({
    ...c,
    _count: {
      projects: (c.projects ?? []).filter((p) => !p.deleted_at).length,
    },
  }))

  const total = count ?? 0
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  }
}

export async function getClientById(studioId: string, clientId: string) {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('clients')
    .select(
      `
        *,
        projects:projects(
          id, name, event_type, status, event_date, location, total_amount,
          currency, created_at, deleted_at
        ),
        notes_rel:notes!notes_client_id_fkey(id, content, created_at, deleted_at)
      `,
    )
    .eq('id', clientId)
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throwServiceError("CLIENT_OP_FAILED", error)
  if (!data) return null

  // Filtrar relaciones soft-deleted en cliente-side para respetar la semántica previa
  return {
    ...data,
    projects: (data.projects ?? []).filter(
      (p: { deleted_at: string | null }) => !p.deleted_at,
    ),
    notes_rel: (data.notes_rel ?? []).filter(
      (n: { deleted_at: string | null }) => !n.deleted_at,
    ),
  }
}

// ----------------------------------------------------------------------------
// Creación simple (conversión de leads, import, etc.)
// ----------------------------------------------------------------------------

export async function createClient(
  studioId: string,
  actorId: string,
  data: CreateClientInput,
) {
  const client = await clientsRepo.create({
    studio_id: studioId,
    name: data.name,
    email: data.email ?? null,
    phone: data.phone ?? null,
    source: (data.source ?? 'manual') as ClientSource,
    notes: data.notes ?? null,
    address: data.address ?? null,
    city: data.city ?? null,
    country: data.country ?? null,
    instagram_handle: data.instagramHandle ?? null,
    website_url: data.websiteUrl ?? null,
  })

  await logActivity({
    studioId,
    actorId,
    entityType: 'client',
    entityId: client.id,
    action: 'client.created',
    metadata: { name: client.name },
  })

  // Disparar automatizaciones + outbound webhook (best-effort, no bloquea)
  void (async () => {
    const payload = {
      name: client.name,
      email: client.email,
      source: client.source ?? null,
    }

    try {
      const { dispatchAutomationEvent } = await import('./automation.service')
      await dispatchAutomationEvent({
        studioId,
        event: 'client.created',
        entityType: 'client',
        entityId: client.id,
        payload,
      })
    } catch (err) {
      console.error('[client] automation dispatch failed:', err)
    }

    try {
      const { dispatchOutboundWebhook } = await import(
        './outbound-webhook.service'
      )
      await dispatchOutboundWebhook({
        studioId,
        eventType: 'client.created',
        payload,
        entityType: 'client',
        entityId: client.id,
      })
    } catch (err) {
      console.error('[client] outbound webhook failed:', err)
    }
  })()

  // Generar código de acceso al portal y enviárselo por email (best-effort).
  // No queremos bloquear la creación si el email falla.
  if (client.email) {
    void (async () => {
      try {
        const { ensureClientAccessCode } = await import('./client-portal.service')
        const code = await ensureClientAccessCode(studioId, client.id)
        const { sendClientPortalAccessEmail } = await import(
          './client-portal-email.service'
        )
        await sendClientPortalAccessEmail({
          studioId,
          clientId: client.id,
          clientName: client.name,
          clientEmail: client.email!,
          accessCode: code,
        })
      } catch (err) {
        console.error('[createClient] portal welcome failed', err)
      }
    })()
  }

  return client
}

// ----------------------------------------------------------------------------
// Flujo integral: cliente + proyecto + 2 facturas + contrato
// (delega en la RPC `create_client_with_booking` que corre en un solo tx)
// ----------------------------------------------------------------------------

export async function createClientWithBooking(
  studioId: string,
  _actorId: string,
  data: CreateClientWithBookingInput,
) {
  const supabase = createSupabaseServerClient()

  const payload = {
    name: data.name,
    email: data.email ?? null,
    phone: data.phone ?? null,
    source: data.source ?? 'manual',
    notes: data.notes ?? null,
    address: data.address ?? null,
    city: data.city ?? null,
    country: data.country ?? null,
    instagram_handle: data.instagramHandle ?? null,
    website_url: data.websiteUrl ?? null,
    package_id: data.packageId,
    event_type: data.eventType,
    event_date: data.eventDate,
    project_name: data.projectName ?? null,
    location: data.location ?? null,
    reserve_due_in_days: data.reserveDueInDays ?? null,
    // Si skipInvoices=true, la RPC crea solo cliente+proyecto+contrato.
    // La factura única se genera tras la firma del contrato (flujo de booking).
    skip_invoices: data.skipInvoices ?? false,
  }

  const { data: result, error } = await supabase.rpc(
    'create_client_with_booking',
    {
      p_studio_id: studioId,
      p_payload: payload,
    },
  )

  if (error) {
    console.error('[createClientWithBooking] rpc failed', error)
    throw mapRpcError(error)
  }

  return result as {
    client_id: string
    project_id: string
    invoice1_id: string | null
    invoice2_id: string | null
    invoice1_number: string | null
    invoice2_number: string | null
    contract_id: string
  }
}

// ----------------------------------------------------------------------------
// Update / Delete
// ----------------------------------------------------------------------------

export async function updateClient(
  studioId: string,
  actorId: string,
  clientId: string,
  data: UpdateClientInput,
) {
  const patch: Partial<ClientRow> = {}
  if (data.name !== undefined) patch.name = data.name
  if (data.email !== undefined) patch.email = data.email ?? null
  if (data.phone !== undefined) patch.phone = data.phone ?? null
  if (data.source !== undefined) patch.source = (data.source ?? null) as ClientSource | null
  if (data.notes !== undefined) patch.notes = data.notes ?? null
  if (data.address !== undefined) patch.address = data.address ?? null
  if (data.city !== undefined) patch.city = data.city ?? null
  if (data.country !== undefined) patch.country = data.country ?? null
  if (data.instagramHandle !== undefined)
    patch.instagram_handle = data.instagramHandle ?? null
  if (data.websiteUrl !== undefined) patch.website_url = data.websiteUrl ?? null

  // RLS ya garantiza tenant isolation por studio_id — pero validamos explícitamente
  // que el cliente pertenezca al studio antes de mutar, para emitir 404 claro.
  const existing = await clientsRepo.findById(clientId)
  if (!existing || existing.studio_id !== studioId) {
    throw new Error('CLIENT_NOT_FOUND')
  }
  const client = await clientsRepo.update(clientId, patch)

  await logActivity({
    studioId,
    actorId,
    entityType: 'client',
    entityId: client.id,
    action: 'client.updated',
    metadata: data as Record<string, unknown>,
  })

  return client
}

export async function deleteClient(
  studioId: string,
  actorId: string,
  clientId: string,
  reason?: string | null,
) {
  // Soft delete con cascada via RPC. El cliente y todas sus entidades
  // (proyectos, contratos, facturas, pagos, notas, galerías, bookings)
  // pasan al estado "trashed" (deleted_at = now()). Restaurable desde /trash.
  const supabase = createSupabaseServiceClient()
  // @ts-ignore - tipos generados por supabase pueden no incluir el nuevo arg
  const { error } = await supabase.rpc('cascade_delete_client', {
    p_client_id: clientId,
    p_studio_id: studioId,
    p_reason: reason ?? undefined,
  })

  if (error) {
    if (error.message?.includes('CLIENT_NOT_FOUND')) {
      throw new Error('CLIENT_NOT_FOUND')
    }
    throwServiceError("CLIENT_DELETE_FAILED", error, { studioId, clientId })
  }

  await logActivity({
    studioId,
    actorId,
    entityType: 'client',
    entityId: clientId,
    action: 'client.deleted',
    metadata: reason ? { reason } : undefined,
  })
}

// ----------------------------------------------------------------------------
// Trash module: restore + hard delete + listado
// ----------------------------------------------------------------------------

/**
 * Restaura un cliente del trash y todas sus entidades asociadas.
 * Reversa de cascade_delete_client.
 */
export async function restoreClient(
  studioId: string,
  actorId: string,
  clientId: string,
) {
  const supabase = createSupabaseServiceClient()
  // @ts-ignore - RPC nueva, tipos pueden no estar generados aun
  const { error } = await supabase.rpc('cascade_restore_client', {
    p_client_id: clientId,
    p_studio_id: studioId,
  })

  if (error) {
    if (error.message?.includes('CLIENT_NOT_TRASHED')) {
      throw new Error('CLIENT_NOT_TRASHED')
    }
    throwServiceError("CLIENT_RESTORE_FAILED", error, { studioId, clientId })
  }

  await logActivity({
    studioId,
    actorId,
    entityType: 'client',
    entityId: clientId,
    action: 'client.restored',
  })
}

/**
 * Elimina PERMANENTEMENTE un cliente del trash. Borra todas sus entidades
 * dependientes de la base de datos. Irreversible.
 * Solo debe llamarse desde /trash con doble confirmación.
 */
export async function permanentlyDeleteClient(
  studioId: string,
  actorId: string,
  clientId: string,
) {
  const supabase = createSupabaseServiceClient()
  // Capturamos snapshot del cliente antes para el audit log
  const { data: snapshot } = await supabase
    .from('clients')
    .select('id, name, email, phone, deleted_at')
    .eq('id', clientId)
    .eq('studio_id', studioId)
    .maybeSingle()

  // @ts-ignore - RPC nueva, tipos pueden no estar generados aun
  const { error } = await supabase.rpc('cascade_hard_delete_client', {
    p_client_id: clientId,
    p_studio_id: studioId,
  })

  if (error) {
    if (error.message?.includes('CLIENT_NOT_TRASHED')) {
      throw new Error('CLIENT_NOT_TRASHED')
    }
    throwServiceError("CLIENT_RESTORE_FAILED", error, { studioId, clientId })
  }

  await logActivity({
    studioId,
    actorId,
    entityType: 'client',
    entityId: clientId,
    action: 'client.purged',
    description: snapshot?.name ? `Eliminado permanente: ${snapshot.name}` : null,
    beforeState: snapshot ?? undefined,
  })
}

export type TrashedClient = {
  id: string
  name: string
  email: string | null
  phone: string | null
  deleted_at: string | null
  deletion_reason: string | null
  created_at: string
}

/**
 * Lista los clientes en trash (soft-deleted) del studio, paginado.
 */
export async function getTrashedClients(
  studioId: string,
  opts: { search?: string; page?: number; pageSize?: number } = {},
) {
  const { search, page = 1, pageSize = 50 } = opts
  const supabase = createSupabaseServerClient()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  // Select con string genérico — los tipos de supabase no incluyen
  // deletion_reason aún (columna recién agregada por migration).
  let query = supabase
    .from('clients')
    .select('*', { count: 'exact' })
    .eq('studio_id', studioId)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .range(from, to)

  if (search && search.trim()) {
    const term = `%${search.trim()}%`
    query = query.or(
      `name.ilike.${term},email.ilike.${term},phone.ilike.${term}`,
    )
  }

  const { data, count, error } = await query
  if (error) throwServiceError("CLIENT_OP_FAILED", error)

  // Cast explícito al tipo TrashedClient (deletion_reason no está en tipos generados)
  const items = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>
    return {
      id: r.id as string,
      name: r.name as string,
      email: (r.email as string | null) ?? null,
      phone: (r.phone as string | null) ?? null,
      deleted_at: (r.deleted_at as string | null) ?? null,
      deletion_reason: (r.deletion_reason as string | null) ?? null,
      created_at: r.created_at as string,
    } satisfies TrashedClient
  })

  return {
    items,
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
  }
}

// ----------------------------------------------------------------------------
// Error mapping
// ----------------------------------------------------------------------------

export class ClientCreationError extends Error {
  field: string
  constructor(message: string, field: string = '_form') {
    super(message)
    this.name = 'ClientCreationError'
    this.field = field
  }
}

function mapRpcError(err: { code?: string; message?: string }): ClientCreationError {
  const msg = err.message ?? ''

  if (msg.includes('PACKAGE_NOT_FOUND') || err.code === 'P0002') {
    return new ClientCreationError(
      'El paquete seleccionado no existe o no pertenece a este estudio.',
      'packageId',
    )
  }
  if (msg.includes('PACKAGE_INACTIVE')) {
    return new ClientCreationError(
      'El paquete seleccionado está inactivo. Actívalo o elige otro.',
      'packageId',
    )
  }
  if (msg.includes('NO_CONTRACT_TEMPLATE')) {
    return new ClientCreationError(
      'No hay plantillas de contrato configuradas. Crea al menos una en Ajustes → Contratos antes de registrar clientes.',
      'packageId',
    )
  }
  if (msg.includes('STUDIO_NOT_FOUND')) {
    return new ClientCreationError('Estudio no encontrado.', 'packageId')
  }
  if (msg.includes('FORBIDDEN')) {
    return new ClientCreationError(
      'No tienes permisos sobre este estudio.',
      '_form',
    )
  }
  if (msg.includes('UNAUTHENTICATED')) {
    return new ClientCreationError(
      'Tu sesión expiró. Vuelve a iniciar sesión.',
      '_form',
    )
  }
  // Postgres unique violation (duplicate email, invoice_number, etc.)
  if (err.code === '23505') {
    return new ClientCreationError(
      'Ya existe un registro con datos duplicados (email o número de factura).',
      'email',
    )
  }

  return new ClientCreationError(
    msg || 'Ocurrió un error al crear el cliente. No se guardó ningún dato, intenta de nuevo.',
    '_form',
  )
}
