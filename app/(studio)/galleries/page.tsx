import Link from "next/link"
import { ImageIcon, Plus, Lock, Globe, KeyRound, Calendar } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import { getGalleries, getAssetThumbUrl } from "@/server/services/gallery.service"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { cn } from "@/lib/utils/cn"

export const metadata: Metadata = { title: "Galerías" }

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft: {
    label: "Borrador",
    cls: "bg-muted text-muted-foreground",
  },
  published: {
    label: "Publicada",
    cls: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  archived: {
    label: "Archivada",
    cls: "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
  },
  expired: {
    label: "Vencida",
    cls: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  },
}

const VISIBILITY_ICON: Record<string, { Icon: typeof Lock; label: string }> = {
  private: { Icon: Lock, label: "Privada" },
  public: { Icon: Globe, label: "Pública" },
  password: { Icon: KeyRound, label: "Con contraseña" },
}

type GalleryListRow = {
  id: string
  name: string
  slug: string
  status: "draft" | "published" | "archived" | "expired"
  visibility: "private" | "public" | "password"
  asset_count: number
  cover_asset_id: string | null
  event_date: string | null
  selection_submitted: boolean
  created_at: string
}

export default async function GalleriesPage() {
  const session = await requireStudioAuth()
  const [{ rows, total }, unread] = await Promise.all([
    getGalleries(session.studioId, { limit: 100 }),
    countUnreadNotifications(session.studioId),
  ])

  // Cargar covers thumb urls — query corta a gallery_assets para los cover_asset_id
  const coverAssetIds = rows
    .map((r) => r.cover_asset_id)
    .filter((x): x is string => Boolean(x))

  let coversById = new Map<string, string>()
  if (coverAssetIds.length > 0) {
    const { createSupabaseServiceClient } = await import("@/server/supabase/service")
    const sb = createSupabaseServiceClient()
    const { data: covers } = await sb
      .from("gallery_assets")
      .select("id, thumb_key")
      .in("id", coverAssetIds)
    for (const a of (covers ?? []) as Array<{ id: string; thumb_key: string | null }>) {
      const url = getAssetThumbUrl(a.thumb_key)
      if (url) coversById.set(a.id, url)
    }
  }

  return (
    <>
      <AppTopbar
        title="Galerías"
        description={`${total} galería${total === 1 ? "" : "s"} en total`}
        unreadNotifications={unread}
        actions={
          <Button asChild size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />}>
            <Link href="/galleries/new">Nueva galería</Link>
          </Button>
        }
      />

      <div className="px-6 py-6 lg:px-8 lg:py-8">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card">
            <EmptyState
              icon={<ImageIcon className="h-5 w-5" />}
              title="Aún no tienes galerías"
              description="Crea tu primera galería para entregar fotos a tus clientes con cover, favoritos y descargas."
              accent
            >
              <Button asChild size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />}>
                <Link href="/galleries/new">Nueva galería</Link>
              </Button>
            </EmptyState>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(rows as unknown as GalleryListRow[]).map((g) => {
              const status = STATUS_LABELS[g.status] ?? STATUS_LABELS.draft!
              const vis = VISIBILITY_ICON[g.visibility] ?? VISIBILITY_ICON.private!
              const VisIcon = vis.Icon
              const cover = g.cover_asset_id ? coversById.get(g.cover_asset_id) : null

              return (
                <Link
                  key={g.id}
                  href={`/galleries/${g.id}`}
                  className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors duration-fast hover:border-border-strong"
                >
                  {/* Cover */}
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover}
                        alt={g.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                        <ImageIcon className="h-10 w-10" />
                      </div>
                    )}
                    <span
                      className={cn(
                        "absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                        status.cls,
                      )}
                    >
                      {status.label}
                    </span>
                    {g.selection_submitted && (
                      <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10.5px] font-semibold text-brand-foreground">
                        Selección recibida
                      </span>
                    )}
                  </div>

                  {/* Body */}
                  <div className="flex-1 space-y-2 p-4">
                    <h3 className="truncate text-[14px] font-semibold text-foreground">
                      {g.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <ImageIcon className="h-3 w-3" />
                        {g.asset_count} foto{g.asset_count === 1 ? "" : "s"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <VisIcon className="h-3 w-3" />
                        {vis.label}
                      </span>
                      {g.event_date && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(g.event_date).toLocaleDateString("es-DO", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
