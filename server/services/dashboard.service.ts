import 'server-only'

import { createSupabaseServerClient } from '@/server/supabase/server'
import { untypedServer } from '@/server/supabase/untyped'
import { throwServiceError } from '@/lib/utils/api-error'

/**
 * Métricas del dashboard. Todo lo que vive aquí se usa solo desde
 * /dashboard (server component), así que asumimos lecturas con RLS
 * aplicada al studio del usuario.
 */

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function monthKey(date: Date): string {
  // "2026-04"
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  return d.toLocaleString('es', { month: 'short' })
}

export type MonthlyRevenueBucket = {
  month: string // YYYY-MM
  label: string // "abr"
  revenue: number
  paymentsCount: number
}

/**
 * Revenue por mes para los últimos N meses (incluye el mes actual).
 * Suma `payments.amount` donde status = 'completed'.
 */
export async function getMonthlyRevenue(
  studioId: string,
  months: number = 12,
): Promise<MonthlyRevenueBucket[]> {
  const supabase = createSupabaseServerClient()
  const now = new Date()
  const start = startOfMonth(new Date(now.getFullYear(), now.getMonth() - (months - 1), 1))

  const { data, error } = await supabase
    .from('payments')
    .select('amount, received_at')
    .eq('studio_id', studioId)
    .eq('status', 'completed')
    .is('deleted_at', null)
    .gte('received_at', start.toISOString())

  if (error) throwServiceError("DASHBOARD_REVENUE_FAILED", error)

  // Pre-inicializa los buckets para evitar huecos en el gráfico.
  const buckets = new Map<string, MonthlyRevenueBucket>()
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1)
    const k = monthKey(d)
    buckets.set(k, { month: k, label: monthLabel(k), revenue: 0, paymentsCount: 0 })
  }

  for (const row of (data ?? []) as Array<{ amount: number | string; received_at: string }>) {
    const d = new Date(row.received_at)
    const k = monthKey(d)
    const b = buckets.get(k)
    if (!b) continue
    b.revenue += Number(row.amount)
    b.paymentsCount += 1
  }

  return Array.from(buckets.values())
}

export type BookingsFunnel = {
  received: number
  approved: number
  contracted: number
  paid: number
  conversionPct: number
}

/**
 * Embudo de conversión del mes actual: solicitudes recibidas → aprobadas →
 * contrato firmado → pagado (al menos una factura paid o partially_paid).
 */
export async function getBookingsFunnel(studioId: string): Promise<BookingsFunnel> {
  const supabase = createSupabaseServerClient()
  const som = startOfMonth(new Date()).toISOString()

  const [received, approved, signed, paid] = await Promise.all([
    supabase
      .from('booking_requests')
      .select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId)
      .gte('created_at', som),
    supabase
      .from('booking_requests')
      .select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId)
      .gte('created_at', som)
      .eq('status', 'approved'),
    supabase
      .from('contracts')
      .select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId)
      .gte('created_at', som)
      .eq('status', 'signed')
      .is('deleted_at', null),
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId)
      .gte('created_at', som)
      .in('status', ['paid', 'partially_paid'])
      .is('deleted_at', null),
  ])

  const receivedN = received.count ?? 0
  const approvedN = approved.count ?? 0
  const signedN = signed.count ?? 0
  const paidN = paid.count ?? 0

  const conversionPct = receivedN === 0 ? 0 : Math.round((paidN / receivedN) * 100)

  return {
    received: receivedN,
    approved: approvedN,
    contracted: signedN,
    paid: paidN,
    conversionPct,
  }
}

export type TopPackage = {
  packageId: string
  name: string
  bookings: number
  revenue: number
}

/**
 * Top paquetes por cantidad de proyectos booked/in_progress en los
 * últimos `months` meses (default 6).
 */
export async function getTopPackages(
  studioId: string,
  months: number = 6,
  limit: number = 5,
): Promise<TopPackage[]> {
  const supabase = createSupabaseServerClient()
  const now = new Date()
  const start = startOfMonth(new Date(now.getFullYear(), now.getMonth() - (months - 1), 1))

  const { data, error } = await supabase
    .from('projects')
    .select(`package_id, total_amount, package:packages(name)`)
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .not('package_id', 'is', null)
    .gte('created_at', start.toISOString())

  if (error) throwServiceError("DASHBOARD_TOP_PACKAGES_FAILED", error)

  type Row = {
    package_id: string | null
    total_amount: number | string | null
    package: { name: string } | { name: string }[] | null
  }

  const map = new Map<string, TopPackage>()
  for (const r of (data as Row[] | null) ?? []) {
    if (!r.package_id) continue
    const name = Array.isArray(r.package)
      ? (r.package[0]?.name ?? 'Sin nombre')
      : (r.package?.name ?? 'Sin nombre')
    const prev = map.get(r.package_id) ?? {
      packageId: r.package_id,
      name,
      bookings: 0,
      revenue: 0,
    }
    prev.bookings += 1
    prev.revenue += Number(r.total_amount ?? 0)
    map.set(r.package_id, prev)
  }

  return Array.from(map.values())
    .sort((a, b) => b.bookings - a.bookings || b.revenue - a.revenue)
    .slice(0, limit)
}

export type LeadConversion = {
  total: number
  won: number
  lost: number
  pct: number
}

/**
 * Tasa de conversión de leads en los últimos `months` meses.
 */
export async function getLeadConversion(
  studioId: string,
  months: number = 3,
): Promise<LeadConversion> {
  const supabase = createSupabaseServerClient()
  const now = new Date()
  const start = startOfMonth(new Date(now.getFullYear(), now.getMonth() - (months - 1), 1))

  const { data, error } = await supabase
    .from('leads')
    .select('status')
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .gte('created_at', start.toISOString())

  if (error) throwServiceError("DASHBOARD_LEAD_CONVERSION_FAILED", error)

  const rows = (data as Array<{ status: string }> | null) ?? []
  const total = rows.length
  const won = rows.filter((r) => r.status === 'won').length
  const lost = rows.filter((r) => r.status === 'lost').length
  const pct = total === 0 ? 0 : Math.round((won / total) * 100)

  return { total, won, lost, pct }
}

export type ProjectsByStatus = Array<{ status: string; count: number }>

export async function getProjectsByStatus(studioId: string): Promise<ProjectsByStatus> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('projects')
    .select('status')
    .eq('studio_id', studioId)
    .is('deleted_at', null)

  if (error) throwServiceError("DASHBOARD_PROJECTS_BY_STATUS_FAILED", error)

  const rows = (data as Array<{ status: string }> | null) ?? []
  const map = new Map<string, number>()
  for (const r of rows) map.set(r.status, (map.get(r.status) ?? 0) + 1)

  return Array.from(map.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count)
}

// ============================================================================
// Actividad reciente — lectura del activity_log con metadata enriquecida.
// Cubre todos los tipos de eventos (cliente, proyecto, factura, contrato,
// pago, galería, entrega, lead, formulario, booking).
// ============================================================================

export type RecentActivityRow = {
  id: string
  action: string
  entityType: string | null
  entityId: string | null
  description: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  /** href calculado para que el cliente pueda hacer click → módulo real. */
  href: string | null
  /** Si el registro relacionado fue eliminado (soft o hard). */
  isOrphan: boolean
}

/**
 * Devuelve los últimos N eventos del activity_log con href calculado y
 * marca de huérfano si el registro relacionado fue trasheado.
 */
export async function getRecentActivity(
  studioId: string,
  limit: number = 10,
): Promise<RecentActivityRow[]> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('activity_log')
    .select('id, action, entity_type, entity_id, description, metadata, created_at')
    .eq('studio_id', studioId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throwServiceError("DASHBOARD_RECENT_ACTIVITY_FAILED", error)

  type Row = {
    id: string
    action: string
    entity_type: string | null
    entity_id: string | null
    description: string | null
    metadata: Record<string, unknown> | null
    created_at: string
  }
  const rows = (data as Row[] | null) ?? []

  // Para detectar huérfanos eficientemente, agrupamos por entity_type y
  // hacemos UN SELECT por tipo con todos los IDs.
  const groups = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!r.entity_type || !r.entity_id) continue
    if (!groups.has(r.entity_type)) groups.set(r.entity_type, new Set())
    groups.get(r.entity_type)!.add(r.entity_id)
  }

  const orphanFlags = new Map<string, boolean>() // key: `${type}:${id}`
  for (const [type, ids] of groups) {
    const tableName = ENTITY_TABLE_MAP[type]
    if (!tableName) continue
    const { data: existing } = await supabase
      .from(tableName as 'clients')
      .select('id, deleted_at')
      .eq('studio_id', studioId)
      .in('id', Array.from(ids))
    type ExistingRow = { id: string; deleted_at: string | null }
    const existingRows = (existing as ExistingRow[] | null) ?? []
    const existingMap = new Map(existingRows.map((r) => [r.id, r.deleted_at]))
    for (const id of ids) {
      const deleted = existingMap.get(id)
      // Huérfano si: no existe (hard-deleted) o tiene deleted_at (trashed)
      orphanFlags.set(`${type}:${id}`, !existingMap.has(id) || deleted !== null)
    }
  }

  return rows.map((r) => {
    const isOrphan =
      r.entity_type && r.entity_id
        ? orphanFlags.get(`${r.entity_type}:${r.entity_id}`) ?? false
        : false
    return {
      id: r.id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      description: r.description,
      metadata: r.metadata,
      createdAt: r.created_at,
      href: isOrphan ? null : computeEntityHref(r.entity_type, r.entity_id),
      isOrphan,
    }
  })
}

const ENTITY_TABLE_MAP: Record<string, string> = {
  client: 'clients',
  project: 'projects',
  invoice: 'invoices',
  contract: 'contracts',
  contract_template: 'contract_templates',
  payment: 'payments',
  gallery: 'galleries',
  delivery: 'client_deliveries',
  lead: 'leads',
  form_template: 'form_templates',
  form_response: 'form_responses',
  booking_request: 'booking_requests',
  package: 'packages',
}

function computeEntityHref(
  entityType: string | null,
  entityId: string | null,
): string | null {
  if (!entityType || !entityId) return null
  switch (entityType) {
    case 'client':
      return `/clients/${entityId}`
    case 'project':
      return `/projects/${entityId}`
    case 'invoice':
      return `/invoices/${entityId}`
    case 'contract':
      return `/contracts/${entityId}`
    case 'gallery':
      return `/galleries/${entityId}`
    case 'delivery':
      return `/projects?delivery=${entityId}` // entregas viven dentro de proyectos
    case 'lead':
      return `/leads/${entityId}`
    case 'booking_request':
      return `/bookings/${entityId}`
    case 'form_template':
      return `/settings/forms/${entityId}`
    case 'form_response':
      return null // no tiene página individual de admin
    case 'package':
      return `/settings/packages`
    case 'contract_template':
      return `/settings/contracts/${entityId}`
    case 'payment':
      // Los pagos viven dentro de su factura. Sin invoice_id en metadata,
      // mandamos al listado de facturas.
      return `/invoices`
    default:
      return null
  }
}

// ============================================================================
// Detalle de pagos por mes — para hover/click en el revenue chart.
// ============================================================================

export type MonthPaymentDetail = {
  paymentId: string
  amount: number
  currency: string
  receivedAt: string
  method: string | null
  status: string
  invoiceId: string | null
  invoiceNumber: string | null
  clientId: string | null
  clientName: string | null
  projectId: string | null
  projectName: string | null
  href: string | null
}

/**
 * Devuelve TOP N pagos de un mes específico con detalles para tooltip/click.
 */
export async function getMonthPayments(
  studioId: string,
  monthKey: string, // "2026-05"
  limit: number = 10,
): Promise<MonthPaymentDetail[]> {
  const supabase = createSupabaseServerClient()
  const [yStr, mStr] = monthKey.split('-')
  const y = Number(yStr)
  const m = Number(mStr)
  const start = new Date(y, m - 1, 1).toISOString()
  const end = new Date(y, m, 1).toISOString()

  const { data, error } = await supabase
    .from('payments')
    .select(
      `id, amount, currency, received_at, method, status, invoice_id,
       invoice:invoices(id, invoice_number, client_id, project_id,
         client:clients(id, name),
         project:projects(id, name)
       )`,
    )
    .eq('studio_id', studioId)
    .eq('status', 'completed')
    .is('deleted_at', null)
    .gte('received_at', start)
    .lt('received_at', end)
    .order('received_at', { ascending: false })
    .limit(limit)

  if (error) throwServiceError("DASHBOARD_MONTH_PAYMENTS_FAILED", error)

  type Row = {
    id: string
    amount: number | string
    currency: string | null
    received_at: string
    method: string | null
    status: string
    invoice_id: string | null
    invoice:
      | {
          id: string
          invoice_number: string | null
          client_id: string | null
          project_id: string | null
          client: { id: string; name: string } | { id: string; name: string }[] | null
          project: { id: string; name: string } | { id: string; name: string }[] | null
        }
      | Array<{
          id: string
          invoice_number: string | null
          client_id: string | null
          project_id: string | null
          client: { id: string; name: string } | { id: string; name: string }[] | null
          project: { id: string; name: string } | { id: string; name: string }[] | null
        }>
      | null
  }

  return ((data as Row[] | null) ?? []).map((r) => {
    const inv = Array.isArray(r.invoice) ? r.invoice[0] ?? null : r.invoice
    const client = inv ? (Array.isArray(inv.client) ? inv.client[0] ?? null : inv.client) : null
    const project = inv ? (Array.isArray(inv.project) ? inv.project[0] ?? null : inv.project) : null
    return {
      paymentId: r.id,
      amount: Number(r.amount),
      currency: r.currency ?? 'DOP',
      receivedAt: r.received_at,
      method: r.method,
      status: r.status,
      invoiceId: inv?.id ?? r.invoice_id,
      invoiceNumber: inv?.invoice_number ?? null,
      clientId: client?.id ?? null,
      clientName: client?.name ?? null,
      projectId: project?.id ?? null,
      projectName: project?.name ?? null,
      href: inv ? `/invoices/${inv.id}` : null,
    }
  })
}

// ============================================================================
// Tareas de la semana — próximas 7 días (activas, con fecha). Para el dashboard.
// ============================================================================

export type WeekTaskRow = {
  id: string
  title: string
  dueDate: string | null
  dueTime: string | null
  priority: string
  status: string
  href: string | null
  clientName: string | null
  overdue: boolean
}

/**
 * Tareas ACTIVAS (pendiente/en_progreso/bloqueada) con vencimiento entre hoy y
 * hoy+`days` (incluye vencidas hasta hoy). Resuelve el nombre del cliente vía la
 * entidad vinculada (proyecto → cliente, o cliente directo) y un href clickeable.
 */
export async function getTasksThisWeek(
  studioId: string,
  days: number = 7,
): Promise<WeekTaskRow[]> {
  const supabase = untypedServer()
  const today = new Date().toISOString().slice(0, 10)
  const end = new Date()
  end.setDate(end.getDate() + days)
  const endStr = end.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, title, due_date, due_time, priority, status, entity_type, entity_id',
    )
    .eq('studio_id', studioId)
    .is('deleted_at', null)
    .in('status', ['pendiente', 'en_progreso', 'bloqueada'])
    .not('due_date', 'is', null)
    .lte('due_date', endStr)
    .order('due_date', { ascending: true })
    .order('due_time', { ascending: true, nullsFirst: true })
    .limit(25)

  if (error) throwServiceError('DASHBOARD_TASKS_WEEK_FAILED', error)

  type Row = {
    id: string
    title: string
    due_date: string | null
    due_time: string | null
    priority: string
    status: string
    entity_type: string | null
    entity_id: string | null
  }
  let rows = (data as Row[] | null) ?? []

  // Resolver nombre del cliente: proyecto → client_id → clients.name, o cliente directo.
  const projectIds = [
    ...new Set(
      rows
        .filter((t) => (t.entity_type === 'project' || t.entity_type === 'session') && t.entity_id)
        .map((t) => t.entity_id as string),
    ),
  ]
  const directClientIds = [
    ...new Set(rows.filter((t) => t.entity_type === 'client' && t.entity_id).map((t) => t.entity_id as string)),
  ]
  const projectClient: Record<string, string> = {}
  const finalizedProjects = new Set<string>()
  if (projectIds.length) {
    const { data: projs } = await supabase
      .from('projects')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select('id, client_id, finalized_at' as any)
      .eq('studio_id', studioId)
      .in('id', projectIds)
    for (const p of (projs as Array<{
      id: string
      client_id: string | null
      finalized_at: string | null
    }> | null) ?? []) {
      if (p.client_id) projectClient[p.id] = p.client_id
      if (p.finalized_at) finalizedProjects.add(p.id)
    }
  }
  // Esconde las tareas de sesiones finalizadas.
  if (finalizedProjects.size > 0) {
    rows = rows.filter(
      (t) =>
        !(
          (t.entity_type === 'project' || t.entity_type === 'session') &&
          t.entity_id &&
          finalizedProjects.has(t.entity_id as string)
        ),
    )
  }
  const clientIds = [...new Set([...directClientIds, ...Object.values(projectClient)])]
  const clientName: Record<string, string> = {}
  if (clientIds.length) {
    const { data: clients } = await supabase
      .from('clients')
      .select('id, name')
      .eq('studio_id', studioId)
      .in('id', clientIds)
    for (const c of (clients as Array<{ id: string; name: string }> | null) ?? []) {
      clientName[c.id] = c.name
    }
  }

  return rows.map((r) => {
    let cName: string | null = null
    if (r.entity_type === 'client' && r.entity_id) cName = clientName[r.entity_id] ?? null
    else if ((r.entity_type === 'project' || r.entity_type === 'session') && r.entity_id) {
      const cid = projectClient[r.entity_id]
      cName = cid ? clientName[cid] ?? null : null
    }
    const href =
      (r.entity_type === 'project' || r.entity_type === 'session') && r.entity_id
        ? `/projects/${r.entity_id}`
        : r.entity_type === 'client' && r.entity_id
          ? `/clients/${r.entity_id}`
          : '/tasks'
    return {
      id: r.id,
      title: r.title,
      dueDate: r.due_date,
      dueTime: r.due_time,
      priority: r.priority,
      status: r.status,
      href,
      clientName: cName,
      overdue: !!r.due_date && r.due_date < today,
    }
  })
}

// ============================================================================
// Stats financieras de sesión — deudas pendientes (colaboradores + vestidos).
// ============================================================================

export type SessionFinanceStats = {
  collaboratorDebt: number
  collaboratorDebtCount: number
  dressDebt: number
  dressDebtCount: number
  currency: string
}

/**
 * Deuda pendiente del estudio: pagos a colaboradores aún NO liquidados
 * (pay_status = 'pending') + costo de vestidos aún NO pagados a la tienda
 * (dress_pay_status ≠ 'paid'). Alimenta las stats financieras del dashboard.
 */
export async function getSessionFinanceStats(
  studioId: string,
): Promise<SessionFinanceStats> {
  const supabase = untypedServer()

  const [collab, dresses] = await Promise.all([
    supabase
      .from('project_collaborators')
      .select('agreed_pay')
      .eq('studio_id', studioId)
      .eq('pay_status', 'pending')
      .is('deleted_at', null),
    supabase
      .from('projects')
      .select('dress_cost, dress_pay_status')
      .eq('studio_id', studioId)
      .is('deleted_at', null)
      .not('dress_cost', 'is', null)
      .gt('dress_cost', 0),
  ])

  const collabRows = (collab.data as Array<{ agreed_pay: number | string }> | null) ?? []
  const collaboratorDebt = collabRows.reduce((s, r) => s + Number(r.agreed_pay ?? 0), 0)

  const dressRows =
    (dresses.data as Array<{ dress_cost: number | string; dress_pay_status: string | null }> | null) ??
    []
  const unpaidDresses = dressRows.filter((r) => (r.dress_pay_status ?? 'pending') !== 'paid')
  const dressDebt = unpaidDresses.reduce((s, r) => s + Number(r.dress_cost ?? 0), 0)

  return {
    collaboratorDebt,
    collaboratorDebtCount: collabRows.length,
    dressDebt,
    dressDebtCount: unpaidDresses.length,
    currency: 'DOP',
  }
}
