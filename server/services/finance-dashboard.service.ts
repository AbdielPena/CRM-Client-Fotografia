import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { throwServiceError } from "@/lib/utils/api-error"
import { listFinanzAppAccounts } from "./finanzapp-bridge.service"

/**
 * Datos para /finance (CRM): lista de pagos del CRM enriquecidos con la
 * cuenta destino de FinanzApp + agregados (mes actual, anterior, YTD,
 * por cuenta) + pendientes de asignar cuenta.
 *
 * Esta vista NO toca finanzapp.transactions: solo lee `payments` del CRM y
 * cruza el id de cuenta contra el listado vivo de FinanzApp. Es deliberado —
 * la única fuente de verdad de la cuenta es FinanzApp; aquí solo mostramos.
 */

export type CrmPaymentRow = {
  id: string
  amount: number
  currency: string
  method: string
  receivedAt: string
  reference: string | null
  invoiceId: string
  invoiceNumber: string | null
  clientName: string | null
  finanzappAccountId: string | null
  finanzappAccountName: string | null
  finanzappAccountBank: string | null
  /** True si no tiene cuenta destino (badge "pendiente"). */
  pending: boolean
}

export type AccountAggregate = {
  accountId: string
  accountName: string
  bank: string | null
  total: number
  count: number
}

export type FinanceDashboardData = {
  payments: CrmPaymentRow[]
  totalsByMonth: { thisMonth: number; lastMonth: number; ytd: number }
  byAccount: AccountAggregate[]
  pendingTotal: number
  pendingCount: number
  accounts: Awaited<ReturnType<typeof listFinanzAppAccounts>>
  defaultAccountId: string | null
}

export async function getFinanceDashboard(
  studioId: string,
  opts: { limit?: number } = {},
): Promise<FinanceDashboardData> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 10), 500)
  const sb = untypedService()

  const [paymentsRes, studioRes, accounts] = await Promise.all([
    sb
      .from("payments")
      .select(
        `id, amount, currency, method, received_at, transaction_reference,
         invoice_id, finanzapp_account_id,
         invoice:invoices(invoice_number, client:clients(name))`,
      )
      .eq("studio_id", studioId)
      .eq("status", "completed")
      .is("deleted_at", null)
      .order("received_at", { ascending: false })
      .limit(limit),
    sb
      .from("studios")
      .select("default_finance_account_id")
      .eq("id", studioId)
      .maybeSingle(),
    listFinanzAppAccounts(studioId),
  ])

  if (paymentsRes.error)
    throwServiceError("FINANCE_DASHBOARD_FAILED", paymentsRes.error, { studioId })

  const accountById = new Map(accounts.map((a) => [a.id, a]))
  const rawPayments = (paymentsRes.data ?? []) as Array<Record<string, unknown>>

  const payments: CrmPaymentRow[] = rawPayments.map((p) => {
    const invRel = p.invoice as
      | { invoice_number?: string | null; client?: { name?: string | null } | Array<{ name?: string | null }> | null }
      | Array<{ invoice_number?: string | null; client?: { name?: string | null } | Array<{ name?: string | null }> | null }>
      | null
    const inv = Array.isArray(invRel) ? invRel[0] : invRel
    const clientRel = inv?.client
    const client = Array.isArray(clientRel) ? clientRel[0] : clientRel

    const accId = (p.finanzapp_account_id as string | null) ?? null
    const acc = accId ? accountById.get(accId) : undefined

    return {
      id: p.id as string,
      amount: Number(p.amount ?? 0),
      currency: (p.currency as string | null) ?? "DOP",
      method: (p.method as string | null) ?? "other",
      receivedAt: (p.received_at as string | null) ?? new Date().toISOString(),
      reference: (p.transaction_reference as string | null) ?? null,
      invoiceId: p.invoice_id as string,
      invoiceNumber: inv?.invoice_number ?? null,
      clientName: client?.name ?? null,
      finanzappAccountId: accId,
      finanzappAccountName: acc?.nombre ?? null,
      finanzappAccountBank: acc?.banco ?? null,
      pending: !accId,
    }
  })

  // Totales por mes (basados en received_at)
  const now = new Date()
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const totalsByMonth = { thisMonth: 0, lastMonth: 0, ytd: 0 }

  for (const p of payments) {
    const d = new Date(p.receivedAt)
    if (d >= yearStart) totalsByMonth.ytd += p.amount
    if (d >= monthStart) totalsByMonth.thisMonth += p.amount
    else if (d >= lastMonthStart && d < monthStart) totalsByMonth.lastMonth += p.amount
  }

  // Por cuenta (solo los asignados)
  const byAccountMap = new Map<string, AccountAggregate>()
  let pendingTotal = 0
  let pendingCount = 0
  for (const p of payments) {
    if (!p.finanzappAccountId) {
      pendingTotal += p.amount
      pendingCount += 1
      continue
    }
    const acc = accountById.get(p.finanzappAccountId)
    const key = p.finanzappAccountId
    const entry =
      byAccountMap.get(key) ??
      ({
        accountId: key,
        accountName: acc?.nombre ?? "Cuenta eliminada",
        bank: acc?.banco ?? null,
        total: 0,
        count: 0,
      } as AccountAggregate)
    entry.total += p.amount
    entry.count += 1
    byAccountMap.set(key, entry)
  }

  const byAccount = Array.from(byAccountMap.values()).sort((a, b) => b.total - a.total)

  const defaultAccountId =
    (studioRes.data as { default_finance_account_id?: string | null } | null)
      ?.default_finance_account_id ?? null

  return {
    payments,
    totalsByMonth,
    byAccount,
    pendingTotal,
    pendingCount,
    accounts,
    defaultAccountId,
  }
}
