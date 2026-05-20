import Link from "next/link"
import { CreditCard, Plus, Clock, CheckCircle2, XCircle } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getFinDebts } from "@/server/services/fin-debt.service"
import { formatCurrency, formatDateShort } from "@/lib/utils/currency"
import { d } from "@/lib/decimal"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableColumn,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table"

export const metadata: Metadata = { title: "Finanzas · Deudas" }

export default async function FinanceDebtsPage() {
  const session = await requireStudioAuth()
  const [debts, unread] = await Promise.all([
    getFinDebts(session.studioId, { pageSize: 100 }),
    countUnreadNotifications(session.studioId),
  ])

  const activeDebts = debts.items.filter((d) => d.estado === "activa")
  const totalActiveBalance = activeDebts.reduce(
    (acc, d2) => acc.plus(d(d2.saldo_pendiente)),
    d(0),
  )
  const totalOriginal = activeDebts.reduce(
    (acc, d2) => acc.plus(d(d2.monto_original)),
    d(0),
  )
  const totalPaid = totalOriginal.minus(totalActiveBalance)

  return (
    <>
      <AppTopbar
        eyebrow="Finanzas"
        title="Deudas"
        description="Préstamos estructurados con cuotas, financiamiento o plan de pago."
        unreadNotifications={unread}
        actions={
          <Button asChild>
            <Link href="/finance/debts/new">
              <Plus className="mr-1 size-4" />
              Nueva deuda
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {debts.items.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard
              label="Saldo activo"
              value={Number(totalActiveBalance.toFixed(2))}
              tone="danger"
              icon={<CreditCard className="size-4" />}
            />
            <KpiCard
              label="Ya pagado"
              value={Number(totalPaid.toFixed(2))}
              tone="positive"
              icon={<CheckCircle2 className="size-4" />}
            />
            <KpiCard
              label="Deudas activas"
              value={activeDebts.length}
              isInt
              tone="neutral"
              icon={<Clock className="size-4" />}
            />
          </div>
        )}

        {debts.total === 0 ? (
          <EmptyState
            icon={<CreditCard className="size-12 text-muted-foreground/60" />}
            title="Sin deudas registradas"
            description="Registra préstamos bancarios, financiamientos o planes de pago aquí."
          >
            <Button asChild>
              <Link href="/finance/debts/new">
                <Plus className="mr-1 size-4" />
                Crear primera deuda
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <DataTable>
            <DataTableHeader>
              <DataTableRow>
                <DataTableColumn>Acreedor</DataTableColumn>
                <DataTableColumn className="text-right">Monto original</DataTableColumn>
                <DataTableColumn className="text-right">Saldo</DataTableColumn>
                <DataTableColumn>Cuotas</DataTableColumn>
                <DataTableColumn>Próximo pago</DataTableColumn>
                <DataTableColumn>Estado</DataTableColumn>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {debts.items.map((row) => {
                const progressPct = Number(
                  d(row.monto_original).gt(0)
                    ? d(row.monto_original)
                        .minus(d(row.saldo_pendiente))
                        .div(d(row.monto_original))
                        .times(100)
                        .toFixed(0)
                    : 0,
                )
                return (
                  <DataTableRow key={row.id} className="hover:bg-accent/30">
                    <DataTableCell>
                      <Link
                        href={`/finance/debts/${row.id}`}
                        className="font-medium hover:underline"
                      >
                        {row.acreedor}
                      </Link>
                    </DataTableCell>
                    <DataTableCell className="text-right tabular-nums">
                      {formatCurrency(Number(row.monto_original), row.currency)}
                    </DataTableCell>
                    <DataTableCell className="text-right tabular-nums">
                      <div className="font-semibold">
                        {formatCurrency(Number(row.saldo_pendiente), row.currency)}
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-emerald-500 transition-all"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {progressPct}% pagado
                      </div>
                    </DataTableCell>
                    <DataTableCell className="text-xs">
                      {row.cuotas_total != null
                        ? `${row.cuotas_pagadas} / ${row.cuotas_total}`
                        : "—"}
                    </DataTableCell>
                    <DataTableCell className="text-xs text-muted-foreground">
                      {row.fecha_proximo_pago
                        ? formatDateShort(new Date(row.fecha_proximo_pago))
                        : "—"}
                    </DataTableCell>
                    <DataTableCell>
                      <DebtStatusBadge estado={row.estado} />
                    </DataTableCell>
                  </DataTableRow>
                )
              })}
            </DataTableBody>
          </DataTable>
        )}
      </main>
    </>
  )
}

function KpiCard({
  label,
  value,
  tone,
  icon,
  isInt,
}: {
  label: string
  value: number
  tone: "positive" | "danger" | "neutral"
  icon: React.ReactNode
  isInt?: boolean
}) {
  const iconClass =
    tone === "positive" ? "text-emerald-500" : tone === "danger" ? "text-red-500" : "text-muted-foreground"
  return (
    <div className="sf-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className={iconClass}>{icon}</span>
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums">
        {isInt ? value : formatCurrency(value)}
      </p>
    </div>
  )
}

function DebtStatusBadge({ estado }: { estado: string }) {
  const map: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    activa: { label: "Activa", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300", Icon: Clock },
    pagada: { label: "Pagada", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", Icon: CheckCircle2 },
    reestructurada: { label: "Reestruct.", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300", Icon: Clock },
    cancelada: { label: "Cancelada", cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500", Icon: XCircle },
  }
  const m = map[estado] ?? map.activa
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${m.cls}`}>
      <m.Icon className="size-3" />
      {m.label}
    </span>
  )
}
