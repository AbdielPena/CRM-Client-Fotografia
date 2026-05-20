import Link from "next/link"
import {
  Receipt,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  User,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getFinReceivables } from "@/server/services/fin-receivable.service"
import { formatCurrency, formatDateShort } from "@/lib/utils/currency"
import { d } from "@/lib/decimal"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { SearchInput } from "@/components/shared/search-input"
import { EmptyState } from "@/components/shared/empty-state"
import { Pagination } from "@/components/shared/pagination"
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableColumn,
  DataTableFooter,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table"

export const metadata: Metadata = { title: "Finanzas · Cuentas por Cobrar" }

const PAGE_SIZE = 30

type SearchParamsShape = {
  q?: string
  page?: string
  estado?: string
  overdue?: string
}

export default async function FinanceReceivablesPage({
  searchParams,
}: {
  searchParams?: SearchParamsShape
}) {
  const session = await requireStudioAuth()

  const search = searchParams?.q?.trim() ?? ""
  const page = Math.max(1, Number(searchParams?.page) || 1)
  const estado =
    searchParams?.estado === "pendiente" ||
    searchParams?.estado === "parcial" ||
    searchParams?.estado === "cobrada" ||
    searchParams?.estado === "vencida" ||
    searchParams?.estado === "cancelada"
      ? searchParams.estado
      : undefined
  const overdueOnly = searchParams?.overdue === "1"

  const [receivables, unread] = await Promise.all([
    getFinReceivables(session.studioId, {
      search: search || undefined,
      estado,
      overdueOnly,
      page,
      pageSize: PAGE_SIZE,
    }),
    countUnreadNotifications(session.studioId),
  ])

  // KPI totales por estado
  const totalPending = receivables.items
    .filter((r) => r.estado === "pendiente" || r.estado === "parcial" || r.estado === "vencida")
    .reduce(
      (acc, r) =>
        acc.plus(d(r.monto).minus(d(r.monto_cobrado))),
      d(0),
    )
  const totalCobrado = receivables.items.reduce(
    (acc, r) => acc.plus(d(r.monto_cobrado)),
    d(0),
  )

  return (
    <>
      <AppTopbar
        eyebrow="Finanzas"
        title="Cuentas por Cobrar"
        description="Lo que tus clientes te deben. Las invoices del CRM pueden tener su CxC vinculado para tracking."
        unreadNotifications={unread}
        actions={
          <Button asChild>
            <Link href="/finance/receivables/new">
              <Plus className="mr-1 size-4" />
              Nuevo CxC
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* KPIs */}
        {receivables.items.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard
              label="Por cobrar"
              value={Number(totalPending.toFixed(2))}
              currency={receivables.items[0]?.currency ?? "DOP"}
              tone="warning"
              icon={<Clock className="size-4" />}
            />
            <KpiCard
              label="Ya cobrado"
              value={Number(totalCobrado.toFixed(2))}
              currency={receivables.items[0]?.currency ?? "DOP"}
              tone="positive"
              icon={<CheckCircle2 className="size-4" />}
            />
            <KpiCard
              label="Total registros"
              value={receivables.total}
              isInt
              tone="neutral"
              icon={<Receipt className="size-4" />}
            />
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput placeholder="Buscar cliente o notas..." />
          <FilterChip
            href={
              estado === "pendiente"
                ? buildHref({ ...searchParams, estado: undefined })
                : buildHref({ ...searchParams, estado: "pendiente" })
            }
            active={estado === "pendiente"}
            label="Pendientes"
          />
          <FilterChip
            href={
              estado === "parcial"
                ? buildHref({ ...searchParams, estado: undefined })
                : buildHref({ ...searchParams, estado: "parcial" })
            }
            active={estado === "parcial"}
            label="Parciales"
          />
          <FilterChip
            href={
              estado === "cobrada"
                ? buildHref({ ...searchParams, estado: undefined })
                : buildHref({ ...searchParams, estado: "cobrada" })
            }
            active={estado === "cobrada"}
            label="Cobradas"
          />
          <FilterChip
            href={
              overdueOnly
                ? buildHref({ ...searchParams, overdue: undefined })
                : buildHref({ ...searchParams, overdue: "1" })
            }
            active={overdueOnly}
            label="Vencidas"
            icon={<AlertTriangle className="size-3" />}
          />
        </div>

        {/* Lista */}
        {receivables.total === 0 ? (
          <EmptyState
            icon={<Receipt className="size-12 text-muted-foreground/60" />}
            title="Sin cuentas por cobrar"
            description="Cuando registres una venta a crédito o vincules una invoice impaga, aparecerá aquí."
          >
            <Button asChild>
              <Link href="/finance/receivables/new">
                <Plus className="mr-1 size-4" />
                Crear primer CxC
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <DataTable>
            <DataTableHeader>
              <DataTableRow>
                <DataTableColumn>Cliente</DataTableColumn>
                <DataTableColumn>Invoice</DataTableColumn>
                <DataTableColumn>Vencimiento</DataTableColumn>
                <DataTableColumn className="text-right">Monto</DataTableColumn>
                <DataTableColumn className="text-right">Pagado</DataTableColumn>
                <DataTableColumn className="text-right">Pendiente</DataTableColumn>
                <DataTableColumn>Estado</DataTableColumn>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {receivables.items.map((r) => {
                const pending = Number(
                  d(r.monto).minus(d(r.monto_cobrado)).toFixed(2),
                )
                const isPastDue =
                  r.fecha_venc &&
                  new Date(r.fecha_venc) < new Date() &&
                  r.estado !== "cobrada" &&
                  r.estado !== "cancelada"
                return (
                  <DataTableRow key={r.id} className="hover:bg-accent/30">
                    <DataTableCell>
                      <Link
                        href={`/finance/receivables/${r.id}`}
                        className="flex items-center gap-2 font-medium hover:underline"
                      >
                        <User className="size-3.5 text-muted-foreground" />
                        <span>{r.cliente}</span>
                      </Link>
                    </DataTableCell>
                    <DataTableCell>
                      {r.invoice ? (
                        <Link
                          href={`/invoices/${r.invoice.id}`}
                          className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary hover:bg-primary/20"
                          title={`Factura ${r.invoice.invoice_number}`}
                        >
                          {r.invoice.ncf ?? r.invoice.invoice_number}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </DataTableCell>
                    <DataTableCell>
                      {r.fecha_venc ? (
                        <span
                          className={
                            "text-xs tabular-nums " +
                            (isPastDue ? "text-red-600 font-medium" : "text-muted-foreground")
                          }
                        >
                          {isPastDue && (
                            <AlertTriangle className="mr-1 inline size-3" />
                          )}
                          {formatDateShort(new Date(r.fecha_venc))}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </DataTableCell>
                    <DataTableCell className="text-right tabular-nums">
                      {formatCurrency(Number(r.monto), r.currency)}
                    </DataTableCell>
                    <DataTableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      {Number(r.monto_cobrado) > 0
                        ? formatCurrency(Number(r.monto_cobrado), r.currency)
                        : "—"}
                    </DataTableCell>
                    <DataTableCell className="text-right tabular-nums font-semibold">
                      <span
                        className={
                          pending === 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : pending > 0 && isPastDue
                            ? "text-red-600 dark:text-red-400"
                            : "text-foreground"
                        }
                      >
                        {formatCurrency(pending, r.currency)}
                      </span>
                    </DataTableCell>
                    <DataTableCell>
                      <EstadoBadge estado={r.estado} isPastDue={!!isPastDue} />
                    </DataTableCell>
                  </DataTableRow>
                )
              })}
            </DataTableBody>
            <DataTableFooter>
              <Pagination
                page={receivables.page}
                totalPages={receivables.totalPages}
                total={receivables.total}
                pageSize={receivables.pageSize}
                baseHref="/finance/receivables"
                preserveQuery={{
                  q: search || undefined,
                  estado: estado || undefined,
                  overdue: overdueOnly ? "1" : undefined,
                }}
                itemsLabel="CxC"
              />
            </DataTableFooter>
          </DataTable>
        )}
      </main>
    </>
  )
}

function KpiCard({
  label,
  value,
  currency,
  isInt,
  tone,
  icon,
}: {
  label: string
  value: number
  currency?: string
  isInt?: boolean
  tone: "positive" | "warning" | "neutral"
  icon: React.ReactNode
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
      <p className="mt-2 text-xl font-bold tabular-nums">
        {isInt ? value : formatCurrency(value, currency ?? "DOP")}
      </p>
    </div>
  )
}

function EstadoBadge({
  estado,
  isPastDue,
}: {
  estado: string
  isPastDue: boolean
}) {
  const effective = isPastDue && (estado === "pendiente" || estado === "parcial") ? "vencida" : estado
  const map: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    pendiente: {
      label: "Pendiente",
      cls: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
      Icon: Clock,
    },
    parcial: {
      label: "Parcial",
      cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
      Icon: Clock,
    },
    cobrada: {
      label: "Cobrada",
      cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
      Icon: CheckCircle2,
    },
    vencida: {
      label: "Vencida",
      cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
      Icon: AlertTriangle,
    },
    cancelada: {
      label: "Cancelada",
      cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500",
      Icon: XCircle,
    },
  }
  const m = map[effective] ?? map.pendiente
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${m.cls}`}
    >
      <m.Icon className="size-3" />
      {m.label}
    </span>
  )
}

function FilterChip({
  href,
  active,
  label,
  icon,
}: {
  href: string
  active: boolean
  label: string
  icon?: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
        (active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background text-muted-foreground hover:bg-accent")
      }
    >
      {icon}
      {label}
    </Link>
  )
}

function buildHref(params: SearchParamsShape): string {
  const usp = new URLSearchParams()
  if (params.q) usp.set("q", params.q)
  if (params.page) usp.set("page", params.page)
  if (params.estado) usp.set("estado", params.estado)
  if (params.overdue) usp.set("overdue", params.overdue)
  const qs = usp.toString()
  return `/finance/receivables${qs ? `?${qs}` : ""}`
}
