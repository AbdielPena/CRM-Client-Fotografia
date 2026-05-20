import Link from "next/link"
import {
  Truck,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  User,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getInvRentals, type InvRentalRow } from "@/server/services/inv-rental.service"
import { formatCurrency, formatDate } from "@/lib/utils/currency"

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

export const metadata: Metadata = { title: "Inventario · Alquileres" }

const PAGE_SIZE = 30

type SearchParamsShape = { q?: string; page?: string; status?: string }

export default async function InventoryRentalsPage({
  searchParams,
}: {
  searchParams?: SearchParamsShape
}) {
  const session = await requireStudioAuth()

  const page = Math.max(1, Number(searchParams?.page) || 1)
  const validStatus: InvRentalRow["status"][] = [
    "cotizada",
    "reservada",
    "activa",
    "devuelta",
    "vencida",
    "cancelada",
    "con_deuda",
    "con_dano",
    "perdida",
  ]
  const status = validStatus.includes(searchParams?.status as InvRentalRow["status"])
    ? (searchParams!.status as InvRentalRow["status"])
    : undefined

  const [rentals, unread] = await Promise.all([
    getInvRentals(session.studioId, { status, page, pageSize: PAGE_SIZE }),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Inventario"
        title="Alquileres"
        description="Rentas comerciales a clientes — tracking de cobro + devolución + Finance integration."
        unreadNotifications={unread}
        actions={
          <Button asChild>
            <Link href="/inventory/rentals/new">
              <Plus className="mr-1 size-4" />
              Nueva renta
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput placeholder="Buscar por cliente, code o notas..." />
          <FilterChip
            href={
              status === "activa"
                ? buildHref({ ...searchParams, status: undefined })
                : buildHref({ ...searchParams, status: "activa" })
            }
            active={status === "activa"}
            label="Activas"
            icon={<Clock className="size-3" />}
          />
          <FilterChip
            href={
              status === "devuelta"
                ? buildHref({ ...searchParams, status: undefined })
                : buildHref({ ...searchParams, status: "devuelta" })
            }
            active={status === "devuelta"}
            label="Devueltas"
            icon={<CheckCircle2 className="size-3" />}
          />
          <FilterChip
            href={
              status === "vencida"
                ? buildHref({ ...searchParams, status: undefined })
                : buildHref({ ...searchParams, status: "vencida" })
            }
            active={status === "vencida"}
            label="Vencidas"
            icon={<AlertTriangle className="size-3" />}
          />
        </div>

        {rentals.total === 0 ? (
          <EmptyState
            icon={<Truck className="size-12 text-muted-foreground/60" />}
            title="Sin alquileres registrados"
            description="Cuando registres una renta de equipo a un cliente, aparecerá aquí."
          >
            <Button asChild>
              <Link href="/inventory/rentals/new">
                <Plus className="mr-1 size-4" />
                Crear primera renta
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <DataTable>
            <DataTableHeader>
              <DataTableRow>
                <DataTableColumn>Código</DataTableColumn>
                <DataTableColumn>Cliente</DataTableColumn>
                <DataTableColumn>Periodo</DataTableColumn>
                <DataTableColumn className="text-right">Total</DataTableColumn>
                <DataTableColumn className="text-right">Pagado</DataTableColumn>
                <DataTableColumn className="text-right">Balance</DataTableColumn>
                <DataTableColumn>Estado</DataTableColumn>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {rentals.items.map((r) => {
                const balance = Number(r.balance ?? 0)
                return (
                  <DataTableRow key={r.id} className="hover:bg-accent/30">
                    <DataTableCell>
                      <Link
                        href={`/inventory/rentals/${r.id}`}
                        className="font-mono text-xs font-semibold hover:underline"
                      >
                        {r.code}
                      </Link>
                    </DataTableCell>
                    <DataTableCell>
                      {r.client ? (
                        <Link
                          href={`/clients/${r.client.id}`}
                          className="flex items-center gap-1 text-sm hover:underline"
                        >
                          <User className="size-3 text-muted-foreground" />
                          {r.client.name}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </DataTableCell>
                    <DataTableCell className="text-xs text-muted-foreground">
                      {formatDate(new Date(r.start_date))} →{" "}
                      {formatDate(new Date(r.end_date))}
                      <span className="ml-1 text-[10px]">({r.days}d)</span>
                    </DataTableCell>
                    <DataTableCell className="text-right tabular-nums">
                      {formatCurrency(Number(r.total))}
                    </DataTableCell>
                    <DataTableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(Number(r.paid_amount))}
                    </DataTableCell>
                    <DataTableCell className="text-right tabular-nums font-semibold">
                      <span
                        className={
                          balance === 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : balance > 0
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-foreground"
                        }
                      >
                        {formatCurrency(balance)}
                      </span>
                    </DataTableCell>
                    <DataTableCell>
                      <StatusBadge status={r.status} />
                    </DataTableCell>
                  </DataTableRow>
                )
              })}
            </DataTableBody>
            <DataTableFooter>
              <Pagination
                page={rentals.page}
                totalPages={rentals.totalPages}
                total={rentals.total}
                pageSize={rentals.pageSize}
                baseHref="/inventory/rentals"
                preserveQuery={{ status: status || undefined }}
                itemsLabel="rentas"
              />
            </DataTableFooter>
          </DataTable>
        )}
      </main>
    </>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    cotizada: { label: "Cotizada", cls: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
    reservada: { label: "Reservada", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
    activa: { label: "Activa", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
    devuelta: { label: "Devuelta", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
    vencida: { label: "Vencida", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
    cancelada: { label: "Cancelada", cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500" },
    con_deuda: { label: "Con deuda", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
    con_dano: { label: "Con daño", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
    perdida: { label: "Perdida", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  }
  const m = map[status] ?? map.cotizada
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
  return `/inventory/rentals${qs ? `?${qs}` : ""}`
}
