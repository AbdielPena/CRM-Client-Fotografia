import 'server-only'

import { createSupabaseServerClient } from '@/server/supabase/server'

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

  if (error) throw new Error(`[getMonthlyRevenue] ${error.message}`)

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

  if (error) throw new Error(`[getTopPackages] ${error.message}`)

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

  if (error) throw new Error(`[getLeadConversion] ${error.message}`)

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

  if (error) throw new Error(`[getProjectsByStatus] ${error.message}`)

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

  if (error) throw new Error(`[getRecentActivity] ${error.message}`)

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

  if (error) throw new Error(`[getMonthPayments] ${error.message}`)

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
