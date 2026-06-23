import { cookies } from "next/headers"
import Link from "next/link"
import { ImageIcon, ExternalLink, Printer, Check } from "lucide-react"

import {
  PORTAL_COOKIE_NAME,
  parsePortalCookieValue,
} from "@/server/services/client-portal.service"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { getAssetThumbUrl } from "@/server/services/gallery.service"
import {
  getGalleryPrintState,
  type GalleryPrintState,
} from "@/server/services/print-selection.service"
import { formatDateShort } from "@/lib/utils/currency"
import { PortalHeader, PortalEmpty } from "@/components/portal/portal-ui"

export const dynamic = "force-dynamic"

export default async function PortalGalleriesPage() {
  const session = parsePortalCookieValue(cookies().get(PORTAL_COOKIE_NAME)?.value)
  if (!session) return null

  const supabase = createSupabaseServiceClient()

  const { data: galleriesRaw } = await supabase
    .from("galleries")
    .select(
      "id, name, status, asset_count, cover_asset_id, created_at, expires_at, gallery_type, delivery_ready_at",
    )
    .eq("client_id", session.clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const galleries = (galleriesRaw ?? []) as any[]

  const coverIds = galleries
    .map((g) => g.cover_asset_id as string | null)
    .filter(Boolean) as string[]
  const thumbs: Record<string, string | null> = {}
  if (coverIds.length > 0) {
    const { data } = await supabase
      .from("gallery_assets")
      .select("id, thumb_key")
      .in("id", coverIds)
    for (const r of (data ?? []) as Array<{ id: string; thumb_key: string | null }>) {
      thumbs[r.id] = getAssetThumbUrl(r.thumb_key)
    }
  }

  const galleryIds = galleries.map((g) => g.id as string)
  const { data: tokensRaw } =
    galleryIds.length > 0
      ? await supabase
          .from("gallery_share_tokens")
          .select("gallery_id, token, revoked_at, expires_at")
          .in("gallery_id", galleryIds)
      : { data: [] }
  const tokenByGallery: Record<string, string | null> = {}
  for (const t of (tokensRaw ?? []) as Array<{
    gallery_id: string
    token: string
    revoked_at: string | null
    expires_at: string | null
  }>) {
    if (t.revoked_at) continue
    if (t.expires_at && new Date(t.expires_at).getTime() < Date.now()) continue
    if (!tokenByGallery[t.gallery_id]) tokenByGallery[t.gallery_id] = t.token
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderCard = (g: any, i: number) => {
    const cover = g.cover_asset_id ? thumbs[g.cover_asset_id] : null
    const token = tokenByGallery[g.id] as string | undefined
    const isExpired =
      g.status === "expired" ||
      (!!g.expires_at && new Date(g.expires_at).getTime() < Date.now())
    const clickable = !!token && !isExpired
    const href = clickable ? `/g/${token}` : "#"
    const ps = printStates[g.id]
    return (
      <Link
        key={g.id}
        href={href}
        target={clickable ? "_blank" : undefined}
        rel={clickable ? "noopener noreferrer" : undefined}
        className="lx-card lx-card-hover group block animate-fade-in-up overflow-hidden p-0"
        style={{ animationDelay: `${Math.min(i * 60, 360)}ms` }}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={g.name}
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground/60">
              <ImageIcon className="h-9 w-9" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          {isExpired && (
            <span className="absolute right-3 top-3 rounded-full bg-red-600/95 px-2.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
              Vencida
            </span>
          )}
        </div>
        <div className="p-5">
          <p className="font-serif text-lg font-semibold text-foreground transition-colors group-hover:text-gold-700">
            {g.name}
          </p>
          <div className="mt-1.5 flex items-center gap-2 text-[12px] text-muted-foreground">
            <span>
              {g.asset_count ?? 0} foto{(g.asset_count ?? 0) === 1 ? "" : "s"}
            </span>
            <span>·</span>
            <span>{formatDateShort(new Date(g.created_at))}</span>
            {clickable && <ExternalLink className="ml-auto h-3.5 w-3.5 text-gold-600" />}
          </div>
          {isExpired ? (
            <p className="mt-2.5 text-[11px] font-medium text-red-600">
              Esta galería venció. Pídele acceso a tu fotógrafo.
            </p>
          ) : g.expires_at ? (
            <p className="mt-2.5 text-[11px] text-muted-foreground">
              Disponible hasta {formatDateShort(new Date(g.expires_at))}
            </p>
          ) : !token ? (
            <p className="mt-2.5 text-[11px] text-amber-600">
              Tu fotógrafo aún no compartió esta galería públicamente.
            </p>
          ) : null}

          {ps?.enabled && (
            <div className="mt-3 rounded-lg border border-gold-200/60 bg-gold-50/50 p-2.5 dark:border-gold-500/20 dark:bg-gold-500/5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-gold-700">
                <Printer className="h-3 w-3" /> Selección de impresión
                {ps.submitted && (
                  <span className="ml-auto inline-flex items-center gap-0.5 text-emerald-600">
                    <Check className="h-3 w-3" /> Enviada
                  </span>
                )}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10.5px] text-muted-foreground">
                {ps.categories.map((c) => (
                  <span key={c.key}>
                    {c.label} {c.used}/{c.allowed}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Link>
    )
  }

  const selection = galleries.filter((g) => !g.delivery_ready_at)
  const delivery = galleries.filter((g) => !!g.delivery_ready_at)

  // Estado de selección de impresión por galería de entrega final (resumen portal).
  const printStates: Record<string, GalleryPrintState | null> = {}
  await Promise.all(
    delivery.map(async (g) => {
      printStates[g.id] = await getGalleryPrintState(g.id as string)
    }),
  )

  return (
    <div className="space-y-10">
      <PortalHeader
        eyebrow="Tus recuerdos"
        title="Tus galerías"
        description="Aquí verás las galerías que tu fotógrafo compartió contigo."
      />

      {galleries.length === 0 ? (
        <PortalEmpty
          icon={ImageIcon}
          title="Aún no tienes galerías"
          description="Cuando tu fotógrafo cree una, aparecerá aquí lista para disfrutar."
        />
      ) : (
        <>
          {delivery.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="h-5 w-1 rounded-full bg-gradient-to-b from-gold-400 to-gold-600" />
                <div>
                  <h2 className="font-serif text-xl font-semibold text-foreground">
                    Entrega final
                  </h2>
                  <p className="text-[13px] text-muted-foreground">
                    Tus fotos editadas, listas para ver y descargar.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {delivery.map(renderCard)}
              </div>
            </section>
          )}

          {selection.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="h-5 w-1 rounded-full bg-gradient-to-b from-gold-400 to-gold-600" />
                <div>
                  <h2 className="font-serif text-xl font-semibold text-foreground">
                    Selección
                  </h2>
                  <p className="text-[13px] text-muted-foreground">
                    Elige tus fotos favoritas y envíalas a tu fotógrafo.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {selection.map(renderCard)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
