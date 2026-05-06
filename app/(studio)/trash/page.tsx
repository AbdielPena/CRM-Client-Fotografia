import {
  Trash2,
  Mail,
  Phone,
  AlertTriangle,
  FolderOpen,
  FileText,
  Receipt,
  ImageIcon,
  PackageCheck,
  Users,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { getTrashedClients } from "@/server/services/client.service"
import {
  getTrashCounts,
  getTrashedProjects,
  getTrashedContracts,
  getTrashedInvoices,
  getTrashedGalleries,
  getTrashedDeliveries,
} from "@/server/services/trash.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { formatDateShort, formatCurrency } from "@/lib/utils/currency"

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
import { TrashItemActions } from "@/components/trash/trash-item-actions"
import { TrashTabs, type TrashTab } from "@/components/trash/trash-tabs"

export const metadata: Metadata = { title: "Papelera" }

const VALID_TABS = new Set<TrashTab>([
  "clients",
  "projects",
  "contracts",
  "invoices",
  "galleries",
  "deliveries",
])

const TAB_LABELS: Record<TrashTab, string> = {
  clients: "clientes",
  projects: "proyectos",
  contracts: "contratos",
  invoices: "facturas",
  galleries: "galerías",
  deliveries: "entregas",
}

export default async function TrashPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string; tab?: string }
}) {
  const session = await requireStudioAuth()
  const search = searchParams.q
  const page = Number(searchParams.page ?? 1)
  const tabParam = (searchParams.tab as TrashTab) || "clients"
  const tab: TrashTab = VALID_TABS.has(tabParam) ? tabParam : "clients"

  const canPurge = session.role === "admin" || session.role === "owner"

  const [counts, unread] = await Promise.all([
    getTrashCounts(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Administración"
        title="Papelera"
        description="Items eliminados que podés restaurar o borrar permanentemente. Quedan acá hasta que decidas qué hacer."
        unreadNotifications={unread}
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
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

        <TrashTabs active={tab} counts={counts} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            placeholder={`Buscar en ${TAB_LABELS[tab]}…`}
            className="w-full sm:w-80"
          />
        </div>

        {tab === "clients" && (
          <ClientsTab
            studioId={session.studioId}
            search={search}
            page={page}
            canPurge={canPurge}
          />
        )}
        {tab === "projects" && (
          <ProjectsTab
            studioId={session.studioId}
            search={search}
            page={page}
            canPurge={canPurge}
          />
        )}
        {tab === "contracts" && (
          <ContractsTab
            studioId={session.studioId}
            search={search}
            page={page}
            canPurge={canPurge}
          />
        )}
        {tab === "invoices" && (
          <InvoicesTab
            studioId={session.studioId}
            search={search}
            page={page}
            canPurge={canPurge}
          />
        )}
        {tab === "galleries" && (
          <GalleriesTab
            studioId={session.studioId}
            search={search}
            page={page}
            canPurge={canPurge}
          />
        )}
        {tab === "deliveries" && (
          <DeliveriesTab
            studioId={session.studioId}
            search={search}
            page={page}
            canPurge={canPurge}
          />
        )}
      </div>
    </>
  )
}

// ----------------------------------------------------------------------------
// TAB COMPONENTS — uno por entidad
// ----------------------------------------------------------------------------

interface TabProps {
  studioId: string
  search?: string
  page: number
  canPurge: boolean
}

async function ClientsTab({ studioId, search, page, canPurge }: TabProps) {
  const data = await getTrashedClients(studioId, { search, page })

  if (data.items.length === 0) {
    return (
      <EmptyTrashCard
        icon={<Users className="h-5 w-5" />}
        search={search}
        label="clientes"
      />
    )
  }

  return (
    <DataTable footer={tablePagination(page, data, "clients", search)}>
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
        {data.items.map((client) => (
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
              <ReasonCell reason={client.deletion_reason} />
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
  )
}

async function ProjectsTab({ studioId, search, page, canPurge }: TabProps) {
  const data = await getTrashedProjects(studioId, { search, page })
  if (data.items.length === 0) {
    return (
      <EmptyTrashCard
        icon={<FolderOpen className="h-5 w-5" />}
        search={search}
        label="proyectos"
      />
    )
  }
  return (
    <DataTable footer={tablePagination(page, data, "projects", search)}>
      <DataTableHeader>
        <DataTableColumn>Proyecto</DataTableColumn>
        <DataTableColumn className="hidden md:table-cell">Cliente</DataTableColumn>
        <DataTableColumn className="hidden lg:table-cell">Motivo</DataTableColumn>
        <DataTableColumn align="right" className="hidden sm:table-cell">
          Eliminado
        </DataTableColumn>
        <DataTableColumn align="right">
          <span className="sr-only">Acciones</span>
        </DataTableColumn>
      </DataTableHeader>
      <DataTableBody>
        {data.items.map((p) => (
          <DataTableRow key={p.id}>
            <DataTableCell>
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{p.name}</p>
                {p.status && (
                  <p className="text-caption text-muted-foreground">{p.status}</p>
                )}
              </div>
            </DataTableCell>
            <DataTableCell className="hidden md:table-cell">
              <span className="text-body-sm text-muted-foreground">
                {p.client_name ?? "—"}
              </span>
            </DataTableCell>
            <DataTableCell className="hidden max-w-[260px] lg:table-cell">
              <ReasonCell reason={p.deletion_reason} />
            </DataTableCell>
            <DataTableCell
              align="right"
              className="hidden text-muted-foreground tabular-nums sm:table-cell"
            >
              {p.deleted_at ? formatDateShort(new Date(p.deleted_at)) : "—"}
            </DataTableCell>
            <DataTableCell align="right">
              <TrashItemActions
                entityType="project"
                entityId={p.id}
                entityName={p.name}
                canPurge={canPurge}
              />
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  )
}

async function ContractsTab({ studioId, search, page, canPurge }: TabProps) {
  const data = await getTrashedContracts(studioId, { search, page })
  if (data.items.length === 0) {
    return (
      <EmptyTrashCard
        icon={<FileText className="h-5 w-5" />}
        search={search}
        label="contratos"
      />
    )
  }
  return (
    <DataTable footer={tablePagination(page, data, "contracts", search)}>
      <DataTableHeader>
        <DataTableColumn>Contrato</DataTableColumn>
        <DataTableColumn className="hidden md:table-cell">Proyecto</DataTableColumn>
        <DataTableColumn className="hidden lg:table-cell">Motivo</DataTableColumn>
        <DataTableColumn align="right" className="hidden sm:table-cell">
          Eliminado
        </DataTableColumn>
        <DataTableColumn align="right">
          <span className="sr-only">Acciones</span>
        </DataTableColumn>
      </DataTableHeader>
      <DataTableBody>
        {data.items.map((c) => (
          <DataTableRow key={c.id}>
            <DataTableCell>
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {c.title ?? `Contrato ${c.id.slice(0, 8)}`}
                </p>
                {c.status && (
                  <p className="text-caption text-muted-foreground">{c.status}</p>
                )}
              </div>
            </DataTableCell>
            <DataTableCell className="hidden md:table-cell">
              <span className="text-body-sm text-muted-foreground">
                {c.project_name ?? "—"}
              </span>
            </DataTableCell>
            <DataTableCell className="hidden max-w-[260px] lg:table-cell">
              <ReasonCell reason={c.deletion_reason} />
            </DataTableCell>
            <DataTableCell
              align="right"
              className="hidden text-muted-foreground tabular-nums sm:table-cell"
            >
              {c.deleted_at ? formatDateShort(new Date(c.deleted_at)) : "—"}
            </DataTableCell>
            <DataTableCell align="right">
              <TrashItemActions
                entityType="contract"
                entityId={c.id}
                entityName={c.title ?? "este contrato"}
                canPurge={canPurge}
              />
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  )
}

async function InvoicesTab({ studioId, search, page, canPurge }: TabProps) {
  const data = await getTrashedInvoices(studioId, { search, page })
  if (data.items.length === 0) {
    return (
      <EmptyTrashCard
        icon={<Receipt className="h-5 w-5" />}
        search={search}
        label="facturas"
      />
    )
  }
  return (
    <DataTable footer={tablePagination(page, data, "invoices", search)}>
      <DataTableHeader>
        <DataTableColumn>Factura</DataTableColumn>
        <DataTableColumn className="hidden md:table-cell">Proyecto</DataTableColumn>
        <DataTableColumn align="right" className="hidden sm:table-cell">
          Monto
        </DataTableColumn>
        <DataTableColumn align="right" className="hidden lg:table-cell">
          Eliminado
        </DataTableColumn>
        <DataTableColumn align="right">
          <span className="sr-only">Acciones</span>
        </DataTableColumn>
      </DataTableHeader>
      <DataTableBody>
        {data.items.map((inv) => (
          <DataTableRow key={inv.id}>
            <DataTableCell>
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {inv.invoice_number ?? `INV-${inv.id.slice(0, 8)}`}
                </p>
                {inv.status && (
                  <p className="text-caption text-muted-foreground">
                    {inv.status}
                  </p>
                )}
              </div>
            </DataTableCell>
            <DataTableCell className="hidden md:table-cell">
              <span className="text-body-sm text-muted-foreground">
                {inv.project_name ?? "—"}
              </span>
            </DataTableCell>
            <DataTableCell
              align="right"
              className="hidden tabular-nums sm:table-cell"
            >
              {inv.amount_total != null ? formatCurrency(inv.amount_total) : "—"}
            </DataTableCell>
            <DataTableCell
              align="right"
              className="hidden text-muted-foreground tabular-nums lg:table-cell"
            >
              {inv.deleted_at ? formatDateShort(new Date(inv.deleted_at)) : "—"}
            </DataTableCell>
            <DataTableCell align="right">
              <TrashItemActions
                entityType="invoice"
                entityId={inv.id}
                entityName={inv.invoice_number ?? "esta factura"}
                canPurge={canPurge}
              />
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  )
}

async function GalleriesTab({ studioId, search, page, canPurge }: TabProps) {
  const data = await getTrashedGalleries(studioId, { search, page })
  if (data.items.length === 0) {
    return (
      <EmptyTrashCard
        icon={<ImageIcon className="h-5 w-5" />}
        search={search}
        label="galerías"
      />
    )
  }
  return (
    <DataTable footer={tablePagination(page, data, "galleries", search)}>
      <DataTableHeader>
        <DataTableColumn>Galería</DataTableColumn>
        <DataTableColumn className="hidden md:table-cell">Proyecto</DataTableColumn>
        <DataTableColumn className="hidden lg:table-cell">Motivo</DataTableColumn>
        <DataTableColumn align="right" className="hidden sm:table-cell">
          Eliminado
        </DataTableColumn>
        <DataTableColumn align="right">
          <span className="sr-only">Acciones</span>
        </DataTableColumn>
      </DataTableHeader>
      <DataTableBody>
        {data.items.map((g) => (
          <DataTableRow key={g.id}>
            <DataTableCell>
              <p className="truncate font-medium text-foreground">
                {g.name ?? `Galería ${g.id.slice(0, 8)}`}
              </p>
            </DataTableCell>
            <DataTableCell className="hidden md:table-cell">
              <span className="text-body-sm text-muted-foreground">
                {g.project_name ?? "—"}
              </span>
            </DataTableCell>
            <DataTableCell className="hidden max-w-[260px] lg:table-cell">
              <ReasonCell reason={g.deletion_reason} />
            </DataTableCell>
            <DataTableCell
              align="right"
              className="hidden text-muted-foreground tabular-nums sm:table-cell"
            >
              {g.deleted_at ? formatDateShort(new Date(g.deleted_at)) : "—"}
            </DataTableCell>
            <DataTableCell align="right">
              <TrashItemActions
                entityType="gallery"
                entityId={g.id}
                entityName={g.name ?? "esta galería"}
                canPurge={canPurge}
              />
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  )
}

async function DeliveriesTab({ studioId, search, page, canPurge }: TabProps) {
  const data = await getTrashedDeliveries(studioId, { search, page })
  if (data.items.length === 0) {
    return (
      <EmptyTrashCard
        icon={<PackageCheck className="h-5 w-5" />}
        search={search}
        label="entregas"
      />
    )
  }
  return (
    <DataTable footer={tablePagination(page, data, "deliveries", search)}>
      <DataTableHeader>
        <DataTableColumn>Entrega</DataTableColumn>
        <DataTableColumn className="hidden md:table-cell">Estado</DataTableColumn>
        <DataTableColumn className="hidden lg:table-cell">Motivo</DataTableColumn>
        <DataTableColumn align="right" className="hidden sm:table-cell">
          Eliminado
        </DataTableColumn>
        <DataTableColumn align="right">
          <span className="sr-only">Acciones</span>
        </DataTableColumn>
      </DataTableHeader>
      <DataTableBody>
        {data.items.map((d) => (
          <DataTableRow key={d.id}>
            <DataTableCell>
              <p className="truncate font-medium text-foreground">
                {d.title ?? `Entrega ${d.id.slice(0, 8)}`}
              </p>
            </DataTableCell>
            <DataTableCell className="hidden md:table-cell">
              <span className="text-body-sm text-muted-foreground">
                {d.status ?? "—"}
              </span>
            </DataTableCell>
            <DataTableCell className="hidden max-w-[260px] lg:table-cell">
              <ReasonCell reason={d.deletion_reason} />
            </DataTableCell>
            <DataTableCell
              align="right"
              className="hidden text-muted-foreground tabular-nums sm:table-cell"
            >
              {d.deleted_at ? formatDateShort(new Date(d.deleted_at)) : "—"}
            </DataTableCell>
            <DataTableCell align="right">
              <TrashItemActions
                entityType="delivery"
                entityId={d.id}
                entityName={d.title ?? "esta entrega"}
                canPurge={canPurge}
              />
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  )
}

// ----------------------------------------------------------------------------
// Helpers compartidos
// ----------------------------------------------------------------------------

function ReasonCell({ reason }: { reason: string | null }) {
  return reason ? (
    <p className="truncate text-body-sm text-muted-foreground" title={reason}>
      {reason}
    </p>
  ) : (
    <span className="text-caption text-muted-foreground/60">Sin motivo</span>
  )
}

function EmptyTrashCard({
  icon,
  search,
  label,
}: {
  icon: React.ReactNode
  search: string | undefined
  label: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-xs">
      <EmptyState
        icon={icon ?? <Trash2 className="h-5 w-5" />}
        title={
          search
            ? `No encontramos ${label} en la papelera`
            : `No hay ${label} en la papelera`
        }
        description={
          search
            ? "Probá ajustando tu búsqueda."
            : "Cuando elimines items desde su listado principal, aparecerán acá."
        }
        accent={!search}
      />
    </div>
  )
}

function tablePagination(
  page: number,
  data: { totalPages: number; total: number; pageSize: number },
  tab: TrashTab,
  search?: string,
) {
  if (data.totalPages <= 1) return undefined
  const preserveQuery: Record<string, string | undefined> = {
    q: search,
    tab: tab !== "clients" ? tab : undefined,
  }
  return (
    <DataTableFooter>
      <Pagination
        page={page}
        totalPages={data.totalPages}
        total={data.total}
        pageSize={data.pageSize}
        baseHref="/trash"
        preserveQuery={preserveQuery}
        itemsLabel="items"
        className="w-full"
      />
    </DataTableFooter>
  )
}
