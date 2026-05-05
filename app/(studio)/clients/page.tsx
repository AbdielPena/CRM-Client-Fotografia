import Link from "next/link"
import { Users, Plus, Mail, Phone } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { getClients } from "@/server/services/client.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { formatDateShort } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { ShareRegisterLinkButton } from "@/components/clients/share-register-link-button"
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

export const metadata: Metadata = { title: "Clientes" }

/** Avatar gradients determinísticas por hash del nombre (aurora palette). */
const AVATAR_GRADIENTS = [
  "from-[hsl(240_84%_64%)] to-[hsl(262_83%_58%)]",
  "from-[hsl(262_83%_58%)] to-[hsl(292_84%_60%)]",
  "from-[hsl(292_84%_60%)] to-[hsl(330_85%_60%)]",
  "from-[hsl(220_90%_60%)] to-[hsl(250_85%_62%)]",
  "from-[hsl(200_88%_55%)] to-[hsl(240_84%_64%)]",
  "from-[hsl(170_75%_45%)] to-[hsl(200_88%_55%)]",
] as const

function gradientFor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length]
}

type ClientRow = {
  id: string
  name: string
  email: string | null
  phone: string | null
  created_at: string
  _count: { projects: number }
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string }
}) {
  const session = await requireStudioAuth()
  const search = searchParams.q
  const page = Number(searchParams.page ?? 1)

  const [data, unread] = await Promise.all([
    getClients(session.studioId, { search, page }),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Base de contactos"
        title="Clientes"
        description={`${data.total} cliente${data.total === 1 ? "" : "s"} registrado${data.total === 1 ? "" : "s"} — el corazón de tu estudio.`}
        unreadNotifications={unread}
        actions={
          <div className="flex items-center gap-2">
            <ShareRegisterLinkButton studioSlug={session.studioSlug} />
            <Button asChild size="sm" leftIcon={<Plus className="h-4 w-4" />}>
              <Link href="/clients/new">Nuevo cliente</Link>
            </Button>
          </div>
        }
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput placeholder="Buscar clientes…" className="w-full sm:w-80" />
        </div>

        {data.items.length === 0 ? (
          <div className="rounded-xl border border-border bg-card shadow-xs">
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title={
                search ? "No encontramos clientes" : "Aún no tienes clientes"
              }
              description={
                search
                  ? "Prueba ajustando tu búsqueda."
                  : "Añade tu primer cliente o conviértelo desde un lead ganado."
              }
              accent={!search}
            >
              <Button asChild size="sm" leftIcon={<Plus className="h-4 w-4" />}>
                <Link href="/clients/new">Nuevo cliente</Link>
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
                    baseHref="/clients"
                    preserveQuery={{ q: search }}
                    itemsLabel="clientes"
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
              <DataTableColumn
                align="right"
                className="hidden sm:table-cell"
              >
                Proyectos
              </DataTableColumn>
              <DataTableColumn
                align="right"
                className="hidden lg:table-cell"
              >
                Desde
              </DataTableColumn>
            </DataTableHeader>
            <DataTableBody>
              {(data.items as ClientRow[]).map((client) => {
                const gradient = gradientFor(client.name)
                return (
                  <DataTableRow key={client.id} interactive className="group">
                    <DataTableCell>
                      <Link
                        href={`/clients/${client.id}`}
                        className="-m-1 flex items-center gap-3 rounded p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                      >
                        <div
                          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-body-sm font-semibold text-white shadow-sm`}
                        >
                          {client.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground transition-colors group-hover:text-brand">
                            {client.name}
                          </p>
                          <p className="text-caption text-muted-foreground md:hidden">
                            {client.email ?? client.phone ?? "—"}
                          </p>
                        </div>
                      </Link>
                    </DataTableCell>
                    <DataTableCell className="hidden md:table-cell">
                      <div className="space-y-0.5">
                        {client.email && (
                          <p className="flex items-center gap-1.5 truncate text-body-sm text-foreground">
                            <Mail className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
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
                    <DataTableCell
                      align="right"
                      className="hidden sm:table-cell"
                    >
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-caption font-semibold tabular-nums text-foreground">
                        {client._count.projects}
                        <span className="text-muted-foreground">
                          {client._count.projects === 1 ? "proyecto" : "proyectos"}
                        </span>
                      </span>
                    </DataTableCell>
                    <DataTableCell
                      align="right"
                      className="hidden text-muted-foreground tabular-nums lg:table-cell"
                    >
                      {formatDateShort(new Date(client.created_at))}
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
