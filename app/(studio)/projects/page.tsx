import Link from "next/link"
import {
  FolderOpen,
  Calendar,
  Plus,
  Settings2,
  LayoutGrid,
  KanbanSquare,
  CircleDot,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { getProjects, countProjects } from "@/server/services/project.service"
import { getProjectsMissingCollaborators } from "@/server/services/collaborator.service"
import { getProjectStatuses } from "@/server/services/project-status.service"
import { getServiceCategories } from "@/server/services/service-category.service"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { isCompletedProjectLabel } from "@/lib/projects/status"
import { formatDate } from "@/lib/utils/currency"
import { cn } from "@/lib/utils/cn"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { SearchInput } from "@/components/shared/search-input"
import { EmptyState } from "@/components/shared/empty-state"
import { FilterChips, type FilterChip } from "@/components/shared/filter-chips"
import { Pagination } from "@/components/shared/pagination"
import { ProjectStatusPicker } from "@/components/projects/project-status-picker"
import {
  ProjectKanbanView,
  type ProjectCard,
} from "@/components/projects/project-kanban-view"

export const metadata: Metadata = { title: "Sesiones" }

// Render siempre dinámico: evita que la navegación soft (toggle de vista/scope,
// chips) sirva un shell de prefetch cacheado sin el contenido — con loading.tsx
// del segmento (studio) eso dejaba el tablero en blanco hasta recargar.
export const dynamic = "force-dynamic"

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

type ViewMode = "grid" | "kanban"
type Scope = "active" | "completed"

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: {
    q?: string
    status?: string
    category?: string
    page?: string
    view?: string
    scope?: string
  }
}) {
  const session = await requireStudioAuth()
  const search = searchParams.q
  const category = searchParams.category
  const page = Number(searchParams.page ?? 1)
  const scope: Scope = searchParams.scope === "completed" ? "completed" : "active"
  const viewParam: ViewMode = searchParams.view === "kanban" ? "kanban" : "grid"
  // En "Completados" siempre usamos grid (no hay pipeline que arrastrar).
  const view: ViewMode = scope === "completed" ? "grid" : viewParam
  // El filtro por estado solo aplica en la vista de activos.
  const status = scope === "active" ? searchParams.status : undefined

  // Primero los estados para poder dividir activos/completados.
  const [statuses, categories, unread] = await Promise.all([
    getProjectStatuses(session.studioId),
    getServiceCategories(session.studioId).catch(() => []),
    countUnreadNotifications(session.studioId),
  ])

  const completedStatuses = statuses.filter((s) => isCompletedProjectLabel(s.label))
  const activeStatuses = statuses.filter((s) => !isCompletedProjectLabel(s.label))
  const completedLabels = completedStatuses.map((s) => s.label)
  // Label terminal para la columna "Completar" del kanban (si existe el estado).
  const terminalLabel = completedStatuses[0]?.label ?? null

  // Filtro de proyectos según scope.
  const scopeFilter =
    scope === "completed"
      ? { onlyStatuses: completedLabels }
      : { excludeStatuses: completedLabels }

  const fetchOpts =
    view === "kanban"
      ? { search, serviceCategoryId: category, page: 1, pageSize: 200, ...scopeFilter }
      : { search, status, serviceCategoryId: category, page, ...scopeFilter }

  const [data, activeCount, completedCount] = await Promise.all([
    getProjects(session.studioId, fetchOpts),
    countProjects(session.studioId, {
      search,
      serviceCategoryId: category,
      excludeStatuses: completedLabels,
    }),
    completedLabels.length
      ? countProjects(session.studioId, {
          search,
          serviceCategoryId: category,
          onlyStatuses: completedLabels,
        })
      : Promise.resolve(0),
  ])

  // Badge "falta colaborador" (solo en grid): proyectos cuyo plan requiere
  // colaboradores aún no asignados.
  const missingCollab =
    view === "grid"
      ? await getProjectsMissingCollaborators(
          session.studioId,
          (data.items as Array<{ id: string }>).map((i) => i.id),
        )
      : new Set<string>()

  const STATUS_CHIPS: FilterChip[] = activeStatuses.map((s) => ({
    key: s.label,
    label: s.label,
  }))
  const CATEGORY_CHIPS: FilterChip[] = categories.map((c) => ({
    key: c.id,
    label: c.name,
  }))

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams()
    const merged = {
      q: search,
      status,
      category,
      page: undefined,
      view,
      scope: scope === "completed" ? "completed" : undefined,
      ...overrides,
    }
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v)
    }
    const qs = params.toString()
    return qs ? `/projects?${qs}` : "/projects"
  }

  // Hrefs del toggle de scope (resetean status + página).
  const activeScopeHref = (() => {
    const params = new URLSearchParams()
    if (search) params.set("q", search)
    if (category) params.set("category", category)
    if (viewParam === "kanban") params.set("view", "kanban")
    const qs = params.toString()
    return qs ? `/projects?${qs}` : "/projects"
  })()
  const completedScopeHref = (() => {
    const params = new URLSearchParams()
    if (search) params.set("q", search)
    if (category) params.set("category", category)
    params.set("scope", "completed")
    return `/projects?${params.toString()}`
  })()

  return (
    <>
      <AppTopbar
        title="Sesiones"
        description={`${activeCount} activo${activeCount === 1 ? "" : "s"} · ${completedCount} completado${completedCount === 1 ? "" : "s"}`}
        unreadNotifications={unread}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="ghost">
              <Link href="/settings/project-statuses">
                <Settings2 className="mr-1 h-4 w-4" />
                Personalizar estados
              </Link>
            </Button>
            <Button asChild size="sm" leftIcon={<Plus className="h-4 w-4" />}>
              <Link href="/projects/new">Nueva sesión</Link>
            </Button>
          </div>
        }
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
        {/* Scope: Activos | Completados (vista aparte) */}
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          <Link
            href={activeScopeHref}
            prefetch={false}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors",
              scope === "active"
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <CircleDot className="h-3.5 w-3.5" /> Activos
            <span
              className={cn(
                "ml-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                scope === "active" ? "bg-white/20" : "bg-muted text-muted-foreground",
              )}
            >
              {activeCount}
            </span>
          </Link>
          <Link
            href={completedScopeHref}
            prefetch={false}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors",
              scope === "completed"
                ? "bg-emerald-600 text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Completados
            <span
              className={cn(
                "ml-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                scope === "completed" ? "bg-white/20" : "bg-muted text-muted-foreground",
              )}
            >
              {completedCount}
            </span>
          </Link>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput
            placeholder="Buscar sesiones…"
            className="w-full lg:w-80"
          />

          {scope === "active" && view === "grid" && (
            <FilterChips
              baseHref="/projects"
              paramName="status"
              current={status}
              chips={STATUS_CHIPS}
              preserveQuery={{ q: search, category, view: "grid" }}
              prefetch={false}
              className="flex-1"
            />
          )}

          {CATEGORY_CHIPS.length > 0 && (
            <FilterChips
              baseHref="/projects"
              paramName="category"
              current={category}
              chips={CATEGORY_CHIPS}
              preserveQuery={{
                q: search,
                status,
                view,
                scope: scope === "completed" ? "completed" : undefined,
              }}
              prefetch={false}
            />
          )}

          {/* View toggle: solo en activos */}
          {scope === "active" && (
            <div className="ml-auto inline-flex rounded-lg border border-border bg-card p-0.5">
              <Link
                href={buildHref({ view: "grid" })}
                prefetch={false}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors",
                  view === "grid"
                    ? "bg-brand text-brand-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Grid
              </Link>
              <Link
                href={buildHref({ view: "kanban" })}
                prefetch={false}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors",
                  view === "kanban"
                    ? "bg-brand text-brand-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <KanbanSquare className="h-3.5 w-3.5" /> Kanban
              </Link>
            </div>
          )}
        </div>

        {data.items.length === 0 ? (
          <div className="rounded-xl border border-border bg-card">
            <EmptyState
              icon={
                scope === "completed" ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <FolderOpen className="h-5 w-5" />
                )
              }
              title={
                scope === "completed"
                  ? "Aún no hay sesiones completadas"
                  : search || status || category
                    ? "No encontramos sesiones"
                    : "Aún no tienes sesiones"
              }
              description={
                scope === "completed"
                  ? "Cuando marques una sesión como “Completada” aparecerá aquí, separada de las pendientes."
                  : search || status || category
                    ? "Prueba ajustando tu búsqueda o limpia los filtros."
                    : "Crea tu primera sesión para empezar a organizar tu trabajo."
              }
              accent={scope === "active" && !search && !status && !category}
            >
              {scope === "active" && (
                <Button asChild size="sm" leftIcon={<Plus className="h-4 w-4" />}>
                  <Link href="/projects/new">Nueva sesión</Link>
                </Button>
              )}
            </EmptyState>
          </div>
        ) : view === "kanban" ? (
          <ProjectKanbanView
            projects={data.items as unknown as ProjectCard[]}
            statuses={activeStatuses}
            completedStatusLabel={terminalLabel}
          />
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
                    className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card p-5 transition-colors duration-fast hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                  >
                    <div className="relative mb-3 flex items-start justify-between gap-2">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                        <FolderOpen className="h-4 w-4" />
                      </div>
                      <ProjectStatusPicker
                        projectId={project.id}
                        currentStatus={project.status}
                        statuses={statuses}
                        compact
                      />
                    </div>

                    <h3 className="line-clamp-1 text-sm font-semibold text-foreground transition-colors group-hover:text-brand">
                      {project.name}
                    </h3>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {clientName}
                    </p>

                    {missingCollab.has(project.id) && (
                      <span className="mt-2 inline-flex items-center gap-1 self-start rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3" /> Falta colaborador
                      </span>
                    )}

                    <div className="mt-4 space-y-1.5 border-t border-border/60 pt-3">
                      {project.event_type && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="inline-flex rounded-full bg-muted px-2 py-0.5 font-medium capitalize text-muted-foreground">
                            {TYPE_LABELS[project.event_type] ??
                              project.event_type}
                          </span>
                        </div>
                      )}
                      {project.event_date && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
                preserveQuery={{
                  q: search,
                  status,
                  category,
                  view: "grid",
                  scope: scope === "completed" ? "completed" : undefined,
                }}
                prefetch={false}
                itemsLabel="sesiones"
              />
            )}
          </>
        )}
      </div>
    </>
  )
}
