import Link from "next/link"
import { HandCoins, Plus, Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getFinLoans } from "@/server/services/fin-loan.service"
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

export const metadata: Metadata = { title: "Finanzas · Préstamos otorgados" }

export default async function FinanceLoansPage() {
  const session = await requireStudioAuth()
  const [loans, unread] = await Promise.all([
    getFinLoans(session.studioId, { pageSize: 100 }),
    countUnreadNotifications(session.studioId),
  ])

  const activeLoans = loans.items.filter((l) => l.estado === "activo")
  const totalPendingByMe = activeLoans.reduce(
    (acc, l) => acc.plus(d(l.saldo_pendiente)),
    d(0),
  )

  return (
    <>
      <AppTopbar
        eyebrow="Finanzas"
        title="Préstamos otorgados"
        description="Dinero que tú prestaste a alguien y aún no te ha pagado."
        unreadNotifications={unread}
        actions={
          <Button asChild>
            <Link href="/finance/loans/new">
              <Plus className="mr-1 size-4" />
              Nuevo préstamo
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {loans.items.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <KpiCard
              label="Por cobrar (activos)"
              value={Number(totalPendingByMe.toFixed(2))}
              tone="warning"
              icon={<HandCoins className="size-4" />}
            />
            <KpiCard
              label="Préstamos activos"
              value={activeLoans.length}
              isInt
              tone="neutral"
              icon={<Clock className="size-4" />}
            />
          </div>
        )}

        {loans.total === 0 ? (
          <EmptyState
            icon={<HandCoins className="size-12 text-muted-foreground/60" />}
            title="Sin préstamos otorgados"
            description="Registra cuando le prestes dinero a alguien para llevar tracking."
          >
            <Button asChild>
              <Link href="/finance/loans/new">
                <Plus className="mr-1 size-4" />
                Registrar primer préstamo
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <DataTable>
            <DataTableHeader>
              <DataTableRow>
                <DataTableColumn>Deudor</DataTableColumn>
                <DataTableColumn className="text-right">Monto original</DataTableColumn>
                <DataTableColumn className="text-right">Saldo</DataTableColumn>
                <DataTableColumn>Inicio</DataTableColumn>
                <DataTableColumn>Estado</DataTableColumn>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {loans.items.map((row) => (
                <DataTableRow key={row.id} className="hover:bg-accent/30">
                  <DataTableCell>
                    <Link
                      href={`/finance/loans/${row.id}`}
                      className="font-medium hover:underline"
                    >
                      {row.deudor}
                    </Link>
                  </DataTableCell>
                  <DataTableCell className="text-right tabular-nums">
                    {formatCurrency(Number(row.monto_original), row.currency)}
                  </DataTableCell>
                  <DataTableCell className="text-right tabular-nums font-semibold">
                    <span
                      className={
                        Number(row.saldo_pendiente) === 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-amber-600 dark:text-amber-400"
                      }
                    >
                      {formatCurrency(Number(row.saldo_pendiente), row.currency)}
                    </span>
                  </DataTableCell>
                  <DataTableCell className="text-xs text-muted-foreground">
                    {row.fecha_inicio
                      ? formatDateShort(new Date(row.fecha_inicio))
                      : "—"}
                  </DataTableCell>
                  <DataTableCell>
                    <LoanStatusBadge estado={row.estado} />
                  </DataTableCell>
                </DataTableRow>
              ))}
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
  tone: "warning" | "neutral"
  icon: React.ReactNode
  isInt?: boolean
}) {
  const iconClass = tone === "warning" ? "text-amber-500" : "text-muted-foreground"
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

function LoanStatusBadge({ estado }: { estado: string }) {
  const map: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    activo: { label: "Activo", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300", Icon: Clock },
    cobrado: { label: "Cobrado", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", Icon: CheckCircle2 },
    perdido: { label: "Perdido", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300", Icon: AlertTriangle },
    cancelado: { label: "Cancelado", cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500", Icon: XCircle },
  }
  const m = map[estado] ?? map.activo
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${m.cls}`}>
      <m.Icon className="size-3" />
      {m.label}
    </span>
  )
}
