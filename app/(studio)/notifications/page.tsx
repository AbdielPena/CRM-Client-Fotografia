import Link from "next/link"
import { revalidatePath } from "next/cache"
import { Bell, CheckCheck } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/server/services/notification.service"
import { formatDateShort } from "@/lib/utils/currency"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { FilterChips, type FilterChip } from "@/components/shared/filter-chips"
import { cn } from "@/lib/utils/cn"

export const metadata: Metadata = { title: "Notificaciones" }
export const dynamic = "force-dynamic"

async function markOneAction(formData: FormData) {
  "use server"
  await requireStudioAuth()
  const id = formData.get("id") as string
  if (!id) return
  await markNotificationAsRead(id)
  revalidatePath("/notifications")
}

async function markAllAction() {
  "use server"
  const session = await requireStudioAuth()
  await markAllNotificationsAsRead(session.studioId)
  revalidatePath("/notifications")
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams?: { filter?: string }
}) {
  const session = await requireStudioAuth()
  const onlyUnread = searchParams?.filter === "unread"
  const rows = await listNotifications(session.studioId, {
    onlyUnread,
    limit: 100,
  })

  const unreadCount = rows.filter((r) => !r.is_read).length

  const filterChips: FilterChip[] = [
    { key: "unread", label: "Sin leer", count: unreadCount || undefined },
  ]

  return (
    <>
      <AppTopbar
        eyebrow="Actividad del estudio"
        title="Notificaciones"
        description={
          unreadCount > 0
            ? `Tienes ${unreadCount} sin leer — mantente al día con lo que pasa.`
            : "Todas las notificaciones están al día. Buen trabajo."
        }
        unreadNotifications={unreadCount}
      />

      <div className="space-y-5 px-6 py-6 lg:px-8 lg:py-8">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterChips
            baseHref="/notifications"
            paramName="filter"
            current={onlyUnread ? "unread" : null}
            chips={filterChips}
            allLabel="Todas"
          />

          {unreadCount > 0 && (
            <form action={markAllAction}>
              <Button
                type="submit"
                size="sm"
                variant="outline"
                leftIcon={<CheckCheck className="h-3.5 w-3.5" />}
              >
                Marcar todas como leídas
              </Button>
            </form>
          )}
        </div>

        {/* Lista */}
        {rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card shadow-xs">
            <EmptyState
              icon={<Bell className="h-5 w-5" />}
              title={
                onlyUnread
                  ? "Sin notificaciones sin leer"
                  : "Sin notificaciones todavía"
              }
              description={
                onlyUnread
                  ? "Cuando haya algo nuevo aparecerá aquí."
                  : "Cuando haya actividad en tu estudio aparecerá aquí."
              }
              accent={!onlyUnread}
            />
          </div>
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card shadow-xs">
            {rows.map((n) => (
              <li
                key={n.id}
                className={cn(
                  "relative flex items-start gap-3 px-5 py-4 transition-colors",
                  !n.is_read && "bg-brand-soft/40",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-2 h-2 w-2 flex-shrink-0 rounded-full",
                    n.is_read
                      ? "bg-muted-foreground/30"
                      : "bg-brand shadow-glow",
                  )}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      {n.action_url ? (
                        <Link
                          href={n.action_url}
                          className="font-semibold text-foreground transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                        >
                          {n.title}
                        </Link>
                      ) : (
                        <p className="font-semibold text-foreground">
                          {n.title}
                        </p>
                      )}
                      {n.body && (
                        <p className="mt-0.5 text-body-sm text-muted-foreground">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-1.5 flex items-center gap-1.5 text-caption text-muted-foreground">
                        <span className="tabular-nums">
                          {formatDateShort(new Date(n.created_at))}
                        </span>
                        <span aria-hidden="true">·</span>
                        <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">
                          {n.type}
                        </code>
                      </p>
                    </div>

                    {!n.is_read && (
                      <form action={markOneAction}>
                        <input type="hidden" name="id" value={n.id} />
                        <button
                          type="submit"
                          className="whitespace-nowrap text-caption font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 rounded px-1"
                        >
                          Marcar leída
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
