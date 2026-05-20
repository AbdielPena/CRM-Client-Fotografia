import "server-only"

import { createSupabaseServerClient } from "@/server/supabase/server"
import type { ModuleDefinition } from "@/lib/types/dashboard"

/**
 * Service que agrega KPIs cross-módulo para el dashboard principal.
 *
 * Cada módulo del monolito (CRM / Finance / Inventory / Mail) declara sus
 * propios KPIs aquí. Si una tabla todavía no existe en la DB (porque la
 * migration no se aplicó), los counts vuelven a 0 sin reventar la página.
 *
 * Output: ModuleSummary[] que se pasa a ModuleCard[] en el dashboard.
 *
 * Performance: queries en paralelo via Promise.allSettled. Cada query
 * usa head:true (no devuelve rows, solo count). 8 queries totales ~ 200ms.
 */

export type ModuleSummary = ModuleDefinition & {
  status: "ok" | "degraded" | "down" | "unknown"
  kpis: Array<{ label: string; value: string | number; tone?: "positive" | "warning" | "danger" | "neutral" }>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeCount(client: any, table: string, studioId: string, filters: Record<string, unknown> = {}): Promise<number> {
  try {
    let q = client.from(table).select("id", { count: "exact", head: true }).eq("studio_id", studioId)
    if (!Object.prototype.hasOwnProperty.call(filters, "include_deleted")) {
      q = q.is("deleted_at", null)
    }
    for (const [k, v] of Object.entries(filters)) {
      if (k === "include_deleted") continue
      if (Array.isArray(v)) q = q.in(k, v as unknown[])
      else q = q.eq(k, v)
    }
    const { count, error } = await q
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

export async function getModulesOverview(studioId: string): Promise<ModuleSummary[]> {
  const supabase = createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = supabase

  // Run all counts in parallel
  const [
    crmClients,
    crmActiveProjects,
    crmPendingLeads,
    finPendingPayables,
    finActiveDebts,
    finActiveSubs,
    invItems,
    invActiveLoans,
    invActiveRentals,
    invMaintPending,
    mailAccounts,
    mailUnreadThreads,
  ] = await Promise.all([
    safeCount(sb, "clients", studioId),
    safeCount(sb, "projects", studioId, { status: ["booked", "in_progress", "editing"] }),
    safeCount(sb, "leads", studioId, { status: "new" }),
    safeCount(sb, "fin_payables", studioId, { status: "pendiente" }),
    safeCount(sb, "fin_debts", studioId, { estado: "activa" }),
    safeCount(sb, "fin_subscriptions", studioId, { activa: true }),
    safeCount(sb, "inv_items", studioId, { is_active: true }),
    safeCount(sb, "inv_loans", studioId, { status: "activo" }),
    safeCount(sb, "inv_rentals", studioId, { status: ["confirmada", "en_curso"] }),
    safeCount(sb, "inv_maintenance_records", studioId, { status: ["pendiente", "en_proceso"], include_deleted: true }),
    safeCount(sb, "mail_accounts", studioId, { is_active: true }),
    safeCount(sb, "mail_threads", studioId).then(async (totalThreads) => {
      // Unread = threads con unread_count > 0
      try {
        const { count } = await sb
          .from("mail_threads")
          .select("id", { count: "exact", head: true })
          .eq("studio_id", studioId)
          .is("deleted_at", null)
          .gt("unread_count", 0)
        return count ?? 0
      } catch {
        return totalThreads
      }
    }),
  ])

  return [
    {
      id: "crm",
      name: "CRM",
      description: "Clientes, proyectos, leads y sesiones",
      color: "#7C3AED",
      iconName: "Camera",
      href: "/clients",
      enabled: true,
      status: "ok",
      quickActions: [
        { label: "Nuevo cliente", href: "/clients/new" },
        { label: "Ver proyectos", href: "/projects" },
        { label: "Pipeline leads", href: "/leads" },
      ],
      kpis: [
        { label: "Clientes", value: crmClients, tone: "neutral" },
        { label: "Proyectos activos", value: crmActiveProjects, tone: crmActiveProjects > 0 ? "positive" : "neutral" },
        { label: "Leads nuevos", value: crmPendingLeads, tone: crmPendingLeads > 0 ? "warning" : "neutral" },
      ],
    },
    {
      id: "finance",
      name: "Finanzas",
      description: "Cuentas, transacciones, deudas y metas",
      color: "#10B981",
      iconName: "Wallet",
      href: "/finance",
      enabled: true,
      status: "ok",
      quickActions: [
        { label: "Cuentas", href: "/finance/accounts" },
        { label: "Suscripciones", href: "/finance/subscriptions" },
        { label: "Diezmo", href: "/finance/tithe" },
      ],
      kpis: [
        { label: "Pagos pendientes", value: finPendingPayables, tone: finPendingPayables > 0 ? "warning" : "neutral" },
        { label: "Deudas activas", value: finActiveDebts, tone: finActiveDebts > 0 ? "warning" : "neutral" },
        { label: "Suscripciones", value: finActiveSubs, tone: "neutral" },
      ],
    },
    {
      id: "inventory",
      name: "Inventario",
      description: "Equipos, préstamos, alquileres y mantenimiento",
      color: "#F59E0B",
      iconName: "Package",
      href: "/inventory",
      enabled: true,
      status: invMaintPending > 0 ? "degraded" : "ok",
      quickActions: [
        { label: "Equipos", href: "/inventory/items" },
        { label: "Préstamos", href: "/inventory/loans" },
        { label: "Mantenimiento", href: "/inventory/maintenance" },
      ],
      kpis: [
        { label: "Equipos", value: invItems, tone: "neutral" },
        { label: "Préstamos / Rentas activas", value: invActiveLoans + invActiveRentals, tone: "neutral" },
        { label: "Mantenimiento", value: invMaintPending, tone: invMaintPending > 0 ? "warning" : "neutral" },
      ],
    },
    {
      id: "mail",
      name: "Correo",
      description: "Inbox unificado con Mailcow IMAP+SMTP",
      color: "#F97316",
      iconName: "Mail",
      href: "/mail/inbox",
      enabled: mailAccounts > 0,
      status: mailAccounts === 0 ? "unknown" : "ok",
      quickActions:
        mailAccounts > 0
          ? [
              { label: "Bandeja", href: "/mail/inbox" },
              { label: "Borradores", href: "/mail/drafts" },
              { label: "Redactar", href: "/mail/compose" },
            ]
          : [{ label: "Configurar Mailcow", href: "/settings/mail" }],
      kpis: [
        { label: "Cuentas activas", value: mailAccounts, tone: mailAccounts > 0 ? "positive" : "neutral" },
        { label: "Conversaciones no leídas", value: mailUnreadThreads, tone: mailUnreadThreads > 0 ? "warning" : "neutral" },
        { label: "Setup", value: mailAccounts > 0 ? "Listo" : "Pendiente", tone: mailAccounts > 0 ? "positive" : "warning" },
      ],
    },
  ]
}
