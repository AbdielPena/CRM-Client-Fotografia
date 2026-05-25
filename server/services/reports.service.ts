import "server-only"

import { untypedServer } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"

/**
 * Service de reportes financieros avanzados.
 *
 * Reportes:
 *   - P&L (Profit & Loss): ingresos - gastos por mes/año
 *   - Cash Flow: in/out por bucket de fecha
 *   - AR Aging: receivables agrupados por días atrasados (0-30, 31-60, 60+)
 *   - Top clients: ranking por revenue
 *   - Forecast: proyección basada en suscripciones + receivables pendientes
 *
 * Todos los reportes son read-only (no mutan estado). Consultan
 * fin_transactions + invoices + fin_receivables + payments.
 */

export type PLReport = {
  period: string // "YYYY-MM" o "YYYY"
  income: number
  expenses: number
  profit: number
  profitMargin: number // %
  breakdown: {
    byCategory: Array<{ category: string; amount: number; percentage: number }>
  }
}

export type CashFlowEntry = {
  date: string // YYYY-MM-DD
  income: number
  expenses: number
  net: number
  cumulative: number
}

export type ARAgingBucket = {
  bucket: "current" | "1_30" | "31_60" | "61_90" | "over_90"
  bucketLabel: string
  total: number
  count: number
  invoices: Array<{
    id: string
    invoice_number: string
    client_name: string
    total: number
    due_date: string | null
    days_overdue: number
  }>
}

export type TopClientEntry = {
  clientId: string
  clientName: string
  totalRevenue: number
  invoiceCount: number
  lastInvoiceDate: string | null
  averageInvoice: number
}

// ============================================================================
// P&L (Profit & Loss)
// ============================================================================

export async function getPLReport(
  studioId: string,
  opts: { year?: number; month?: number } = {},
): Promise<PLReport> {
  const sb = untypedServer()
  const now = new Date()
  const year = opts.year ?? now.getFullYear()

  let periodStart: string
  let periodEnd: string
  let periodLabel: string

  if (opts.month !== undefined) {
    periodStart = `${year}-${String(opts.month).padStart(2, "0")}-01`
    const nextMonth =
      opts.month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(opts.month + 1).padStart(2, "0")}-01`
    periodEnd = nextMonth
    periodLabel = `${year}-${String(opts.month).padStart(2, "0")}`
  } else {
    periodStart = `${year}-01-01`
    periodEnd = `${year + 1}-01-01`
    periodLabel = String(year)
  }

  // Income: fin_transactions tipo='ingreso' + payments completed
  const [txnsRes, paymentsRes] = await Promise.all([
    sb
      .from("fin_transactions")
      .select(
        `monto, tipo,
         categoria:fin_categories(nombre, tipo)`,
      )
      .eq("studio_id", studioId)
      .gte("fecha", periodStart)
      .lt("fecha", periodEnd)
      .is("deleted_at", null),
    sb
      .from("payments")
      .select("amount, currency, received_at, status")
      .eq("studio_id", studioId)
      .eq("status", "completed")
      .gte("received_at", periodStart)
      .lt("received_at", periodEnd)
      .is("deleted_at", null),
  ])

  if (txnsRes.error)
    throwServiceError("REPORT_PL_TXN_FAILED", txnsRes.error, { studioId })

  type TxnRow = {
    monto: number | string
    tipo: "ingreso" | "gasto" | "transferencia"
    categoria?: { nombre: string; tipo: string } | { nombre: string; tipo: string }[] | null
  }
  type PaymentRow = { amount: number | string }

  const txns = (txnsRes.data ?? []) as TxnRow[]
  const payments = (paymentsRes.data ?? []) as PaymentRow[]

  const income = txns
    .filter((t) => t.tipo === "ingreso")
    .reduce((s, t) => s + Number(t.monto), 0)
  const expenses = txns
    .filter((t) => t.tipo === "gasto")
    .reduce((s, t) => s + Number(t.monto), 0)

  // Sumar payments del CRM también (en caso de que no estén linked a fin_transactions)
  const paymentsTotal = payments.reduce(
    (s, p) => s + Number(p.amount),
    0,
  )

  const totalIncome = Math.max(income, paymentsTotal) // Avoid double-counting
  const profit = totalIncome - expenses
  const profitMargin = totalIncome > 0 ? (profit / totalIncome) * 100 : 0

  // Breakdown por categoría (solo gastos)
  const byCatMap = new Map<string, number>()
  for (const t of txns) {
    if (t.tipo !== "gasto") continue
    const cat = Array.isArray(t.categoria) ? t.categoria[0] : t.categoria
    const catName = cat?.nombre ?? "Sin categoría"
    byCatMap.set(catName, (byCatMap.get(catName) ?? 0) + Number(t.monto))
  }
  const byCategory = Array.from(byCatMap.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: expenses > 0 ? (amount / expenses) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)

  return {
    period: periodLabel,
    income: totalIncome,
    expenses,
    profit,
    profitMargin,
    breakdown: { byCategory },
  }
}

// ============================================================================
// Cash Flow
// ============================================================================

export async function getCashFlow(
  studioId: string,
  opts: { months?: number } = {},
): Promise<CashFlowEntry[]> {
  const months = opts.months ?? 12
  const sb = untypedServer()

  const periodStart = new Date()
  periodStart.setMonth(periodStart.getMonth() - months)
  periodStart.setDate(1)

  const { data, error } = await sb
    .from("fin_transactions")
    .select("monto, tipo, fecha")
    .eq("studio_id", studioId)
    .gte("fecha", periodStart.toISOString().slice(0, 10))
    .is("deleted_at", null)
    .order("fecha", { ascending: true })

  if (error) throwServiceError("REPORT_CASHFLOW_FAILED", error, { studioId })

  type TxnRow = { monto: number | string; tipo: string; fecha: string }
  const txns = (data ?? []) as TxnRow[]

  // Agrupar por mes (YYYY-MM-01)
  const byMonth = new Map<string, { income: number; expenses: number }>()
  for (const t of txns) {
    const month = t.fecha.slice(0, 7) + "-01"
    const entry = byMonth.get(month) ?? { income: 0, expenses: 0 }
    if (t.tipo === "ingreso") entry.income += Number(t.monto)
    else if (t.tipo === "gasto") entry.expenses += Number(t.monto)
    byMonth.set(month, entry)
  }

  // Generar serie completa de meses
  const result: CashFlowEntry[] = []
  let cumulative = 0
  for (let i = 0; i < months; i++) {
    const d = new Date(periodStart)
    d.setMonth(d.getMonth() + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
    const entry = byMonth.get(key) ?? { income: 0, expenses: 0 }
    const net = entry.income - entry.expenses
    cumulative += net
    result.push({
      date: key,
      income: entry.income,
      expenses: entry.expenses,
      net,
      cumulative,
    })
  }

  return result
}

// ============================================================================
// AR Aging
// ============================================================================

export async function getARAging(studioId: string): Promise<ARAgingBucket[]> {
  const sb = untypedServer()

  const { data, error } = await sb
    .from("invoices")
    .select(
      `id, invoice_number, total, amount_paid, due_date, status,
       client:clients(id, name)`,
    )
    .eq("studio_id", studioId)
    .in("status", ["sent", "pending", "partially_paid", "overdue", "viewed"])
    .is("deleted_at", null)
    .order("due_date", { ascending: true })

  if (error) throwServiceError("REPORT_AR_FAILED", error, { studioId })

  type InvoiceRow = {
    id: string
    invoice_number: string
    total: number | string
    amount_paid: number | string
    due_date: string | null
    status: string
    client?: { id: string; name: string } | { id: string; name: string }[] | null
  }
  const invoices = (data ?? []) as InvoiceRow[]

  const buckets: Record<ARAgingBucket["bucket"], ARAgingBucket> = {
    current: {
      bucket: "current",
      bucketLabel: "Al día",
      total: 0,
      count: 0,
      invoices: [],
    },
    "1_30": {
      bucket: "1_30",
      bucketLabel: "1-30 días",
      total: 0,
      count: 0,
      invoices: [],
    },
    "31_60": {
      bucket: "31_60",
      bucketLabel: "31-60 días",
      total: 0,
      count: 0,
      invoices: [],
    },
    "61_90": {
      bucket: "61_90",
      bucketLabel: "61-90 días",
      total: 0,
      count: 0,
      invoices: [],
    },
    over_90: {
      bucket: "over_90",
      bucketLabel: "+90 días",
      total: 0,
      count: 0,
      invoices: [],
    },
  }

  const now = Date.now()
  for (const inv of invoices) {
    const outstanding = Number(inv.total) - Number(inv.amount_paid)
    if (outstanding <= 0) continue

    const dueMs = inv.due_date ? new Date(inv.due_date).getTime() : now
    const daysOverdue = Math.max(0, Math.floor((now - dueMs) / 86400000))

    let bucketKey: ARAgingBucket["bucket"]
    if (daysOverdue === 0) bucketKey = "current"
    else if (daysOverdue <= 30) bucketKey = "1_30"
    else if (daysOverdue <= 60) bucketKey = "31_60"
    else if (daysOverdue <= 90) bucketKey = "61_90"
    else bucketKey = "over_90"

    const client = Array.isArray(inv.client) ? inv.client[0] : inv.client

    buckets[bucketKey].total += outstanding
    buckets[bucketKey].count += 1
    buckets[bucketKey].invoices.push({
      id: inv.id,
      invoice_number: inv.invoice_number,
      client_name: client?.name ?? "Sin cliente",
      total: outstanding,
      due_date: inv.due_date,
      days_overdue: daysOverdue,
    })
  }

  return Object.values(buckets)
}

// ============================================================================
// Top clients
// ============================================================================

export async function getTopClients(
  studioId: string,
  opts: { limit?: number; year?: number } = {},
): Promise<TopClientEntry[]> {
  const limit = opts.limit ?? 10
  const sb = untypedServer()

  let query = sb
    .from("invoices")
    .select(
      `total, amount_paid, sent_at, paid_at, client_id, status,
       client:clients(id, name)`,
    )
    .eq("studio_id", studioId)
    .in("status", ["paid", "partially_paid"])
    .is("deleted_at", null)

  if (opts.year) {
    query = query
      .gte("sent_at", `${opts.year}-01-01`)
      .lt("sent_at", `${opts.year + 1}-01-01`)
  }

  const { data, error } = await query
  if (error)
    throwServiceError("REPORT_TOP_CLIENTS_FAILED", error, { studioId })

  type InvoiceRow = {
    total: number | string
    amount_paid: number | string
    sent_at: string | null
    paid_at: string | null
    client_id: string | null
    client?: { id: string; name: string } | { id: string; name: string }[] | null
  }
  const invoices = (data ?? []) as InvoiceRow[]

  const byClient = new Map<
    string,
    {
      clientId: string
      clientName: string
      totalRevenue: number
      invoiceCount: number
      lastInvoiceDate: string | null
    }
  >()

  for (const inv of invoices) {
    if (!inv.client_id) continue
    const client = Array.isArray(inv.client) ? inv.client[0] : inv.client
    const existing = byClient.get(inv.client_id) ?? {
      clientId: inv.client_id,
      clientName: client?.name ?? "Sin nombre",
      totalRevenue: 0,
      invoiceCount: 0,
      lastInvoiceDate: null as string | null,
    }
    existing.totalRevenue += Number(inv.amount_paid)
    existing.invoiceCount += 1
    if (
      inv.sent_at &&
      (!existing.lastInvoiceDate || inv.sent_at > existing.lastInvoiceDate)
    ) {
      existing.lastInvoiceDate = inv.sent_at
    }
    byClient.set(inv.client_id, existing)
  }

  return Array.from(byClient.values())
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, limit)
    .map((c) => ({
      ...c,
      averageInvoice: c.invoiceCount > 0 ? c.totalRevenue / c.invoiceCount : 0,
    }))
}
