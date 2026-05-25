import Link from "next/link"
import {
  HeartHandshake,
  CheckCircle2,
  Clock,
  Calculator,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getFinTitheRecords } from "@/server/services/fin-tithe.service"
import { formatCurrency, formatDate } from "@/lib/utils/currency"
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

import { ComputeTitheButton } from "./compute-tithe-button"

export const metadata: Metadata = { title: "Finanzas · Diezmo" }

export default async function FinanceTithePage() {
  const session = await requireStudioAuth()

  const [records, unread] = await Promise.all([
    getFinTitheRecords(session.studioId, { pageSize: 100 }),
    countUnreadNotifications(session.studioId),
  ])

  // KPIs
  const pendientes = records.items.filter((r) => !r.pagado)
  const pagados = records.items.filter((r) => r.pagado)
  const totalPendiente = pendientes.reduce(
    (acc, r) => acc.plus(d(r.monto_diezmo)),
    d(0),
  )
  const totalPagadoYTD = pagados
    .filter((r) => r.fecha.startsWith(new Date().getFullYear().toString()))
    .reduce((acc, r) => acc.plus(d(r.monto_diezmo)), d(0))

  return (
    <>
      <AppTopbar
        eyebrow="Finanzas"
        title="Diezmo (10%)"
        description="Cálculo automático del 10% sobre ingresos marcados con 'aplica_diezmo'. Cron mensual día 28."
        unreadNotifications={unread}
        actions={<ComputeTitheButton />}
      />

      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {records.items.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard
              label="Pendiente de pago"
              value={formatCurrency(totalPendiente.toNumber())}
              icon={<Clock className="size-4" />}
              tone={totalPendiente.gt(0) ? "warning" : "neutral"}
              count={pendientes.length}
            />
            <KpiCard
              label={`Pagado en ${new Date().getFullYear()}`}
              value={formatCurrency(totalPagadoYTD.toNumber())}
              icon={<CheckCircle2 className="size-4" />}
              tone="positive"
              count={pagados.length}
            />
            <KpiCard
              label="Periodos calculados"
              value={String(records.total)}
              icon={<Calculator className="size-4" />}
              tone="neutral"
            />
          </div>
        )}

        {records.total === 0 ? (
          <EmptyState
            icon={
              <HeartHandshake className="size-12 text-muted-foreground/60" />
            }
            title="Sin registros de diezmo"
            description="Marca ingresos con 'aplica_diezmo=true' en las transacciones y luego calcula el mes."
          >
            <ComputeTitheButton />
          </EmptyState>
        ) : (
          <DataTable>
            <DataTableHeader>
              <DataTableRow>
                <DataTableColumn>Periodo</DataTableColumn>
                <DataTableColumn className="text-right">
                  Base de cálculo
                </DataTableColumn>
                <DataTableColumn className="text-right">
                  Diezmo (10%)
                </DataTableColumn>
                <DataTableColumn>Fecha pago</DataTableColumn>
                <DataTableColumn>Estado</DataTableColumn>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {records.items.map((r) => {
                const periodLabel = r.fecha.slice(0, 7) // YYYY-MM
                return (
                  <DataTableRow key={r.id} className="hover:bg-accent/30">
                    <DataTableCell>
                      <p className="font-mono text-sm font-semibold">
                        {periodLabel}
                      </p>
                    </DataTableCell>
                    <DataTableCell className="text-right tabular-nums text-muted-foreground">
                      {formatCurrency(Number(r.base_calculo))}
                    </DataTableCell>
                    <DataTableCell className="text-right tabular-nums font-semibold">
                      {formatCurrency(Number(r.monto_diezmo))}
                    </DataTableCell>
                    <DataTableCell className="text-xs text-muted-foreground">
                      {r.fecha_pago
                        ? formatDate(new Date(r.fecha_pago))
                        : "—"}
                    </DataTableCell>
                    <DataTableCell>
                      {r.pagado ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          <CheckCircle2 className="size-3" />
                          Pagado
                        </span>
                      ) : (
                        <Link
                          href={`/finance/tithe/${r.id}`}
                          className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300"
                        >
                          <Clock className="size-3" />
                          Pendiente · marcar pagado
                        </Link>
                      )}
                    </DataTableCell>
                  </DataTableRow>
                )
              })}
            </DataTableBody>
          </DataTable>
        )}

        <div className="rounded-xl border border-input bg-card p-4 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">¿Cómo funciona?</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              Cada transacción tipo='ingreso' tiene un checkbox{" "}
              <code className="rounded bg-muted px-1">aplica_diezmo</code>.
              Márcalo para los pagos de clientes (no para reembolsos).
            </li>
            <li>
              El cron del día 28 de cada mes agrupa los ingresos del mes
              anterior y calcula el 10%.
            </li>
            <li>
              Si agregas ingresos retroactivamente, vuelve a calcular el mes
              con "Calcular ahora" (mientras no esté pagado).
            </li>
            <li>
              Al marcar como pagado, opcionalmente crea una{" "}
              <code className="rounded bg-muted px-1">fin_transactions.gasto</code>
              con tag de no-business para no afectar utilidad operacional.
            </li>
          </ul>
        </div>
      </main>
    </>
  )
}

function KpiCard({
  label,
  value,
  icon,
  tone,
  count,
}: {
  label: string
  value: string
  icon: React.ReactNode
  tone: "positive" | "warning" | "neutral"
  count?: number
}) {
  const iconClass =
    tone === "positive"
      ? "text-emerald-500"
      : tone === "warning"
        ? "text-amber-500"
        : "text-muted-foreground"
  return (
    <div className="sf-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className={iconClass}>{icon}</span>
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums">{value}</p>
      {count != null && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {count} {count === 1 ? "registro" : "registros"}
        </p>
      )}
    </div>
  )
}
