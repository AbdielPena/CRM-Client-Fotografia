import Link from "next/link"
import {
  ImageIcon,
  Plus,
  Lock,
  Globe,
  KeyRound,
  Calendar,
  Cake,
  CheckCircle2,
  CircleDot,
} from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  getGalleries,
  getAssetThumbUrl,
  getAssetWebUrl,
} from "@/server/services/gallery.service"
import {
  deriveDeliveryComputed,
  type DeliveryStatus,
} from "@/server/services/delivery.service"

import { AppTopbar } from "@/components/layout/app-topbar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { GalleryCardMenu } from "@/components/galleries/gallery-card-menu"
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
  book_cover_image: string | null
  event_date: string | null
  selection_submitted: boolean
  created_at: string
  project_id: string | null
  delivery_ready_at: string | null
  delivery_date: string | null
}

// ---- Cumpleaños + prioridad de entrega (regla quinceañera) -----------------
// La entrega está pautada para lo que ocurra PRIMERO entre 2 días ANTES del
// cumpleaños y 3 semanas después de la sesión (nunca antes de la sesión) —
// misma regla que la RPC upsert_project_delivery. Usamos la fila de
// client_deliveries si existe; si no, replicamos el cálculo como fallback.

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr.slice(0, 10) + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function quinceDeadline(birthday: string, session: string | null): string {
  const byBday = addDaysStr(birthday, -2)
  if (!session) return byBday
  const bySession = addDaysStr(session, 21)
  let est = byBday <= bySession ? byBday : bySession
  if (est < session) est = bySession // cumpleaños ya pasado / cae sobre la sesión
  return est
}

type DeliveryBadge = {
  birthday: string | null
  status: DeliveryStatus
  daysUntilDelivery: number | null
  priority: "alta" | "media" | "baja"
  overdue: boolean
}

const CHIP_ROSE =
  "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
const CHIP_AMBER =
  "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"
const CHIP_EMERALD =
  "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
const CHIP_MUTED = "bg-muted text-muted-foreground"

/** Chip de prioridad según los días que quedan hasta la entrega pautada. */
function priorityChip(
  b: DeliveryBadge,
  delivered: boolean,
): { label: string; cls: string } {
  if (delivered) return { label: "Entregada", cls: CHIP_EMERALD }
  const d = b.daysUntilDelivery
  if (b.overdue)
    return {
      label: `Entrega vencida${d !== null ? ` · ${Math.abs(d)}d` : ""}`,
      cls: CHIP_ROSE,
    }
  if (d === 0) return { label: "Entrega HOY", cls: CHIP_ROSE }
  const dias = d !== null ? ` · entrega en ${d}d` : ""
  if (b.priority === "alta") return { label: `Alta${dias}`, cls: CHIP_ROSE }
  if (b.priority === "media") return { label: `Media${dias}`, cls: CHIP_AMBER }
  return { label: `Baja${dias}`, cls: CHIP_MUTED }
}

function fmtDateOnly(d: string): string {
  return new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("es-DO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

export default async function GalleriesPage({
  searchParams,
}: {
  searchParams?: { scope?: string }
}) {
  const session = await requireStudioAuth()
  // Scope: "Activas" (aún sin entrega) vs "Entregadas".
  const scope: "active" | "delivered" =
    searchParams?.scope === "delivered" ? "delivered" : "active"
  const [{ rows }, unread] = await Promise.all([
    getGalleries(session.studioId, { limit: 100 }),
    countUnreadNotifications(session.studioId),
  ])
  const allGalleries = rows as unknown as GalleryListRow[]

  // Portada de cada tarjeta: cover_asset_id explícito → book_cover_image →
  // primer asset de la galería (igual que la vista pública). Resuelve a URL.
  const { createSupabaseServiceClient } = await import("@/server/supabase/service")
  const sb = createSupabaseServiceClient()

  // "Entregada" = la galería ya tiene fotos de ENTREGA subidas (delivery_track)
  // o se marcó la entrega lista (delivery_ready_at). Es la señal real de "ya
  // subí las finales": muchas galerías tienen las finales cargadas pero siguen
  // con gallery_type='selection' y sin delivery_ready_at.
  const deliveredIds = new Set<string>()
  const allIds = allGalleries.map((g) => g.id)
  if (allIds.length > 0) {
    const { data: dRows } = await sb
      .from("gallery_assets")
      .select("gallery_id")
      .in("gallery_id", allIds)
      .in("delivery_track", ["social", "high_quality"])
      .is("deleted_at", null)
    for (const r of (dRows ?? []) as Array<{ gallery_id: string }>) {
      deliveredIds.add(r.gallery_id)
    }
  }
  const isDelivered = (g: GalleryListRow) =>
    deliveredIds.has(g.id) || !!g.delivery_ready_at
  const deliveredCount = allGalleries.filter(isDelivered).length
  const activeCount = allGalleries.length - deliveredCount
  const grandTotal = allGalleries.length
  const galleries = allGalleries.filter((g) =>
    scope === "delivered" ? isDelivered(g) : !isDelivered(g),
  )

  // 1) covers explícitos (cover_asset_id → thumb/web)
  const coverAssetIds = galleries
    .map((g) => g.cover_asset_id)
    .filter((x): x is string => Boolean(x))
  const thumbByAsset = new Map<string, string>()
  if (coverAssetIds.length > 0) {
    const { data: covers } = await sb
      .from("gallery_assets")
      .select("id, thumb_key, web_key")
      .in("id", coverAssetIds)
    for (const a of (covers ?? []) as Array<{
      id: string
      thumb_key: string | null
      web_key: string | null
    }>) {
      const url = getAssetThumbUrl(a.thumb_key) ?? getAssetWebUrl(a.web_key)
      if (url) thumbByAsset.set(a.id, url)
    }
  }

  // 2) portada por galería + recolectar las que necesitan fallback al 1er asset
  const coverByGallery = new Map<string, string>()
  const needFirstAsset: string[] = []
  for (const g of galleries) {
    const explicit = g.cover_asset_id ? thumbByAsset.get(g.cover_asset_id) : null
    if (explicit) {
      coverByGallery.set(g.id, explicit)
      continue
    }
    if (g.book_cover_image) {
      coverByGallery.set(g.id, g.book_cover_image)
      continue
    }
    needFirstAsset.push(g.id)
  }

  // 3) fallback: primer asset (por sort_order) de cada galería sin portada
  if (needFirstAsset.length > 0) {
    const firsts = await Promise.all(
      needFirstAsset.map((gid) =>
        sb
          .from("gallery_assets")
          .select("thumb_key, web_key")
          .eq("gallery_id", gid)
          .is("deleted_at", null)
          .order("sort_order", { ascending: true, nullsFirst: false })
          .limit(1)
          .maybeSingle()
          .then(({ data }) => ({ gid, data })),
      ),
    )
    for (const { gid, data } of firsts) {
      const a = data as { thumb_key: string | null; web_key: string | null } | null
      if (!a) continue
      const url = getAssetThumbUrl(a.thumb_key) ?? getAssetWebUrl(a.web_key)
      if (url) coverByGallery.set(gid, url)
    }
  }

  // 4) Cumpleaños + prioridad de entrega por proyecto (regla 2 días antes).
  //    quinceanera_birthday no está en los tipos generados → cast a any
  //    (mismo patrón que project.service).
  const projectIds = Array.from(
    new Set(
      galleries.map((g) => g.project_id).filter((x): x is string => Boolean(x)),
    ),
  )
  const badgeByProject = new Map<string, DeliveryBadge>()
  if (projectIds.length > 0) {
    const [{ data: projRows }, { data: delRows }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any)
        .from("projects")
        .select("id, quinceanera_birthday, event_date")
        .eq("studio_id", session.studioId)
        .in("id", projectIds)
        .is("deleted_at", null),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any)
        .from("client_deliveries")
        .select("project_id, status, birthday, estimated_delivery_date")
        .eq("studio_id", session.studioId)
        .in("project_id", projectIds)
        .is("deleted_at", null),
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dels = ((delRows ?? []) as any[])
    const delByProject = new Map(dels.map((d) => [d.project_id as string, d]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (projRows ?? []) as any[]) {
      const del = delByProject.get(p.id)
      const birthday: string | null =
        del?.birthday ?? p.quinceanera_birthday ?? null
      const status = (del?.status ?? "pendiente") as DeliveryStatus
      const deadline: string | null =
        del?.estimated_delivery_date ??
        (birthday ? quinceDeadline(birthday, p.event_date ?? null) : null)
      const computed = deriveDeliveryComputed({
        status,
        birthday,
        estimatedDeliveryDate: deadline,
      })
      badgeByProject.set(p.id, {
        birthday,
        status,
        daysUntilDelivery: computed.daysUntilDelivery,
        priority: computed.priority,
        overdue: computed.overdue,
      })
    }
  }

  return (
    <>
      <AppTopbar
        title="Galerías"
        description={`${grandTotal} galería${grandTotal === 1 ? "" : "s"} en total`}
        unreadNotifications={unread}
        actions={
          <Button asChild size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />}>
            <Link href="/galleries/new">Nueva galería</Link>
          </Button>
        }
      />

      <div className="px-6 py-6 lg:px-8 lg:py-8">
        {/* Toggle Activas | Entregadas (las entregadas viven aparte) */}
        {grandTotal > 0 && (
          <div className="mb-5 inline-flex rounded-lg border border-border bg-card p-0.5">
            <Link
              href="/galleries"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                scope === "active"
                  ? "bg-brand text-brand-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <CircleDot className="h-3.5 w-3.5" /> Activas
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10.5px] tabular-nums",
                  scope === "active" ? "bg-brand-foreground/20" : "bg-muted",
                )}
              >
                {activeCount}
              </span>
            </Link>
            <Link
              href="/galleries?scope=delivered"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                scope === "delivered"
                  ? "bg-emerald-500 text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Entregadas
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10.5px] tabular-nums",
                  scope === "delivered" ? "bg-white/25" : "bg-muted",
                )}
              >
                {deliveredCount}
              </span>
            </Link>
          </div>
        )}

        {galleries.length === 0 ? (
          <div className="rounded-xl border border-border bg-card">
            <EmptyState
              icon={
                scope === "delivered" ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <ImageIcon className="h-5 w-5" />
                )
              }
              title={
                scope === "delivered"
                  ? "No hay galerías entregadas todavía"
                  : "Aún no tienes galerías"
              }
              description={
                scope === "delivered"
                  ? 'Cuando marques una entrega final ("Enviar al cliente"), la galería se moverá aquí.'
                  : "Crea tu primera galería para entregar fotos a tus clientes con cover, favoritos y descargas."
              }
              accent
            >
              {scope !== "delivered" && (
                <Button asChild size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />}>
                  <Link href="/galleries/new">Nueva galería</Link>
                </Button>
              )}
            </EmptyState>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {galleries.map((g) => {
              const status = STATUS_LABELS[g.status] ?? STATUS_LABELS.draft!
              const vis = VISIBILITY_ICON[g.visibility] ?? VISIBILITY_ICON.private!
              const VisIcon = vis.Icon
              const cover = coverByGallery.get(g.id) ?? null
              const badge = g.project_id
                ? badgeByProject.get(g.project_id)
                : undefined
              // Entregada = tiene fotos de entrega subidas o entrega marcada lista.
              const delivered = isDelivered(g)
              // El chip de prioridad / cuenta regresiva solo aplica a galerías
              // NO entregadas (las entregadas muestran su badge "Entregada").
              const prio =
                badge?.birthday && !delivered ? priorityChip(badge, false) : null

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
                    {delivered ? (
                      <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10.5px] font-semibold text-white shadow-sm">
                        <CheckCircle2 className="h-3 w-3" /> Entregada
                      </span>
                    ) : g.selection_submitted ? (
                      <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10.5px] font-semibold text-brand-foreground">
                        Selección recibida
                      </span>
                    ) : null}
                  </div>

                  {/* Body */}
                  <div className="flex-1 space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="min-w-0 truncate text-[14px] font-semibold text-foreground">
                        {g.name}
                      </h3>
                      <GalleryCardMenu
                        galleryId={g.id}
                        galleryName={g.name}
                        assetCount={g.asset_count}
                      />
                    </div>
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
                            timeZone: "UTC",
                          })}
                        </span>
                      )}
                    </div>

                    {/* Cumpleaños + prioridad de entrega (pautada 2 días antes) */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {badge?.birthday ? (
                        <>
                          <span className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-2 py-0.5 text-[10.5px] font-semibold text-pink-600 dark:bg-pink-500/15 dark:text-pink-300">
                            <Cake className="h-3 w-3" />
                            {fmtDateOnly(badge.birthday)}
                          </span>
                          {prio && (
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                                prio.cls,
                              )}
                            >
                              {prio.label}
                            </span>
                          )}
                        </>
                      ) : g.delivery_date ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10.5px] font-semibold text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
                          <Calendar className="h-3 w-3" />
                          Entrega {fmtDateOnly(g.delivery_date)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          Sin fecha
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
