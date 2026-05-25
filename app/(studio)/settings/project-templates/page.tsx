import Link from "next/link"
import {
  FileStack,
  Plus,
  Eye,
  TrendingUp,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { listProjectTemplates } from "@/server/services/project-template.service"
import { formatDate } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"

export const metadata: Metadata = { title: "Plantillas de proyecto" }

export default async function ProjectTemplatesPage() {
  const session = await requireStudioAuth()

  const [templates, unread] = await Promise.all([
    listProjectTemplates(session.studioId),
    countUnreadNotifications(session.studioId),
  ])

  return (
    <>
      <AppTopbar
        eyebrow="Configuración"
        title="Plantillas de proyecto"
        description="Define workflows reutilizables (tasks + emails + deliverables) por tipo de evento."
        unreadNotifications={unread}
        actions={
          <Button asChild>
            <Link href="/settings/project-templates/new">
              <Plus className="mr-1 size-4" />
              Nueva plantilla
            </Link>
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        {templates.length === 0 ? (
          <EmptyState
            icon={<FileStack className="size-12 text-muted-foreground/60" />}
            title="Sin plantillas"
            description="Crea plantillas reutilizables para tus tipos de evento (boda, quince, sesión, etc). Define las tasks que siempre se repiten, los emails automáticos, los deliverables."
          >
            <Button asChild>
              <Link href="/settings/project-templates/new">
                <Plus className="mr-1 size-4" />
                Crear primera plantilla
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {templates.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/settings/project-templates/${t.id}`}
                  className="sf-card group block overflow-hidden p-0 transition-shadow hover:shadow-md"
                >
                  {t.cover_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.cover_image_url}
                      alt={t.name}
                      className="h-32 w-full object-cover"
                    />
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold">{t.name}</h3>
                        {t.event_type && (
                          <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                            {t.event_type}
                          </span>
                        )}
                      </div>
                      {!t.is_active && (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                          Inactiva
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {t.description}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>
                        <FileStack className="mr-1 inline size-2.5" />
                        {(t.config.tasks ?? []).length} tasks ·{" "}
                        {(t.config.deliverables ?? []).length} deliverables
                      </span>
                      <span>
                        <TrendingUp className="mr-1 inline size-2.5" />
                        {t.usage_count} usos
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  )
}
