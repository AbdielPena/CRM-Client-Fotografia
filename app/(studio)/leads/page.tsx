import Link from "next/link"
import { UserCheck, Kanban, List, Plus } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { getLeads, getLeadsByStatus } from "@/server/services/lead.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { formatCurrency, formatDateShort } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { SearchInput } from "@/components/shared/search-input"
import { StatusBadge } from "@/components/shared/status-badge"
import { EmptyState } from "@/components/shared/empty-state"
import { FilterChips, type FilterChip } from "@/components/shared/filter-chips"
import { ToggleGroup } from "@/components/shared/toggle-group"
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
import { LeadPipelineView } from "@/components/leads/lead-pipeline-view"

export const metadata: Metadata = { title: "Leads" }

const PIPELINE_STAGES: FilterChip[] = [
  { key: "new", label: "Nuevos" },
  { key: "contacted", label: "Contactados" },
  { key: "meeting_scheduled", label: "Reunión" },
  { key: "proposal_sent", label: "Propuesta" },
  { key: "negotiating", label: "Negociando" },
  { key: "won", label: "Ganados" },
  { key: "lost", label: "Perdidos" },
]

type LeadRow = {
  id: string
  name: string
  email: string | null
  status: string
  event_type: string | null
  event_date: string | null
  budget: number | string | null
  currency: string | null
  created_at: string
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: { q?: string; view?: string; status?: string; page?: string }
}) {
  const session = await requireStudioAuth()
  const view = searchParams.view === "pipeline" ? "pipeline" : "list"
  const search = searchParams.q
  const status = searchParams.status
  const page = Number(searchParams.page ?? 1)

  const [listData, pipelineData, unread] = await Promise.all([
    getLeads(session.studioId, { search, status, page }),
    view === "pipeline"
      ? getLeadsByStatus(session.studioId)
      : Promise.resolve(null),
    countUnreadNotifications(session.studioId),
  ])

  const preserveQuery = {
    q: search,
    view: view !== "list" ? view : undefined,
    status,
  }

  return (
    <>
      <AppTopbar
        eyebrow="Pipeline de ventas"
        title="Leads"
        description={`${listData.total} lead${listData.total === 1 ? "" : "s"} en total — gestiona tu embudo de conversión.`}
        unreadNotifications={unread}
        actions={
          <Button asChild size="sm" leftIcon={<Plus className="h-4 w-4" />}>
            <Link href="/leads/new">Nuevo lead</Link>
          </Button>
        }
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
        {/* ========== Toolbar ========== */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput
            placeholder="Buscar leads…"
            className="w-full lg:w-80"
          />

          <FilterChips
            baseHref="/leads"
            paramName="status"
            current={status}
            chips={PIPELINE_STAGES}
            preserveQuery={{
              q: search,
              view: view !== "list" ? view : undefined,
            }}
            className="flex-1"
          />

          <ToggleGroup
            current={view}
            options={[
              {
                key: "list",
                label: "Lista",
                icon: <List className="h-3.5 w-3.5" />,
                href: `/leads?${new URLSearchParams({
                  ...(search ? { q: search } : {}),
                  ...(status ? { status } : {}),
                }).toString()}`,
              },
              {
                key: "pipeline",
                label: "Pipeline",
                icon: <Kanban className="h-3.5 w-3.5" />,
                href: `/leads?${new URLSearchParams({
                  view: "pipeline",
                  ...(search ? { q: search } : {}),
                  ...(status ? { status } : {}),
                }).toString()}`,
              },
            ]}
            className="lg:ml-auto"
          />
        </div>

        {/* ========== Content ========== */}
        {view === "pipeline" && pipelineData ? (
          <LeadPipelineView grouped={pipelineData} stages={PIPELINE_STAGES} />
        ) : listData.items.length === 0 ? (
          <div className="rounded-xl border border-border bg-card shadow-xs">
            <EmptyState
              icon={<UserCheck className="h-5 w-5" />}
              title={
                search || status
                  ? "No encontramos leads con ese filtro"
                  : "Aún no tienes leads"
              }
              description={
                search || status
                  ? "Prueba ajustando tu búsqueda o limpia los filtros."
                  : "Añade tu primer lead para empezar a gestionar tu pipeline."
              }
              accent={!search && !status}
            >
              <Button asChild size="sm" leftIcon={<Plus className="h-4 w-4" />}>
                <Link href="/leads/new">Nuevo lead</Link>
              </Button>
            </EmptyState>
          </div>
        ) : (
          <DataTable
            footer={
              listData.totalPages > 1 ? (
                <DataTableFooter>
                  <Pagination
                    page={page}
                    totalPages={listData.totalPages}
                    total={listData.total}
                    pageSize={listData.pageSize}
                    baseHref="/leads"
                    preserveQuery={preserveQuery}
                    itemsLabel="leads"
                    className="w-full"
                  />
                </DataTableFooter>
              ) : undefined
            }
          >
            <DataTableHeader>
              <DataTableColumn>Nombre</DataTableColumn>
              <DataTableColumn className="hidden md:table-cell">
                Tipo
              </DataTableColumn>
              <DataTableColumn
                align="right"
                className="hidden lg:table-cell"
              >
                Presupuesto
              </DataTableColumn>
              <DataTableColumn className="hidden lg:table-cell">
                Fecha evento
              </DataTableColumn>
              <DataTableColumn>Estado</DataTableColumn>
              <DataTableColumn
                align="right"
                className="hidden sm:table-cell"
              >
                Creado
              </DataTableColumn>
            </DataTableHeader>
            <DataTableBody>
              {(listData.items as LeadRow[]).map((lead) => (
                <DataTableRow key={lead.id} interactive className="group">
                  <DataTableCell>
                    <Link
                      href={`/leads/${lead.id}`}
                      className="-m-1 block rounded p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                    >
                      <p className="font-semibold text-foreground transition-colors group-hover:text-brand">
                        {lead.name}
                      </p>
                      {lead.email && (
                        <p className="mt-0.5 max-w-[220px] truncate text-caption text-muted-foreground">
                          {lead.email}
                        </p>
                      )}
                    </Link>
                  </DataTableCell>
                  <DataTableCell className="hidden text-muted-foreground capitalize md:table-cell">
                    {lead.event_type ?? "—"}
                  </DataTableCell>
                  <DataTableCell
                    align="right"
                    className="hidden tabular-nums lg:table-cell"
                  >
                    {lead.budget
                      ? formatCurrency(
                          Number(lead.budget),
                          lead.currency ?? "DOP",
                        )
                      : "—"}
                  </DataTableCell>
                  <DataTableCell className="hidden text-muted-foreground lg:table-cell">
                    {lead.event_date
                      ? formatDateShort(new Date(lead.event_date))
                      : "—"}
                  </DataTableCell>
                  <DataTableCell>
                    <StatusBadge status={lead.status} />
                  </DataTableCell>
                  <DataTableCell
                    align="right"
                    className="hidden text-muted-foreground tabular-nums sm:table-cell"
                  >
                    {formatDateShort(new Date(lead.created_at))}
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
