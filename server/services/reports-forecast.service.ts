import "server-only"

import { untypedServer } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"

/**
 * Forecast service: proyecciones de revenue + cash flow 6 meses futuros.
 *
 * Datos usados:
 *   - fin_receivables pendientes con due_date → income proyectado
 *   - fin_payables pendientes con due_date → expenses proyectados
 *   - fin_subscriptions activas → recurrent gastos
 *   - invoices pendientes con due_date
 *   - projects con event_date futuro y total_amount
 */

export type ForecastEntry = {
  month: string // YYYY-MM
  expectedIncome: number
  expectedExpenses: number
  netProjected: number
  cumulativeProjected: number
  /** Sources detallados */
  breakdown: {
    receivables: number
    pendingInvoices: number
    upcomingProjects: number
    subscriptions: number
    payables: number
  }
}

const FRECUENCIA_DAYS: Record<string, number> = {
  semanal: 7,
  quincenal: 15,
  mensual: 30,
  bimestral: 60,
  trimestral: 90,
  semestral: 180,
  anual: 365,
}

export async function getForecast(
  studioId: string,
  opts: { months?: number } = {},
): Promise<ForecastEntry[]> {
  const months = opts.months ?? 6
  const sb = untypedServer()

  const now = new Date()
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const periodEnd = new Date(periodStart)
  periodEnd.setMonth(periodEnd.getMonth() + months)

  // 1. Receivables (cuentas por cobrar pendientes)
  const { data: receivablesData, error: rErr } = await sb
    .from("fin_receivables")
    .select("monto, due_date, status")
    .eq("studio_id", studioId)
    .in("status", ["pendiente", "parcial"])
    .is("deleted_at", null)
    .gte("due_date", periodStart.toISOString().slice(0, 10))
    .lt("due_date", periodEnd.toISOString().slice(0, 10))

  type ReceivableRow = {
    monto: number | string
    due_date: string | null
    status: string
  }
  const receivables: ReceivableRow[] =
    !rErr && receivablesData ? (receivablesData as ReceivableRow[]) : []

  // 2. Pending invoices (sin pago completo, status sent/pending/overdue)
  const { data: invoicesData } = await sb
    .from("invoices")
    .select("total, amount_paid, due_date, status")
    .eq("studio_id", studioId)
    .in("status", ["sent", "pending", "partially_paid", "overdue", "viewed"])
    .is("deleted_at", null)
    .gte("due_date", periodStart.toISOString().slice(0, 10))
    .lt("due_date", periodEnd.toISOString().slice(0, 10))

  type InvoiceRow = {
    total: number | string
    amount_paid: number | string
    due_date: string | null
    status: string
  }
  const invoices = (invoicesData ?? []) as InvoiceRow[]

  // 3. Upcoming projects con total_amount
  const { data: projectsData } = await sb
    .from("projects")
    .select("event_date, total_amount, status")
    .eq("studio_id", studioId)
    .in("status", ["booked", "in_progress"])
    .is("deleted_at", null)
    .gte("event_date", periodStart.toISOString().slice(0, 10))
    .lt("event_date", periodEnd.toISOString().slice(0, 10))

  type ProjectRow = {
    event_date: string | null
    total_amount: number | string | null
    status: string
  }
  const projects = (projectsData ?? []) as ProjectRow[]

  // 4. Pending payables
  const { data: payablesData } = await sb
    .from("fin_payables")
    .select("amount, due_date, status")
    .eq("studio_id", studioId)
    .eq("status", "pendiente")
    .is("deleted_at", null)
    .gte("due_date", periodStart.toISOString().slice(0, 10))
    .lt("due_date", periodEnd.toISOString().slice(0, 10))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .then((r: any) => ({ data: r.data, error: r.error }))
    .catch(() => ({ data: null, error: null }))

  type PayableRow = {
    amount: number | string
    due_date: string | null
    status: string
  }
  const payables = (payablesData ?? []) as PayableRow[]

  // 5. Active subscriptions (recurrent gastos)
  const { data: subsData } = await sb
    .from("fin_subscriptions")
    .select("monto, frecuencia, proxima_fecha")
    .eq("studio_id", studioId)
    .eq("activa", true)
    .is("deleted_at", null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .then((r: any) => ({ data: r.data, error: r.error }))
    .catch(() => ({ data: null, error: null }))

  type SubRow = {
    monto: number | string
    frecuencia: string
    proxima_fecha: string | null
  }
  const subs = (subsData ?? []) as SubRow[]

  // Build buckets por mes
  const result: ForecastEntry[] = []
  let cumulative = 0

  for (let i = 0; i < months; i++) {
    const monthStart = new Date(periodStart)
    monthStart.setMonth(monthStart.getMonth() + i)
    const monthEnd = new Date(monthStart)
    monthEnd.setMonth(monthEnd.getMonth() + 1)

    const isInMonth = (dateStr: string | null): boolean => {
      if (!dateStr) return false
      const d = new Date(dateStr)
      return d >= monthStart && d < monthEnd
    }

    const receivablesAmt = receivables
      .filter((r) => isInMonth(r.due_date))
      .reduce((s, r) => s + Number(r.monto), 0)

    const pendingInvoicesAmt = invoices
      .filter((i) => isInMonth(i.due_date))
      .reduce((s, i) => s + (Number(i.total) - Number(i.amount_paid)), 0)

    const upcomingProjectsAmt = projects
      .filter((p) => isInMonth(p.event_date))
      .reduce((s, p) => s + Number(p.total_amount ?? 0), 0)

    const payablesAmt = payables
      .filter((p) => isInMonth(p.due_date))
      .reduce((s, p) => s + Number(p.amount), 0)

    // Subs: si proxima_fecha o multiplo del periodo cae en el mes
    let subsAmt = 0
    for (const s of subs) {
      const intervalDays = FRECUENCIA_DAYS[s.frecuencia] ?? 30
      let date = s.proxima_fecha ? new Date(s.proxima_fecha) : new Date()
      // Generar fechas dentro del mes
      while (date < monthEnd) {
        if (date >= monthStart) {
          subsAmt += Number(s.monto)
          break
        }
        date = new Date(date)
        date.setDate(date.getDate() + intervalDays)
      }
    }

    const expectedIncome =
      receivablesAmt + pendingInvoicesAmt + upcomingProjectsAmt
    const expectedExpenses = payablesAmt + subsAmt
    const netProjected = expectedIncome - expectedExpenses
    cumulative += netProjected

    result.push({
      month: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`,
      expectedIncome,
      expectedExpenses,
      netProjected,
      cumulativeProjected: cumulative,
      breakdown: {
        receivables: receivablesAmt,
        pendingInvoices: pendingInvoicesAmt,
        upcomingProjects: upcomingProjectsAmt,
        subscriptions: subsAmt,
        payables: payablesAmt,
      },
    })
  }

  return result
}
