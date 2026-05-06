import { Trash2, Mail, Phone, AlertTriangle } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { getTrashedClients } from "@/server/services/client.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { formatDateShort } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
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
import { TrashClientActions } from "@/components/trash/trash-client-actions"

export const metadata: Metadata = { title: "Papelera" }

export default async function TrashPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string; tab?: string }
}) {
  const session = await requireStudioAuth()
  const search = searchParams.q
  const page = Number(searchParams.page ?? 1)

  // Por ahora solo tab "clients". Fase 2 agregará projects, contracts,
  // invoices, galleries, bookings, deliveries, payments.
  const [clients, unread] = await Promise.all([
    getTrashedClients(session.studioId, { search, page }),
    countUnreadNotifications(session.studioId),
  ])

  // Solo admin u owner pueden eliminar permanente
  const canPurge = session.role === "admin" || session.role === "owner"

  return (
    <>
      <AppTopbar
        eyebrow="Administración"
        title="Papelera"
        description={`Items eliminados que podés restaurar o borrar permanentemente. Quedan acá hasta que decidas qué hacer.`}
        unreadNotifications={unread}
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
        {/* Banner de advertencia para no-admins */}
        {!canPurge && (
          <div className="flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning-soft px-3.5 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
            <p className="text-body-sm leading-snug text-foreground">
              Tu rol ({session.role}) puede restaurar items, pero solo{" "}
              <strong>admin</strong> u <strong>owner</strong> pueden eliminar
              permanentemente.
            </p>
          </div>
        )}

        {/* Tabs (placeholder — Fase 2 agrega más entidades) */}
        <div className="border-b border-border">
          <nav className="flex gap-1 -mb-px" aria-label="Tipos de items">
            <span className="border-b-2 border-brand px-3 py-2 text-body-sm font-semibold text-brand">
              Clientes
              {clients.total > 0 && (
                <span className="ml-1.5 rounded-full bg-brand/10 px-1.5 py-0.5 text-caption tabular-nums text-brand">
                  {clients.total}
                </span>
              )}
            </span>
            <span className="px-3 py-2 text-body-sm text-muted-foreground/60">
              Proyectos
              <span className="ml-1.5 text-caption">(próximamente)</span>
            </span>
            <span className="px-3 py-2 text-body-sm text-muted-foreground/60">
              Contratos
              <span className="ml-1.5 text-caption">(próximamente)</span>
            </span>
            <span className="px-3 py-2 text-body-sm text-muted-foreground/60">
              Facturas
              <span className="ml-1.5 text-caption">(próximamente)</span>
            </span>
            <span className="px-3 py-2 text-body-sm text-muted-foreground/60">
              Galerías
              <span className="ml-1.5 text-caption">(próximamente)</span>
            </span>
          </nav>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            placeholder="Buscar en la papelera…"
            className="w-full sm:w-80"
          />
        </div>

        {clients.items.length === 0 ? (
          <div className="rounded-xl border border-border bg-card shadow-xs">
            <EmptyState
              icon={<Trash2 className="h-5 w-5" />}
              title={
                search
                  ? "No encontramos clientes en la papelera"
                  : "La papelera está vacía"
              }
              description={
                search
                  ? "Probá ajustando tu búsqueda."
                  : "Cuando elimines un cliente desde /clients, aparecerá acá. Lo podés restaurar en cualquier momento."
              }
              accent={!search}
            />
          </div>
        ) : (
          <DataTable
            footer={
              clients.totalPages > 1 ? (
                <DataTableFooter>
                  <Pagination
                    page={page}
                    totalPages={clients.totalPages}
                    total={clients.total}
                    pageSize={clients.pageSize}
                    baseHref="/trash"
                    preserveQuery={{ q: search }}
                    itemsLabel="items"
                    className="w-full"
                  />
                </DataTableFooter>
              ) : undefined
            }
          >
            <DataTableHeader>
              <DataTableColumn>Cliente</DataTableColumn>
              <DataTableColumn className="hidden md:table-cell">
                Contacto
              </DataTableColumn>
              <DataTableColumn className="hidden lg:table-cell">
                Motivo
              </DataTableColumn>
              <DataTableColumn align="right" className="hidden sm:table-cell">
                Eliminado
              </DataTableColumn>
              <DataTableColumn align="right">
                <span className="sr-only">Acciones</span>
              </DataTableColumn>
            </DataTableHeader>
            <DataTableBody>
              {clients.items.map((client) => (
                <DataTableRow key={client.id}>
                  <DataTableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted text-body-sm font-semibold text-muted-foreground">
                        {client.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {client.name}
                        </p>
                        <p className="text-caption text-muted-foreground md:hidden">
                          {client.email ?? client.phone ?? "—"}
                        </p>
                      </div>
                    </div>
                  </DataTableCell>
                  <DataTableCell className="hidden md:table-cell">
                    <div className="space-y-0.5">
                      {client.email && (
                        <p className="flex items-center gap-1.5 truncate text-body-sm text-muted-foreground">
                          <Mail className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{client.email}</span>
                        </p>
                      )}
                      {client.phone && (
                        <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
                          <Phone className="h-3 w-3 flex-shrink-0" />
                          {client.phone}
                        </p>
                      )}
                    </div>
                  </DataTableCell>
                  <DataTableCell className="hidden max-w-[260px] lg:table-cell">
                    {client.deletion_reason ? (
                      <p
                        className="truncate text-body-sm text-muted-foreground"
                        title={client.deletion_reason}
                      >
                        {client.deletion_reason}
                      </p>
                    ) : (
                      <span className="text-caption text-muted-foreground/60">
                        Sin motivo
                      </span>
                    )}
                  </DataTableCell>
                  <DataTableCell
                    align="right"
                    className="hidden text-muted-foreground tabular-nums sm:table-cell"
                  >
                    {client.deleted_at
                      ? formatDateShort(new Date(client.deleted_at))
                      : "—"}
                  </DataTableCell>
                  <DataTableCell align="right">
                    <TrashClientActions
                      clientId={client.id}
                      clientName={client.name}
                      canPurge={canPurge}
                    />
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
