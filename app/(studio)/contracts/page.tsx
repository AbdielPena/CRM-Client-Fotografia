import Link from "next/link"
import {
  FileText,
  PenLine,
  CheckCircle,
  AlertCircle,
  Plus,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { getContracts } from "@/server/services/contract.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { formatDateShort } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
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

export const metadata: Metadata = { title: "Contratos" }

const STATUS_CHIPS: FilterChip[] = [
  { key: "draft", label: "Borrador" },
  { key: "sent", label: "Enviados" },
  { key: "signed", label: "Firmados" },
  { key: "voided", label: "Anulados" },
]

const STATUS_ICON: Record<
  string,
  { Icon: React.ElementType; className: string }
> = {
  signed: { Icon: CheckCircle, className: "text-success" },
  voided: { Icon: AlertCircle, className: "text-danger" },
  sent: { Icon: PenLine, className: "text-info" },
  draft: { Icon: FileText, className: "text-muted-foreground" },
}

type ContractRow = {
  id: string
  title: string
  status: string
  created_at: string
  signed_at: string | null
  client?: { name: string } | null
  project?: { name: string } | null
}

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: { status?: string; page?: string }
}) {
  const session = await requireStudioAuth()
  const status = searchParams.status
  const page = Number(searchParams.page ?? 1)

  const [data, unread] = await Promise.all([
    getContracts(session.studioId, { status, page }),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Acuerdos firmados"
        title="Contratos"
        description={`${data.total} contrato${data.total === 1 ? "" : "s"} — protege tu trabajo y formaliza cada acuerdo.`}
        unreadNotifications={unread}
        actions={
          <Button asChild size="sm" leftIcon={<Plus className="h-4 w-4" />}>
            <Link href="/contracts/new">Nuevo contrato</Link>
          </Button>
        }
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
        <FilterChips
          baseHref="/contracts"
          paramName="status"
          current={status}
          chips={STATUS_CHIPS}
        />

        {data.items.length === 0 ? (
          <div className="rounded-xl border border-border bg-card shadow-xs">
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title={
                status ? "No encontramos contratos" : "Aún no tienes contratos"
              }
              description={
                status
                  ? "Prueba con otro filtro o limpia los filtros actuales."
                  : "Crea tu primer contrato para proteger tu trabajo y formalizar acuerdos."
              }
              accent={!status}
            >
              <Button asChild size="sm" leftIcon={<Plus className="h-4 w-4" />}>
                <Link href="/contracts/new">Nuevo contrato</Link>
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
                    baseHref="/contracts"
                    preserveQuery={{ status }}
                    itemsLabel="contratos"
                    className="w-full"
                  />
                </DataTableFooter>
              ) : undefined
            }
          >
            <DataTableHeader>
              <DataTableColumn>Contrato</DataTableColumn>
              <DataTableColumn className="hidden md:table-cell">
                Cliente
              </DataTableColumn>
              <DataTableColumn className="hidden lg:table-cell">
                Proyecto
              </DataTableColumn>
              <DataTableColumn>Estado</DataTableColumn>
              <DataTableColumn
                align="right"
                className="hidden sm:table-cell"
              >
                Creado
              </DataTableColumn>
              <DataTableColumn
                align="right"
                className="hidden lg:table-cell"
              >
                Firmado
              </DataTableColumn>
            </DataTableHeader>
            <DataTableBody>
              {(data.items as ContractRow[]).map((contract) => {
                const iconMeta =
                  STATUS_ICON[contract.status] ?? STATUS_ICON.draft
                const Icon = iconMeta.Icon
                return (
                  <DataTableRow key={contract.id} interactive className="group">
                    <DataTableCell>
                      <Link
                        href={`/contracts/${contract.id}`}
                        className="-m-1 flex items-center gap-2.5 rounded p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                      >
                        <span
                          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted ${iconMeta.className}`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <p className="truncate font-semibold text-foreground transition-colors group-hover:text-brand">
                          {contract.title}
                        </p>
                      </Link>
                    </DataTableCell>
                    <DataTableCell className="hidden md:table-cell">
                      {contract.client?.name ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </DataTableCell>
                    <DataTableCell className="hidden text-caption text-muted-foreground lg:table-cell">
                      {contract.project?.name ?? "—"}
                    </DataTableCell>
                    <DataTableCell>
                      <StatusBadge status={contract.status} />
                    </DataTableCell>
                    <DataTableCell
                      align="right"
                      className="hidden text-muted-foreground tabular-nums sm:table-cell"
                    >
                      {formatDateShort(new Date(contract.created_at))}
                    </DataTableCell>
                    <DataTableCell
                      align="right"
                      className="hidden tabular-nums lg:table-cell"
                    >
                      {contract.signed_at ? (
                        <span className="font-semibold text-success">
                          {formatDateShort(new Date(contract.signed_at))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </DataTableCell>
                  </DataTableRow>
                )
              })}
            </DataTableBody>
          </DataTable>
        )}
      </div>
    </>
  )
}
