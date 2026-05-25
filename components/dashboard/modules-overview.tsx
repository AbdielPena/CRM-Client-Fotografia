import Link from "next/link"
import {
  Wallet,
  Boxes,
  Mail,
  TrendingUp,
  TrendingDown,
  Package,
  Receipt,
  ArrowRight,
  AlertTriangle,
} from "lucide-react"

import { formatCurrency } from "@/lib/utils/currency"

export type ModulesOverviewData = {
  finance?: {
    incomeMonth: number
    expensesMonth: number
    netBalance: number
    receivablesPending: number
    payablesPending: number
    currency: string
  }
  inventory?: {
    totalItems: number
    lowStock: number
    activeLoans: number
    activeRentals: number
  }
  mail?: {
    unreadThreads: number
    accountsConfigured: number
  }
}

/**
 * Vista compacta de los 3 módulos del monolito (Finance/Inventory/Mail) para
 * el dashboard principal del CRM. Reemplaza la necesidad de saltar entre
 * módulos para ver el estado high-level.
 *
 * Si un módulo no tiene data (props.<module> = undefined), muestra placeholder
 * con CTA para configurar.
 */
export function ModulesOverview({ data }: { data: ModulesOverviewData }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-base font-semibold">Módulos</h2>
        <p className="text-[11px] text-muted-foreground">
          Resumen cross-módulo
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Finance */}
        <ModuleCard
          title="Finanzas"
          icon={<Wallet className="size-5" />}
          color="emerald"
          href="/finance"
          empty={!data.finance}
        >
          {data.finance && (
            <>
              <div className="space-y-2">
                <KpiRow
                  label="Ingresos del mes"
                  value={formatCurrency(data.finance.incomeMonth, data.finance.currency)}
                  icon={<TrendingUp className="size-3" />}
                  tone="positive"
                />
                <KpiRow
                  label="Gastos del mes"
                  value={formatCurrency(data.finance.expensesMonth, data.finance.currency)}
                  icon={<TrendingDown className="size-3" />}
                  tone="negative"
                />
                <KpiRow
                  label="Balance neto"
                  value={formatCurrency(data.finance.netBalance, data.finance.currency)}
                  tone={data.finance.netBalance >= 0 ? "positive" : "negative"}
                />
              </div>
              {(data.finance.receivablesPending > 0 ||
                data.finance.payablesPending > 0) && (
                <div className="mt-3 border-t border-border pt-2 text-[11px]">
                  {data.finance.receivablesPending > 0 && (
                    <p className="text-amber-700 dark:text-amber-300">
                      {data.finance.receivablesPending} CxC por cobrar
                    </p>
                  )}
                  {data.finance.payablesPending > 0 && (
                    <p className="text-red-700 dark:text-red-300">
                      {data.finance.payablesPending} CxP por pagar
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </ModuleCard>

        {/* Inventory */}
        <ModuleCard
          title="Inventario"
          icon={<Boxes className="size-5" />}
          color="indigo"
          href="/inventory"
          empty={!data.inventory}
        >
          {data.inventory && (
            <>
              <div className="space-y-2">
                <KpiRow
                  label="Items totales"
                  value={String(data.inventory.totalItems)}
                  icon={<Package className="size-3" />}
                  tone="neutral"
                />
                <KpiRow
                  label="En préstamo"
                  value={String(data.inventory.activeLoans)}
                  tone={data.inventory.activeLoans > 0 ? "info" : "neutral"}
                />
                <KpiRow
                  label="En renta"
                  value={String(data.inventory.activeRentals)}
                  tone={data.inventory.activeRentals > 0 ? "info" : "neutral"}
                />
              </div>
              {data.inventory.lowStock > 0 && (
                <div className="mt-3 flex items-center gap-1 border-t border-border pt-2 text-[11px] text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="size-3" />
                  {data.inventory.lowStock} items con stock bajo
                </div>
              )}
            </>
          )}
        </ModuleCard>

        {/* Mail */}
        <ModuleCard
          title="Correo"
          icon={<Mail className="size-5" />}
          color="purple"
          href="/mail/inbox"
          empty={!data.mail}
        >
          {data.mail && (
            <>
              <div className="space-y-2">
                <KpiRow
                  label="No leídos"
                  value={String(data.mail.unreadThreads)}
                  icon={<Mail className="size-3" />}
                  tone={data.mail.unreadThreads > 0 ? "info" : "neutral"}
                />
                <KpiRow
                  label="Cuentas configuradas"
                  value={String(data.mail.accountsConfigured)}
                  tone="neutral"
                />
              </div>
              {data.mail.accountsConfigured === 0 && (
                <div className="mt-3 border-t border-border pt-2 text-[11px] text-muted-foreground">
                  <Link
                    href="/settings/mail"
                    className="text-primary hover:underline"
                  >
                    Configurar Mailcow →
                  </Link>
                </div>
              )}
            </>
          )}
        </ModuleCard>
      </div>
    </section>
  )
}

function ModuleCard({
  title,
  icon,
  color,
  href,
  empty,
  children,
}: {
  title: string
  icon: React.ReactNode
  color: "emerald" | "indigo" | "purple"
  href: string
  empty: boolean
  children: React.ReactNode
}) {
  const colorClass = {
    emerald:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    indigo:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400",
    purple:
      "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  }[color]

  return (
    <Link
      href={href}
      className="sf-card group block p-5 transition-shadow hover:shadow-md"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`flex size-10 items-center justify-center rounded-lg ${colorClass}`}
          >
            {icon}
          </span>
          <h3 className="font-display text-lg">{title}</h3>
        </div>
        <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      {empty ? (
        <p className="text-xs text-muted-foreground">
          Sin datos. Configura el módulo para ver KPIs.
        </p>
      ) : (
        children
      )}
    </Link>
  )
}

function KpiRow({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: string
  icon?: React.ReactNode
  tone: "positive" | "negative" | "neutral" | "info"
}) {
  const cls =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
      ? "text-red-600 dark:text-red-400"
      : tone === "info"
      ? "text-indigo-600 dark:text-indigo-400"
      : "text-foreground"

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={`font-semibold tabular-nums ${cls}`}>{value}</span>
    </div>
  )
}
