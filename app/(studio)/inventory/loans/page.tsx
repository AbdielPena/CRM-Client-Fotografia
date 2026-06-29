import Link from "next/link"
import {
  PackageCheck,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getInvLoans, type InvLoanRow } from "@/server/services/inv-loan.service"
import { formatDate } from "@/lib/utils/currency"

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

export const metadata: Metadata = { title: "Inventario · Préstamos" }

const PAGE_SIZE = 30

type SearchParamsShape = { q?: string; page?: string; status?: string }

export default async function InventoryLoansPage({
  searchParams,
}: {
  searchParams?: SearchParamsShape
}) {
  const session = await requireStudioAuth()

  const page = Math.max(1, Number(searchParams?.page) || 1)
  const validStatus: InvLoanRow["status"][] = [
    "activo",
    "devuelto",
    "parcial",
    "vencido",
    "perdido",
    "danado",
  ]
  const status = validStatus.includes(searchParams?.status as InvLoanRow["status"])
    ? (searchParams!.status as InvLoanRow["status"])
    : undefined

  const [loans, unread] = await Promise.all([
    getInvLoans(session.studioId, { status, page, pageSize: PAGE_SIZE }),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Inventario"
        title="Préstamos internos"
        description="Equipos asignados a responsibles del studio sin cobro. Para alquileres comerciales, usa Rentas."
        unreadNotifications={unread}
        actions={
          <Button asChild>
            <Link href="/inventory/loans/new">
              <Plus className="mr-1 size-4" />
              Nuevo préstamo
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput placeholder="Buscar por código o notas..." />
          <FilterChip
            href={
              status === "activo"
                ? buildHref({ ...searchParams, status: undefined })
                : buildHref({ ...searchParams, status: "activo" })
            }
            active={status === "activo"}
            label="Activos"
            icon={<Clock className="size-3" />}
          />
          <FilterChip
            href={
              status === "devuelto"
                ? buildHref({ ...searchParams, status: undefined })
                : buildHref({ ...searchParams, status: "devuelto" })
            }
            active={status === "devuelto"}
            label="Devueltos"
            icon={<CheckCircle2 className="size-3" />}
          />
          <FilterChip
            href={
              status === "vencido"
                ? buildHref({ ...searchParams, status: undefined })
                : buildHref({ ...searchParams, status: "vencido" })
            }
            active={status === "vencido"}
            label="Vencidos"
            icon={<AlertTriangle className="size-3" />}
          />
        </div>

        {loans.total === 0 ? (
          <EmptyState
            icon={<PackageCheck className="size-12 text-muted-foreground/60" />}
            title="Sin préstamos registrados"
            description="Cuando un responsible del studio tome equipo para una sesión, regístralo aquí."
          >
            <Button asChild>
              <Link href="/inventory/loans/new">
                <Plus className="mr-1 size-4" />
                Crear primer préstamo
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <DataTable>
            <DataTableHeader>
              <DataTableRow>
                <DataTableColumn>Código</DataTableColumn>
                <DataTableColumn>Responsible</DataTableColumn>
                <DataTableColumn>Booking / Project</DataTableColumn>
                <DataTableColumn>Desde</DataTableColumn>
                <DataTableColumn>Devolución esperada</DataTableColumn>
                <DataTableColumn>Estado</DataTableColumn>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {loans.items.map((l) => {
                const overdue =
                  l.status === "activo" &&
                  new Date(l.expected_return_date) < new Date()
                return (
                  <DataTableRow key={l.id} className="hover:bg-accent/30">
                    <DataTableCell>
                      <Link
                        href={`/inventory/loans/${l.id}`}
                        className="font-mono text-xs font-semibold hover:underline"
                      >
                        {l.code}
                      </Link>
                    </DataTableCell>
                    <DataTableCell className="text-sm">
                      {l.responsible?.full_name ?? "—"}
                      {l.responsible?.department && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          ({l.responsible.department})
                        </span>
                      )}
                    </DataTableCell>
                    <DataTableCell className="text-xs">
                      {l.project ? (
                        <Link
                          href={`/projects/${l.project.id}`}
                          className="text-primary hover:underline"
                        >
                          📁 {l.project.name}
                        </Link>
                      ) : l.booking ? (
                        <span className="text-muted-foreground">
                          📅 {formatDate(l.booking.event_date as string)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </DataTableCell>
                    <DataTableCell className="text-xs text-muted-foreground">
                      {formatDate(new Date(l.start_date))}
                    </DataTableCell>
                    <DataTableCell
                      className={`text-xs tabular-nums ${overdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}
                    >
                      {overdue && <AlertTriangle className="mr-1 inline size-3" />}
                      {formatDate(new Date(l.expected_return_date))}
                    </DataTableCell>
                    <DataTableCell>
                      <LoanStatusBadge status={overdue ? "vencido" : l.status} />
                    </DataTableCell>
                  </DataTableRow>
                )
              })}
            </DataTableBody>
            <DataTableFooter>
              <Pagination
                page={loans.page}
                totalPages={loans.totalPages}
                total={loans.total}
                pageSize={loans.pageSize}
                baseHref="/inventory/loans"
                preserveQuery={{ status: status || undefined }}
                itemsLabel="préstamos"
              />
            </DataTableFooter>
          </DataTable>
        )}
      </main>
    </>
  )
}

function LoanStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    activo: { label: "Activo", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
    devuelto: { label: "Devuelto", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
    parcial: { label: "Parcial", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
    vencido: { label: "Vencido", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
    perdido: { label: "Perdido", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
    danado: { label: "Dañado", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  }
  const m = map[status] ?? map.activo
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${m.cls}`}>
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
  if (params.status) usp.set("status", params.status)
  const qs = usp.toString()
  return `/inventory/loans${qs ? `?${qs}` : ""}`
}
