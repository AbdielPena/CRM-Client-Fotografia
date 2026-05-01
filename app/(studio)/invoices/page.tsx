import Link from "next/link"
import { Receipt, TrendingUp, Clock, AlertCircle, Plus } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  getInvoices,
  getFinanceSummary,
} from "@/server/services/invoice.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { formatCurrency, formatDateShort } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { SearchInput } from "@/components/shared/search-input"
import { StatusBadge } from "@/components/shared/status-badge"
import { EmptyState } from "@/components/shared/empty-state"
import { FilterChips, type FilterChip } from "@/components/shared/filter-chips"
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

export const metadata: Metadata = { title: "Facturas" }

const STATUS_CHIPS: FilterChip[] = [
  { key: "draft", label: "Borrador" },
  { key: "sent", label: "Enviadas" },
  { key: "viewed", label: "Vistas" },
  { key: "partially_paid", label: "Parcial" },
  { key: "paid", label: "Pagadas" },
  { key: "overdue", label: "Vencidas" },
]

type InvoiceRow = {
  id: string
  invoice_number: string
  status: string
  total: number | string
  currency: string
  due_date: string | null
  client?: { name: string } | null
  project?: { name: string } | null
}

interface FinanceStatProps {
  icon: React.ReactNode
  label: string
  value: string
  tone: "success" | "info" | "muted" | "danger"
}

function FinanceStat({ icon, label, value, tone }: FinanceStatProps) {
  const toneBg = {
    success: "bg-success-soft text-success",
    info: "bg-info-soft text-info",
    muted: "bg-muted text-muted-foreground",
    danger: "bg-danger-soft text-danger",
  }[tone]

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-md ${toneBg}`}
        >
          {icon}
        </span>
        <p className="text-caption font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="mt-3 font-display text-[1.75rem] leading-none tabular-nums text-foreground">
        {value}
      </p>
    </div>
  )
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; page?: string }
}) {
  const session = await requireStudioAuth()
  const search = searchParams.q
  const status = searchParams.status
  const page = Number(searchParams.page ?? 1)

  const [data, summary, unread] = await Promise.all([
    getInvoices(session.studioId, { search, status, page }),
    getFinanceSummary(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Flujo de caja"
        title="Facturas"
        description="Gestiona tus cobros, pagos y el pulso financiero de tu estudio."
        unreadNotifications={unread}
        actions={
          <Button asChild size="sm" leftIcon={<Plus className="h-4 w-4" />}>
            <Link href="/invoices/new">Nueva factura</Link>
          </Button>
        }
      />

      <div className="space-y-6 px-6 py-6 lg:px-8 lg:py-8">
        {/* ========== Summary ========== */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <FinanceStat
            icon={<TrendingUp className="h-5 w-5" />}
            label="Ingresos totales"
            value={formatCurrency(summary.totalRevenue)}
            tone="success"
          />
          <FinanceStat
            icon={<Clock className="h-5 w-5" />}
            label="Por cobrar"
            value={formatCurrency(summary.outstanding)}
            tone="info"
          />
          <FinanceStat
            icon={<Receipt className="h-5 w-5" />}
            label="Borradores"
            value={formatCurrency(summary.draft)}
            tone="muted"
          />
          <FinanceStat
            icon={<AlertCircle className="h-5 w-5" />}
            label="Vencidas"
            value={String(summary.overdue)}
            tone="danger"
          />
        </div>

        {/* ========== Toolbar ========== */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput
            placeholder="Buscar facturas…"
            className="w-full lg:w-80"
          />
          <FilterChips
            baseHref="/invoices"
            paramName="status"
            current={status}
            chips={STATUS_CHIPS}
            preserveQuery={{ q: search }}
            className="flex-1"
          />
        </div>

        {/* ========== Table ========== */}
        {data.items.length === 0 ? (
          <div className="rounded-xl border border-border bg-card shadow-xs">
            <EmptyState
              icon={<Receipt className="h-5 w-5" />}
              title={
                search || status
                  ? "No encontramos facturas"
                  : "Aún no tienes facturas"
              }
              description={
                search || status
                  ? "Prueba ajustando tu búsqueda o limpia los filtros."
                  : "Crea tu primera factura para empezar a gestionar tus cobros."
              }
              accent={!search && !status}
            >
              <Button asChild size="sm" leftIcon={<Plus className="h-4 w-4" />}>
                <Link href="/invoices/new">Nueva factura</Link>
              </Button>
            </EmptyState>
          </div>
        ) : (
          <DataTable
            footer={
              data.totalPages > 1 ? (
                <DataTableFooter>
                  <Pagination
                    page={page}
                    totalPages={data.totalPages}
                    total={data.total}
                    pageSize={data.pageSize}
                    baseHref="/invoices"
                    preserveQuery={{ q: search, status }}
                    itemsLabel="facturas"
                    className="w-full"
                  />
                </DataTableFooter>
              ) : undefined
            }
          >
            <DataTableHeader>
              <DataTableColumn>Número</DataTableColumn>
              <DataTableColumn className="hidden md:table-cell">
                Cliente
              </DataTableColumn>
              <DataTableColumn className="hidden lg:table-cell">
                Proyecto
              </DataTableColumn>
              <DataTableColumn align="right">Total</DataTableColumn>
              <DataTableColumn>Estado</DataTableColumn>
              <DataTableColumn
                align="right"
                className="hidden sm:table-cell"
              >
                Vence
              </DataTableColumn>
            </DataTableHeader>
            <DataTableBody>
              {(data.items as InvoiceRow[]).map((invoice) => (
                <DataTableRow key={invoice.id} interactive className="group">
                  <DataTableCell>
                    <Link
                      href={`/invoices/${invoice.id}`}
                      className="-m-1 inline-block rounded p-1 font-mono text-body-sm font-semibold text-foreground transition-colors group-hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                    >
                      {invoice.invoice_number}
                    </Link>
                  </DataTableCell>
                  <DataTableCell className="hidden md:table-cell">
                    {invoice.client?.name ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </DataTableCell>
                  <DataTableCell className="hidden text-caption text-muted-foreground lg:table-cell">
                    {invoice.project?.name ?? "—"}
                  </DataTableCell>
                  <DataTableCell
                    align="right"
                    className="font-display text-body font-semibold tabular-nums"
                  >
                    {formatCurrency(Number(invoice.total), invoice.currency)}
                  </DataTableCell>
                  <DataTableCell>
                    <StatusBadge status={invoice.status} />
                  </DataTableCell>
                  <DataTableCell
                    align="right"
                    className="hidden text-muted-foreground tabular-nums sm:table-cell"
                  >
                    {invoice.due_date
                      ? formatDateShort(new Date(invoice.due_date))
                      : "—"}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </div>
    </>
  )
}
