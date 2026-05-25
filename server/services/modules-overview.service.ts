import "server-only"

import { untypedServer } from "@/server/supabase/untyped"
import type { ModulesOverviewData } from "@/components/dashboard/modules-overview"

/**
 * Recolecta KPIs cross-módulo para el dashboard principal del CRM.
 *
 * Estrategia:
 *   - 1 sola query function que hace fan-out parallel a las 3 tablas heads
 *     de cada módulo (fin_*, inv_*, mail_*)
 *   - Best-effort: si una tabla no existe (migration no aplicada), su
 *     módulo queda undefined en el resultado y el component lo renderiza
 *     como empty state
 *   - Cap de queries para evitar overcost: solo summary aggregates,
 *     no listados completos
 *
 * Uso desde Server Component:
 *   const moduleData = await getModulesOverview(studioId)
 *   <ModulesOverview data={moduleData} />
 */

export async function getModulesOverview(
  studioId: string,
): Promise<ModulesOverviewData> {
  const sb = untypedServer()

  // Mes actual para queries de transactions
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10)

  // Fan-out de queries — cada módulo independiente. Si una tabla no existe,
  // catch silencioso y dejamos undefined.
  const [financeData, inventoryData, mailData] = await Promise.all([
    fetchFinanceKpis(sb, studioId, firstOfMonth).catch(() => undefined),
    fetchInventoryKpis(sb, studioId).catch(() => undefined),
    fetchMailKpis(sb, studioId).catch(() => undefined),
  ])

  return {
    finance: financeData,
    inventory: inventoryData,
    mail: mailData,
  }
}

// ============================================================================
// Finance KPIs
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchFinanceKpis(sb: any, studioId: string, firstOfMonth: string) {
  const [incomeRes, expensesRes, recvRes, payRes] = await Promise.all([
    sb
      .from("fin_transactions")
      .select("monto, currency")
      .eq("studio_id", studioId)
      .eq("tipo", "ingreso")
      .eq("is_business", true)
      .gte("fecha", firstOfMonth)
      .is("deleted_at", null),
    sb
      .from("fin_transactions")
      .select("monto, currency")
      .eq("studio_id", studioId)
      .eq("tipo", "gasto")
      .eq("is_business", true)
      .gte("fecha", firstOfMonth)
      .is("deleted_at", null),
    sb
      .from("fin_receivables")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .in("estado", ["pendiente", "parcial", "vencida"])
      .is("deleted_at", null),
    sb
      .from("fin_payables")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .in("estado", ["pendiente", "parcial", "vencida"])
      .is("deleted_at", null),
  ])

  const incomeRows = (incomeRes.data ?? []) as Array<{ monto: number | string; currency: string }>
  const expenseRows = (expensesRes.data ?? []) as Array<{ monto: number | string; currency: string }>

  // Currency primary = el más común en el mes (heurística simple)
  const currencyCounts = new Map<string, number>()
  for (const r of [...incomeRows, ...expenseRows]) {
    currencyCounts.set(r.currency, (currencyCounts.get(r.currency) ?? 0) + 1)
  }
  const primaryCurrency = Array.from(currencyCounts.entries()).sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0] ?? "DOP"

  const incomeMonth = incomeRows
    .filter((r) => r.currency === primaryCurrency)
    .reduce((acc, r) => acc + Number(r.monto ?? 0), 0)
  const expensesMonth = expenseRows
    .filter((r) => r.currency === primaryCurrency)
    .reduce((acc, r) => acc + Number(r.monto ?? 0), 0)

  return {
    incomeMonth: Number(incomeMonth.toFixed(2)),
    expensesMonth: Number(expensesMonth.toFixed(2)),
    netBalance: Number((incomeMonth - expensesMonth).toFixed(2)),
    receivablesPending: recvRes.count ?? 0,
    payablesPending: payRes.count ?? 0,
    currency: primaryCurrency,
  }
}

// ============================================================================
// Inventory KPIs
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchInventoryKpis(sb: any, studioId: string) {
  const [itemsRes, loansRes, rentalsRes] = await Promise.all([
    sb
      .from("inv_items")
      .select("quantity_total, min_stock, quantity_loaned, quantity_rented")
      .eq("studio_id", studioId)
      .eq("is_active", true)
      .is("deleted_at", null),
    sb
      .from("inv_loans")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .eq("status", "activo"),
    sb
      .from("inv_rentals")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .eq("status", "activa"),
  ])

  const items = (itemsRes.data ?? []) as Array<{
    quantity_total: number
    min_stock: number
    quantity_loaned: number
    quantity_rented: number
  }>

  const totalItems = items.length
  const lowStock = items.filter((it) => it.quantity_total <= it.min_stock).length

  return {
    totalItems,
    lowStock,
    activeLoans: loansRes.count ?? 0,
    activeRentals: rentalsRes.count ?? 0,
  }
}

// ============================================================================
// Mail KPIs
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchMailKpis(sb: any, studioId: string) {
  const [unreadRes, accountsRes] = await Promise.all([
    sb
      .from("mail_threads")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .gt("unread_count", 0)
      .is("deleted_at", null),
    sb
      .from("mail_accounts")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .eq("is_active", true)
      .is("deleted_at", null),
  ])

  return {
    unreadThreads: unreadRes.count ?? 0,
    accountsConfigured: accountsRes.count ?? 0,
  }
}
