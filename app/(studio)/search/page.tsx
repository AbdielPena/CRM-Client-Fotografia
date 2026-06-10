import Link from "next/link"
import {
  Search,
  Users,
  FolderKanban,
  Receipt,
  UserPlus,
  Images,
  CheckSquare,
  ChevronRight,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  globalSearch,
  type SearchResultType,
} from "@/server/services/global-search.service"

import { AppTopbar } from "@/components/layout/app-topbar"
import { SearchInput } from "@/components/shared/search-input"
import { EmptyState } from "@/components/shared/empty-state"

export const metadata: Metadata = { title: "Buscar" }
export const dynamic = "force-dynamic"

const TYPE_ICON: Record<SearchResultType, React.ComponentType<{ className?: string }>> = {
  client: Users,
  project: FolderKanban,
  invoice: Receipt,
  lead: UserPlus,
  gallery: Images,
  task: CheckSquare,
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  const session = await requireStudioAuth()
  const q = (searchParams.q ?? "").trim()

  const [results, unread] = await Promise.all([
    globalSearch(session.studioId, q),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Búsqueda global"
        title="Buscar"
        description={
          q
            ? `${results.total} resultado${results.total === 1 ? "" : "s"} para “${q}”.`
            : "Encontrá clientes, proyectos, facturas, leads, galerías y tareas."
        }
        unreadNotifications={unread}
      />

      <div className="space-y-6 px-6 py-6 lg:px-8 lg:py-8">
        <SearchInput
          placeholder="Buscar en todo el estudio…"
          className="w-full sm:w-96"
        />

        {q.length < 2 ? (
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title="Escribí para buscar"
            description="Mínimo 2 caracteres. Busca por nombre, email, número de factura, título de galería o tarea."
            accent
          />
        ) : results.total === 0 ? (
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title="Sin resultados"
            description={`No encontramos nada para “${q}”. Probá con otro término.`}
          />
        ) : (
          <div className="space-y-6">
            {results.groups.map((group) => {
              const Icon = TYPE_ICON[group.type]
              return (
                <section key={group.type} className="space-y-2">
                  <h2 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                    {group.label}
                    <span className="text-muted-foreground/60">
                      ({group.results.length})
                    </span>
                  </h2>
                  <ul className="overflow-hidden rounded-2xl border border-border bg-card">
                    {group.results.map((r) => (
                      <li key={`${r.type}:${r.id}`} className="border-b border-border last:border-0">
                        <Link
                          href={r.href}
                          className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60"
                        >
                          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-brand">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-medium text-foreground">
                              {r.label}
                            </span>
                            {r.sublabel && (
                              <span className="block truncate text-[12px] text-muted-foreground">
                                {r.sublabel}
                              </span>
                            )}
                          </span>
                          <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50 group-hover:text-brand" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
