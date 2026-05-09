import 'server-only'

import { createSupabaseServerClient } from '@/server/supabase/server'
import { createSupabaseServiceClient } from '@/server/supabase/service'
import { throwServiceError } from '@/lib/utils/api-error'
import { logActivity } from './activity.service'

// ----------------------------------------------------------------------------
// Tipos genéricos
// ----------------------------------------------------------------------------

export type TrashEntityType =
  | 'project'
  | 'contract'
  | 'invoice'
  | 'gallery'
  | 'delivery'

interface ListOpts {
  search?: string
  page?: number
  pageSize?: number
}

interface PagedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

function getRange(page: number, pageSize: number) {
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  return { from, to }
}

// ----------------------------------------------------------------------------
// PROJECTS
// ----------------------------------------------------------------------------

export type TrashedProject = {
  id: string
  name: string
  client_id: string
  client_name: string | null
  status: string | null
  deleted_at: string | null
  deletion_reason: string | null
}

export async function getTrashedProjects(
  studioId: string,
  opts: ListOpts = {},
): Promise<PagedResult<TrashedProject>> {
  const { search, page = 1, pageSize = 50 } = opts
  const { from, to } = getRange(page, pageSize)
  const supabase = createSupabaseServerClient()

  let query = supabase
    .from('projects')
    .select('*, clients(name)', { count: 'exact' })
    .eq('studio_id', studioId)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .range(from, to)

  if (search?.trim()) {
    query = query.ilike('name', `%${search.trim()}%`)
  }

  const { data, count, error } = await query
  if (error) throwServiceError("TRASH_OP_FAILED", error)

  const items = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>
    const client = r.clients as { name?: string } | null
    return {
      id: r.id as string,
      name: r.name as string,
      client_id: r.client_id as string,
      client_name: client?.name ?? null,
      status: (r.status as string | null) ?? null,
      deleted_at: (r.deleted_at as string | null) ?? null,
      deletion_reason: (r.deletion_reason as string | null) ?? null,
    } satisfies TrashedProject
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
// CONTRACTS
// ----------------------------------------------------------------------------

export type TrashedContract = {
  id: string
  title: string | null
  status: string | null
  project_id: string | null
  project_name: string | null
  deleted_at: string | null
  deletion_reason: string | null
}

export async function getTrashedContracts(
  studioId: string,
  opts: ListOpts = {},
): Promise<PagedResult<TrashedContract>> {
  const { search, page = 1, pageSize = 50 } = opts
  const { from, to } = getRange(page, pageSize)
  const supabase = createSupabaseServerClient()

  let query = supabase
    .from('contracts')
    .select('*, projects(name)', { count: 'exact' })
    .eq('studio_id', studioId)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .range(from, to)

  if (search?.trim()) {
    query = query.ilike('title', `%${search.trim()}%`)
  }

  const { data, count, error } = await query
  if (error) throwServiceError("TRASH_OP_FAILED", error)

  const items = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>
    const project = r.projects as { name?: string } | null
    return {
      id: r.id as string,
      title: (r.title as string | null) ?? null,
      status: (r.status as string | null) ?? null,
      project_id: (r.project_id as string | null) ?? null,
      project_name: project?.name ?? null,
      deleted_at: (r.deleted_at as string | null) ?? null,
      deletion_reason: (r.deletion_reason as string | null) ?? null,
    } satisfies TrashedContract
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
// INVOICES
// ----------------------------------------------------------------------------

export type TrashedInvoice = {
  id: string
  invoice_number: string | null
  amount_total: number | null
  status: string | null
  project_id: string | null
  project_name: string | null
  deleted_at: string | null
  deletion_reason: string | null
}

export async function getTrashedInvoices(
  studioId: string,
  opts: ListOpts = {},
): Promise<PagedResult<TrashedInvoice>> {
  const { search, page = 1, pageSize = 50 } = opts
  const { from, to } = getRange(page, pageSize)
  const supabase = createSupabaseServerClient()

  let query = supabase
    .from('invoices')
    .select('*, projects(name)', { count: 'exact' })
    .eq('studio_id', studioId)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .range(from, to)

  if (search?.trim()) {
    query = query.ilike('invoice_number', `%${search.trim()}%`)
  }

  const { data, count, error } = await query
  if (error) throwServiceError("TRASH_OP_FAILED", error)

  const items = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>
    const project = r.projects as { name?: string } | null
    return {
      id: r.id as string,
      invoice_number: (r.invoice_number as string | null) ?? null,
      amount_total: (r.amount_total as number | null) ?? null,
      status: (r.status as string | null) ?? null,
      project_id: (r.project_id as string | null) ?? null,
      project_name: project?.name ?? null,
      deleted_at: (r.deleted_at as string | null) ?? null,
      deletion_reason: (r.deletion_reason as string | null) ?? null,
    } satisfies TrashedInvoice
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
// GALLERIES
// ----------------------------------------------------------------------------

export type TrashedGallery = {
  id: string
  name: string | null
  project_id: string | null
  project_name: string | null
  deleted_at: string | null
  deletion_reason: string | null
}

export async function getTrashedGalleries(
  studioId: string,
  opts: ListOpts = {},
): Promise<PagedResult<TrashedGallery>> {
  const { search, page = 1, pageSize = 50 } = opts
  const { from, to } = getRange(page, pageSize)
  const supabase = createSupabaseServerClient()

  let query = supabase
    .from('galleries')
    .select('*, projects(name)', { count: 'exact' })
    .eq('studio_id', studioId)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .range(from, to)

  if (search?.trim()) {
    query = query.ilike('name', `%${search.trim()}%`)
  }

  const { data, count, error } = await query
  if (error) throwServiceError("TRASH_OP_FAILED", error)

  const items = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>
    const project = r.projects as { name?: string } | null
    return {
      id: r.id as string,
      name: (r.name as string | null) ?? null,
      project_id: (r.project_id as string | null) ?? null,
      project_name: project?.name ?? null,
      deleted_at: (r.deleted_at as string | null) ?? null,
      deletion_reason: (r.deletion_reason as string | null) ?? null,
    } satisfies TrashedGallery
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
// DELIVERIES
// ----------------------------------------------------------------------------

export type TrashedDelivery = {
  id: string
  title: string | null
  status: string | null
  client_id: string | null
  deleted_at: string | null
  deletion_reason: string | null
}

export async function getTrashedDeliveries(
  studioId: string,
  opts: ListOpts = {},
): Promise<PagedResult<TrashedDelivery>> {
  const { search, page = 1, pageSize = 50 } = opts
  const { from, to } = getRange(page, pageSize)
  const supabase = createSupabaseServerClient()

  let query = supabase
    .from('client_deliveries')
    .select('*', { count: 'exact' })
    .eq('studio_id', studioId)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .range(from, to)

  if (search?.trim()) {
    query = query.ilike('title', `%${search.trim()}%`)
  }

  const { data, count, error } = await query
  if (error) throwServiceError("TRASH_OP_FAILED", error)

  const items = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>
    return {
      id: r.id as string,
      title: (r.title as string | null) ?? null,
      status: (r.status as string | null) ?? null,
      client_id: (r.client_id as string | null) ?? null,
      deleted_at: (r.deleted_at as string | null) ?? null,
      deletion_reason: (r.deletion_reason as string | null) ?? null,
    } satisfies TrashedDelivery
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
// COUNTS — para mostrar badges en los tabs
// ----------------------------------------------------------------------------

export async function getTrashCounts(studioId: string) {
  const supabase = createSupabaseServerClient()

  // Hacemos 5 counts en paralelo
  const [clients, projects, contracts, invoices, galleries, deliveries] =
    await Promise.all([
      supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('studio_id', studioId)
        .not('deleted_at', 'is', null),
      supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('studio_id', studioId)
        .not('deleted_at', 'is', null),
      supabase
        .from('contracts')
        .select('id', { count: 'exact', head: true })
        .eq('studio_id', studioId)
        .not('deleted_at', 'is', null),
      supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('studio_id', studioId)
        .not('deleted_at', 'is', null),
      supabase
        .from('galleries')
        .select('id', { count: 'exact', head: true })
        .eq('studio_id', studioId)
        .not('deleted_at', 'is', null),
      supabase
        .from('client_deliveries')
        .select('id', { count: 'exact', head: true })
        .eq('studio_id', studioId)
        .not('deleted_at', 'is', null),
    ])

  return {
    clients: clients.count ?? 0,
    projects: projects.count ?? 0,
    contracts: contracts.count ?? 0,
    invoices: invoices.count ?? 0,
    galleries: galleries.count ?? 0,
    deliveries: deliveries.count ?? 0,
  }
}

// ----------------------------------------------------------------------------
// MUTATIONS — restore + hard delete por entidad
// ----------------------------------------------------------------------------

const RPC_MAP: Record<
  TrashEntityType,
  { restore: string; hardDelete: string; idArg: string; logEntityType: string }
> = {
  project: {
    restore: 'restore_project',
    hardDelete: 'hard_delete_project',
    idArg: 'p_project_id',
    logEntityType: 'project',
  },
  contract: {
    restore: 'restore_contract',
    hardDelete: 'hard_delete_contract',
    idArg: 'p_contract_id',
    logEntityType: 'contract',
  },
  invoice: {
    restore: 'restore_invoice',
    hardDelete: 'hard_delete_invoice',
    idArg: 'p_invoice_id',
    logEntityType: 'invoice',
  },
  gallery: {
    restore: 'restore_gallery',
    hardDelete: 'hard_delete_gallery',
    idArg: 'p_gallery_id',
    logEntityType: 'gallery',
  },
  delivery: {
    restore: 'restore_delivery',
    hardDelete: 'hard_delete_delivery',
    idArg: 'p_delivery_id',
    logEntityType: 'client_delivery',
  },
}

export async function restoreEntity(
  studioId: string,
  actorId: string,
  entityType: TrashEntityType,
  entityId: string,
) {
  const cfg = RPC_MAP[entityType]
  const supabase = createSupabaseServiceClient()
  const args: Record<string, string> = {
    [cfg.idArg]: entityId,
    p_studio_id: studioId,
  }
  // @ts-ignore - RPCs nuevas, tipos no generados
  const { error } = await supabase.rpc(cfg.restore, args)
  if (error) throwServiceError("TRASH_OP_FAILED", error)

  await logActivity({
    studioId,
    actorId,
    entityType: cfg.logEntityType,
    entityId,
    action: `${cfg.logEntityType}.restored`,
  })
}

export async function permanentlyDeleteEntity(
  studioId: string,
  actorId: string,
  entityType: TrashEntityType,
  entityId: string,
) {
  const cfg = RPC_MAP[entityType]
  const supabase = createSupabaseServiceClient()
  const args: Record<string, string> = {
    [cfg.idArg]: entityId,
    p_studio_id: studioId,
  }
  // @ts-ignore - RPCs nuevas, tipos no generados
  const { error } = await supabase.rpc(cfg.hardDelete, args)
  if (error) throwServiceError("TRASH_OP_FAILED", error)

  await logActivity({
    studioId,
    actorId,
    entityType: cfg.logEntityType,
    entityId,
    action: `${cfg.logEntityType}.purged`,
  })
}
