import 'server-only'

import { projectsRepo } from '@/server/repositories'
import { createSupabaseServerClient } from '@/server/supabase/server'
import { createSupabaseServiceClient } from '@/server/supabase/service'
import type {
  CreateProjectInput,
  UpdateProjectInput,
} from '@/lib/validations/project.schema'
import { throwServiceError } from '@/lib/utils/api-error'
import { logActivity } from './activity.service'
import {
  syncProjectById,
  deleteProjectEventSafe,
} from './google-calendar.service'

// ----------------------------------------------------------------------------
// Listado + detalle
// ----------------------------------------------------------------------------

/** Formatea una lista de labels para el operador PostgREST `in`/`not.in`. */
function pgInList(labels: string[]): string {
  return '(' + labels.map((l) => '"' + l.replace(/"/g, '""') + '"').join(',') + ')'
}

export async function getProjects(
  studioId: string,
  opts: {
    status?: string
    search?: string
    serviceCategoryId?: string
    page?: number
    pageSize?: number
    /** Solo proyectos cuyo status esté en esta lista (p.ej. completados). */
    onlyStatuses?: string[]
    /** Excluir proyectos cuyo status esté en esta lista (p.ej. completados). */
    excludeStatuses?: string[]
    /** Filtro por rango de event_date (inclusive, formato YYYY-MM-DD). */
    dateFrom?: string
    dateTo?: string
    /** Orden por fecha del evento. Default: descendente (más reciente primero). */
    orderBy?: "event_date_asc" | "event_date_desc"
  } = {},
) {
  const {
    status,
    search,
    serviceCategoryId,
    page = 1,
    pageSize = 50,
    onlyStatuses,
    excludeStatuses,
    dateFrom,
    dateTo,
    orderBy,
  } = opts
  const supabase = createSupabaseServerClient()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('projects')
    .select(
      `
        *,
        client:clients(id, name, email)
      `,
      { count: 'exact' },
    )
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .order('event_date', {
      ascending: orderBy === "event_date_asc",
      nullsFirst: false,
    })
    .range(from, to)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (status) query = query.eq('status', status as any)
  // service_category_id es columna nueva (no en tipos) → cast
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (serviceCategoryId) query = query.eq('service_category_id' as any, serviceCategoryId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (onlyStatuses && onlyStatuses.length) query = query.in('status', onlyStatuses as any)
  if (excludeStatuses && excludeStatuses.length) {
    query = query.not('status', 'in', pgInList(excludeStatuses))
  }
  if (dateFrom) query = query.gte('event_date', dateFrom)
  if (dateTo) query = query.lte('event_date', dateTo)
  if (search && search.trim()) {
    const term = `%${search.trim()}%`
    query = query.ilike('name', term)
  }

  const { data, count, error } = await query
  if (error) throwServiceError("PROJECT_OP_FAILED", error)

  // hasPayment por proyecto: mismo criterio canónico que onPaymentRecorded
  // (≥1 pago 'completed' sobre una factura no borrada). Lo usa el Kanban para
  // enrutar "Reservado sin pagar" a la columna "Pendiente de pago". Se calcula
  // por LOTE (dos queries) para no hacer N+1.
  const rows = (data ?? []) as Array<{ id: string } & Record<string, unknown>>
  const paidProjects = new Set<string>()
  if (rows.length) {
    const projectIds = rows.map((p) => p.id)
    const { data: invRows } = await supabase
      .from("invoices")
      .select("id, project_id")
      .eq("studio_id", studioId)
      .is("deleted_at", null)
      .in("project_id", projectIds)
    const invoices = (invRows ?? []) as Array<{ id: string; project_id: string | null }>
    if (invoices.length) {
      const projectByInvoice = new Map(invoices.map((i) => [i.id, i.project_id]))
      const { data: payRows } = await supabase
        .from("payments")
        .select("invoice_id")
        .eq("status", "completed")
        .in(
          "invoice_id",
          invoices.map((i) => i.id),
        )
      for (const p of (payRows ?? []) as Array<{ invoice_id: string }>) {
        const pid = projectByInvoice.get(p.invoice_id)
        if (pid) paidProjects.add(pid)
      }
    }
  }
  const items = rows.map((p) => ({ ...p, hasPayment: paidProjects.has(p.id) }))

  const total = count ?? 0
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  }
}

/**
 * Cuenta proyectos del studio con filtros opcionales por status (head count, sin
 * traer filas). Lo usan los badges del toggle Activos/Completados en /projects.
 */
export async function countProjects(
  studioId: string,
  opts: {
    search?: string
    serviceCategoryId?: string
    onlyStatuses?: string[]
    excludeStatuses?: string[]
    dateFrom?: string
    dateTo?: string
  } = {},
): Promise<number> {
  const { search, serviceCategoryId, onlyStatuses, excludeStatuses, dateFrom, dateTo } =
    opts
  const supabase = createSupabaseServerClient()

  let query = supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('studio_id', studioId)
    .is('deleted_at', null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (serviceCategoryId) query = query.eq('service_category_id' as any, serviceCategoryId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (onlyStatuses && onlyStatuses.length) query = query.in('status', onlyStatuses as any)
  if (excludeStatuses && excludeStatuses.length) {
    query = query.not('status', 'in', pgInList(excludeStatuses))
  }
  if (dateFrom) query = query.gte('event_date', dateFrom)
  if (dateTo) query = query.lte('event_date', dateTo)
  if (search && search.trim()) {
    query = query.ilike('name', `%${search.trim()}%`)
  }

  const { count, error } = await query
  if (error) throwServiceError('PROJECT_OP_FAILED', error)
  return count ?? 0
}

export async function getProjectById(studioId: string, projectId: string) {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('projects')
    .select(
      `
        *,
        client:clients(*),
        package:packages(id, name, price, currency, includes_dress, dress_included_amount),
        service_category:service_categories(id, dress_included_amount, retention_months),
        invoices(*),
        contracts(*),
        notes(*)
      `,
    )
    .eq('id', projectId)
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throwServiceError("PROJECT_OP_FAILED", error)
  if (!data) return null

  // Filtrar y ordenar relaciones en JS para no depender de joins anidados complejos
  return {
    ...data,
    invoices: [...((data.invoices ?? []) as Array<Record<string, unknown>>)]
      .filter((i) => (i.deleted_at ?? null) === null)
      .sort((a, b) => {
        const ad = a.created_at ? new Date(a.created_at as string).getTime() : 0
        const bd = b.created_at ? new Date(b.created_at as string).getTime() : 0
        return bd - ad
      }),
    contracts: [...((data.contracts ?? []) as Array<Record<string, unknown>>)]
      .filter((c) => (c.deleted_at ?? null) === null)
      .sort((a, b) => {
        const ad = a.created_at ? new Date(a.created_at as string).getTime() : 0
        const bd = b.created_at ? new Date(b.created_at as string).getTime() : 0
        return bd - ad
      }),
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
// Crear / actualizar / borrar
// ----------------------------------------------------------------------------

/**
 * Valida que el cliente exista, sea del studio y NO esté en trash.
 * Lanza error semántico (CLIENT_NOT_FOUND / CLIENT_TRASHED).
 */
async function assertClientActive(
  studioId: string,
  clientId: string,
  context: string,
): Promise<void> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('clients')
    .select('id, deleted_at')
    .eq('id', clientId)
    .eq('studio_id', studioId)
    .maybeSingle()
  if (error) throwServiceError("CLIENT_LOOKUP_FAILED", error, { context })
  if (!data) throw new Error('CLIENT_NOT_FOUND')
  if (data.deleted_at) throw new Error('CLIENT_TRASHED')
}

export async function createProject(
  studioId: string,
  actorId: string,
  data: CreateProjectInput,
) {
  // Integridad: cliente debe existir, ser del studio y NO estar en trash.
  if (!data.clientId) throw new Error('CLIENT_REQUIRED')
  await assertClientActive(studioId, data.clientId, 'createProject')

  const insert = {
    studio_id: studioId,
    client_id: data.clientId,
    package_id: data.packageId || null,
    name: data.name,
    event_type: data.eventType,
    status: data.status || 'Consulta inicial',
    event_date: data.eventDate || null,
    location: data.location || null,
    notes: data.notes || null,
    total_amount: data.totalAmount ?? null,
    currency: (data.currency || 'DOP').toUpperCase(),
  }
  // service_category_id: columna nueva (no en tipos). Si va null, el trigger
  // inherit_project_service_category la hereda del paquete.
  ;(insert as Record<string, unknown>).service_category_id = data.serviceCategoryId || null
  const project = await projectsRepo.create(insert)

  await logActivity({
    studioId,
    actorId,
    entityType: 'project',
    entityId: project.id,
    action: 'project.created',
    metadata: { name: project.name, clientId: data.clientId },
  })

  // Sync a Google Calendar (best-effort — no bloquea si la integración no
  // está conectada o si Google falla).
  if (project.event_date) {
    await syncProjectById(studioId, project.id).catch(() => {})
  }

  // Evento de automatización (best-effort).
  void (async () => {
    try {
      const { dispatchAutomationEvent } = await import('./automation.service')
      await dispatchAutomationEvent({
        studioId,
        event: 'project.created',
        entityType: 'project',
        entityId: project.id,
        payload: {
          project_id: project.id,
          client_id: project.client_id,
          event_type: project.event_type,
          event_date: project.event_date,
        },
      })
    } catch (err) {
      console.error('[project] dispatch project.created failed', err)
    }
  })()

  return project
}

export async function updateProject(
  studioId: string,
  actorId: string,
  projectId: string,
  data: UpdateProjectInput,
) {
  const existing = await projectsRepo.findById(projectId)
  if (!existing || existing.studio_id !== studioId) {
    throw new Error('PROJECT_NOT_FOUND')
  }

  const patch: Record<string, unknown> = {}
  if (data.name !== undefined) patch.name = data.name
  if (data.eventType !== undefined) patch.event_type = data.eventType
  if (data.status !== undefined) patch.status = data.status
  if (data.eventDate !== undefined) patch.event_date = data.eventDate || null
  if (data.eventTime !== undefined) patch.event_time = data.eventTime || null
  if (data.eventEndTime !== undefined) patch.event_end_time = data.eventEndTime || null
  if (data.location !== undefined) patch.location = data.location || null
  if (data.notes !== undefined) patch.notes = data.notes || null
  if (data.packageId !== undefined) patch.package_id = data.packageId || null
  if (data.serviceCategoryId !== undefined)
    patch.service_category_id = data.serviceCategoryId || null
  if (data.totalAmount !== undefined) patch.total_amount = data.totalAmount

  const project = await projectsRepo.update(projectId, patch)

  await logActivity({
    studioId,
    actorId,
    entityType: 'project',
    entityId: project.id,
    action: 'project.updated',
    metadata: data as Record<string, unknown>,
  })

  // Re-sync a Google si cambiaron campos visibles en el evento (fecha,
  // título, location) o si se canceló. Si status = 'cancelled' borra el
  // evento; en cualquier otro caso actualiza.
  const touchedEventFields =
    data.eventDate !== undefined ||
    data.eventTime !== undefined ||
    data.eventEndTime !== undefined ||
    data.name !== undefined ||
    data.location !== undefined ||
    data.notes !== undefined
  if (data.status === 'cancelled') {
    await deleteProjectEventSafe(studioId, project.id)
  } else if (touchedEventFields && project.event_date) {
    await syncProjectById(studioId, project.id).catch(() => {})
  }

  return project
}

export async function deleteProject(
  studioId: string,
  actorId: string,
  projectId: string,
) {
  const existing = await projectsRepo.findById(projectId)
  if (!existing || existing.studio_id !== studioId) {
    throw new Error('PROJECT_NOT_FOUND')
  }

  // Cascade real (SQL function): borra contratos, facturas, pagos, notas,
  // galerías, form_responses, booking_requests, etc. asociados al proyecto.
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase.rpc('cascade_delete_project', {
    p_project_id: projectId,
    p_studio_id: studioId,
  })
  if (error) {
    if (error.message?.includes('PROJECT_NOT_FOUND')) {
      throw new Error('PROJECT_NOT_FOUND')
    }
    throwServiceError("PROJECT_DELETE_FAILED", error, { studioId, projectId })
  }

  await logActivity({
    studioId,
    actorId,
    entityType: 'project',
    entityId: projectId,
    action: 'project.deleted',
  })

  // Limpiar evento en Google si existía
  await deleteProjectEventSafe(studioId, projectId)
}
