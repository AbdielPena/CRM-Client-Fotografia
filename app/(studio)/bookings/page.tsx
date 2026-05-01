import Link from "next/link"
import { Inbox } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { listBookingRequestsForStudio } from "@/server/services/booking-request.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { formatCurrency, formatDateShort } from "@/lib/utils/currency"
import type { Database } from "@/types/supabase"

import { AppTopbar } from "@/components/layout/app-topbar"
import { StatusBadge } from "@/components/shared/status-badge"
import { EmptyState } from "@/components/shared/empty-state"
import { FilterChips, type FilterChip } from "@/components/shared/filter-chips"
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableColumn,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table"

export const metadata: Metadata = { title: "Solicitudes de booking" }
export const dynamic = "force-dynamic"

type Status = Database["public"]["Enums"]["booking_request_status"]

const FILTER_CHIPS: FilterChip[] = [
  { key: "pending_review", label: "Por revisar" },
  { key: "approved", label: "Aprobadas" },
  { key: "awaiting_payment", label: "Esperando pago" },
  { key: "confirmed", label: "Confirmadas" },
  { key: "rejected", label: "Rechazadas" },
  { key: "cancelled", label: "Canceladas" },
]

export default async function BookingsListPage({
  searchParams,
}: {
  searchParams?: { status?: string }
}) {
  const session = await requireStudioAuth()
  const rawStatus = searchParams?.status
  const status = FILTER_CHIPS.find((c) => c.key === rawStatus)?.key as
    | Status
    | undefined

  const [items, unread] = await Promise.all([
    listBookingRequestsForStudio(session.studioId, {
      status,
      limit: 200,
    }),
    countUnreadNotifications(session.studioId),
  ])

  const pendingCount = items.filter((i) => i.status === "pending_review").length

  return (
    <>
      <AppTopbar
        eyebrow="Inbox de reservas"
        title="Solicitudes de booking"
        description={
          pendingCount > 0
            ? `Tienes ${pendingCount} solicitud${pendingCount === 1 ? "" : "es"} por revisar — actúa pronto para no perder oportunidades.`
            : "Solicitudes entrantes desde tus links públicos de reserva."
        }
        unreadNotifications={unread}
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
        <FilterChips
          baseHref="/bookings"
          paramName="status"
          current={status}
          chips={FILTER_CHIPS}
        />

        {items.length === 0 ? (
          <div className="rounded-xl border border-border bg-card shadow-xs">
            <EmptyState
              icon={<Inbox className="h-5 w-5" />}
              title={
                status
                  ? "Sin solicitudes en este estado"
                  : "Aún no recibes solicitudes"
              }
              description="Cuando alguien complete tu formulario público de reserva, aparecerá aquí. Comparte tu link y empieza a llenar la agenda."
              accent={!status}
            />
          </div>
        ) : (
          <DataTable>
            <DataTableHeader>
              <DataTableColumn>Cliente</DataTableColumn>
              <DataTableColumn className="hidden md:table-cell">
                Paquete
              </DataTableColumn>
              <DataTableColumn className="hidden lg:table-cell">
                Fecha evento
              </DataTableColumn>
              <DataTableColumn
                align="right"
                className="hidden lg:table-cell"
              >
                Monto
              </DataTableColumn>
              <DataTableColumn>Estado</DataTableColumn>
              <DataTableColumn
                align="right"
                className="hidden sm:table-cell"
              >
                Recibida
              </DataTableColumn>
            </DataTableHeader>
            <DataTableBody>
              {items.map((req) => (
                <DataTableRow key={req.id} interactive className="group">
                  <DataTableCell>
                    <Link
                      href={`/bookings/${req.id}`}
                      className="-m-1 block rounded p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                    >
                      <p className="font-semibold text-foreground transition-colors group-hover:text-brand">
                        {req.client_name}
                      </p>
                      <p className="mt-0.5 max-w-[240px] truncate text-caption text-muted-foreground">
                        {req.client_email}
                      </p>
                    </Link>
                  </DataTableCell>
                  <DataTableCell className="hidden md:table-cell">
                    {req.package?.name ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </DataTableCell>
                  <DataTableCell className="hidden text-muted-foreground lg:table-cell">
                    {formatDateShort(new Date(req.event_date))}
                    {req.event_time ? (
                      <span className="ml-1 text-caption">
                        · {req.event_time.slice(0, 5)}
                      </span>
                    ) : null}
                  </DataTableCell>
                  <DataTableCell
                    align="right"
                    className="hidden tabular-nums lg:table-cell"
                  >
                    {req.package
                      ? formatCurrency(
                          Number(req.package.price),
                          req.package.currency ?? "DOP",
                        )
                      : "—"}
                  </DataTableCell>
                  <DataTableCell>
                    <StatusBadge status={req.status} />
                  </DataTableCell>
                  <DataTableCell
                    align="right"
                    className="hidden text-muted-foreground tabular-nums sm:table-cell"
                  >
                    {formatDateShort(new Date(req.created_at))}
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
