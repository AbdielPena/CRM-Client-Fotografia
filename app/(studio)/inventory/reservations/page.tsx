import Link from "next/link"
import {
  CalendarClock,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  PackageCheck,
  Truck,
  AlertTriangle,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getInvReservations } from "@/server/services/inv-reservation.service"
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

export const metadata: Metadata = { title: "Inventario · Reservas" }

const PAGE_SIZE = 30

type SearchParamsShape = { q?: string; page?: string; status?: string }

export default async function InventoryReservationsPage({
  searchParams,
}: {
  searchParams?: SearchParamsShape
}) {
  const session = await requireStudioAuth()

  const page = Math.max(1, Number(searchParams?.page) || 1)
  const validStatus = [
    "pendiente",
    "confirmada",
    "cancelada",
    "convertida_prestamo",
    "convertida_renta",
    "vencida",
  ] as const
  const status = validStatus.includes(searchParams?.status as (typeof validStatus)[number])
    ? (searchParams!.status as (typeof validStatus)[number])
    : undefined

  const [reservations, unread] = await Promise.all([
    getInvReservations(session.studioId, { status, page, pageSize: PAGE_SIZE }),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Inventario"
        title="Reservas"
        description="Apartar equipo para fecha futura. Convertible a préstamo o alquiler al llegar el día."
        unreadNotifications={unread}
        actions={
          <Button asChild>
            <Link href="/inventory/reservations/new">
              <Plus className="mr-1 size-4" />
              Nueva reserva
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput placeholder="Buscar por código..." />
          <FilterChip
            href={
              status === "pendiente"
                ? `/inventory/reservations`
                : `/inventory/reservations?status=pendiente`
            }
            active={status === "pendiente"}
            label="Pendientes"
            icon={<Clock className="size-3" />}
          />
          <FilterChip
            href={
              status === "confirmada"
                ? `/inventory/reservations`
                : `/inventory/reservations?status=confirmada`
            }
            active={status === "confirmada"}
            label="Confirmadas"
            icon={<CheckCircle2 className="size-3" />}
          />
          <FilterChip
            href={
              status === "vencida"
                ? `/inventory/reservations`
                : `/inventory/reservations?status=vencida`
            }
            active={status === "vencida"}
            label="Vencidas"
            icon={<AlertTriangle className="size-3" />}
          />
        </div>

        {reservations.total === 0 ? (
          <EmptyState
            icon={<CalendarClock className="size-12 text-muted-foreground/60" />}
            title="Sin reservas"
            description="Aparta equipo para sesiones futuras. Convertible a préstamo o alquiler."
          >
            <Button asChild>
              <Link href="/inventory/reservations/new">
                <Plus className="mr-1 size-4" />
                Crear primera reserva
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <DataTable>
            <DataTableHeader>
              <DataTableRow>
                <DataTableColumn>Código</DataTableColumn>
                <DataTableColumn>Para</DataTableColumn>
                <DataTableColumn>Periodo</DataTableColumn>
                <DataTableColumn>Razón</DataTableColumn>
                <DataTableColumn>Estado</DataTableColumn>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {reservations.items.map((r) => {
                const isOverdue =
                  r.status === "pendiente" && new Date(r.end_date) < new Date()
                return (
                  <DataTableRow key={r.id} className="hover:bg-accent/30">
                    <DataTableCell>
                      <Link
                        href={`/inventory/reservations/${r.id}`}
                        className="font-mono text-xs font-semibold hover:underline"
                      >
                        {r.code}
                      </Link>
                    </DataTableCell>
                    <DataTableCell className="text-sm">
                      {r.client?.name ??
                        r.responsible?.full_name ??
                        "—"}
                    </DataTableCell>
                    <DataTableCell className="text-xs text-muted-foreground">
                      {formatDate(new Date(r.start_date))} →{" "}
                      {formatDate(new Date(r.end_date))}
                    </DataTableCell>
                    <DataTableCell className="max-w-xs truncate text-xs">
                      {r.reason ?? "—"}
                    </DataTableCell>
                    <DataTableCell>
                      <StatusBadge
                        status={isOverdue ? "vencida" : r.status}
                        convertedTo={
                          r.converted_to_loan_id
                            ? "prestamo"
                            : r.converted_to_rental_id
                            ? "renta"
                            : null
                        }
                      />
                    </DataTableCell>
                  </DataTableRow>
                )
              })}
            </DataTableBody>
            <DataTableFooter>
              <Pagination
                page={reservations.page}
                totalPages={reservations.totalPages}
                total={reservations.total}
                pageSize={reservations.pageSize}
                baseHref="/inventory/reservations"
                preserveQuery={{ status: status || undefined }}
                itemsLabel="reservas"
              />
            </DataTableFooter>
          </DataTable>
        )}
      </main>
    </>
  )
}

function StatusBadge({
  status,
  convertedTo,
}: {
  status: string
  convertedTo: "prestamo" | "renta" | null
}) {
  const map: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    pendiente: { label: "Pendiente", cls: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300", Icon: Clock },
    confirmada: { label: "Confirmada", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", Icon: CheckCircle2 },
    cancelada: { label: "Cancelada", cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500", Icon: XCircle },
    convertida_prestamo: { label: "→ Préstamo", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300", Icon: PackageCheck },
    convertida_renta: { label: "→ Renta", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", Icon: Truck },
    vencida: { label: "Vencida", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300", Icon: AlertTriangle },
  }
  if (convertedTo === "prestamo") return badge(map.convertida_prestamo)
  if (convertedTo === "renta") return badge(map.convertida_renta)
  return badge(map[status] ?? map.pendiente)

  function badge(m: typeof map.pendiente) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${m.cls}`}>
        <m.Icon className="size-3" />
        {m.label}
      </span>
    )
  }
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
