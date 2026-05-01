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
