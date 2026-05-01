import Link from "next/link"
import { FolderOpen, Calendar, Plus, Settings2 } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { getProjects } from "@/server/services/project.service"
import { getProjectStatuses } from "@/server/services/project-status.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { formatDate } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { SearchInput } from "@/components/shared/search-input"
import { EmptyState } from "@/components/shared/empty-state"
import { FilterChips, type FilterChip } from "@/components/shared/filter-chips"
import { Pagination } from "@/components/shared/pagination"
import { ProjectStatusPicker } from "@/components/projects/project-status-picker"

export const metadata: Metadata = { title: "Proyectos" }

const TYPE_LABELS: Record<string, string> = {
  wedding: "Boda",
  portrait: "Retrato",
  family: "Familia",
  corporate: "Corporativo",
  quinceañera: "Quinceañera",
  newborn: "Recién nacido",
  event: "Evento",
  other: "Otro",
}

type ProjectRow = {
  id: string
  name: string
  status: string
  event_type: string | null
  event_date: string | null
  client: { name: string } | { name: string }[]
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; page?: string }
}) {
  const session = await requireStudioAuth()
  const search = searchParams.q
  const status = searchParams.status
  const page = Number(searchParams.page ?? 1)

  const [data, statuses, unread] = await Promise.all([
    getProjects(session.studioId, { search, status, page }),
    getProjectStatuses(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  // FilterChips dinámicos basados en los estados del studio
  const STATUS_CHIPS: FilterChip[] = statuses.map((s) => ({
    key: s.label,
    label: s.label,
  }))

  return (
    <>
      <AppTopbar
        eyebrow="Producción activa"
        title="Proyectos"
        description={`${data.total} proyecto${data.total === 1 ? "" : "s"} en total`}
        unreadNotifications={unread}
        actions={
          <div className="flex items-center gap-2">
            <Button
              asChild
              size="sm"
              variant="ghost"
            >
              <Link href="/settings/project-statuses">
                <Settings2 className="h-4 w-4 mr-1" />
                Estados
              </Link>
            </Button>
            <Button asChild size="sm" leftIcon={<Plus className="h-4 w-4" />}>
              <Link href="/projects/new">Nuevo proyecto</Link>
            </Button>
          </div>
        }
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput
            placeholder="Buscar proyectos…"
            className="w-full lg:w-80"
          />
          <FilterChips
            baseHref="/projects"
            paramName="status"
            current={status}
            chips={STATUS_CHIPS}
            preserveQuery={{ q: search }}
            className="flex-1"
          />
        </div>

        {data.items.length === 0 ? (
          <div className="rounded-xl border border-border bg-card shadow-xs">
            <EmptyState
              icon={<FolderOpen className="h-5 w-5" />}
              title={
                search || status
                  ? "No encontramos proyectos"
                  : "Aún no tienes proyectos"
              }
              description={
                search || status
                  ? "Prueba ajustando tu búsqueda o limpia los filtros."
                  : "Crea tu primer proyecto para empezar a gestionar tus sesiones."
              }
              accent={!search && !status}
            >
              <Button asChild size="sm" leftIcon={<Plus className="h-4 w-4" />}>
                <Link href="/projects/new">Nuevo proyecto</Link>
              </Button>
            </EmptyState>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {(data.items as unknown as ProjectRow[]).map((project) => {
                const clientName = Array.isArray(project.client)
                  ? (project.client[0]?.name ?? "—")
                  : (project.client?.name ?? "—")
                return (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card p-5 shadow-xs transition-all duration-fast hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                  >
                      {/* Aurora halo */}
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-aurora opacity-0 blur-2xl transition-opacity duration-base group-hover:opacity-20"
                      />

                      <div className="relative mb-3 flex items-start justify-between gap-2">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground">
                          <FolderOpen className="h-4 w-4" />
                        </div>
                          <ProjectStatusPicker
                          projectId={project.id}
                          currentStatus={project.status}
                          statuses={statuses}
                          compact
                        />
                      </div>

                      <h3 className="line-clamp-1 text-body font-semibold text-foreground transition-colors group-hover:text-brand">
                        {project.name}
                      </h3>
                      <p className="mt-0.5 truncate text-caption text-muted-foreground">
                        {clientName}
                      </p>

                      <div className="mt-4 space-y-1.5 border-t border-border/60 pt-3">
                        {project.event_type && (
                          <div className="flex items-center gap-2 text-caption">
                            <span className="inline-flex rounded-full bg-muted px-2 py-0.5 font-medium capitalize text-muted-foreground">
                              {TYPE_LABELS[project.event_type] ?? project.event_type}
                            </span>
                          </div>
                        )}
                        {project.event_date && (
                          <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                            <span>{formatDate(new Date(project.event_date))}</span>
                          </div>
                        )}
                      </div>
                  </Link>
                )
              })}
            </div>

            {data.totalPages > 1 && (
              <Pagination
                page={page}
                totalPages={data.totalPages}
                total={data.total}
                pageSize={data.pageSize}
                baseHref="/projects"
                preserveQuery={{ q: search, status }}
                itemsLabel="proyectos"
              />
            )}
          </>
        )}
      </div>
    </>
  )
}
