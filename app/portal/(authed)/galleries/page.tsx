import { cookies } from "next/headers"
import Link from "next/link"
import { ImageIcon, ExternalLink } from "lucide-react"

import {
  PORTAL_COOKIE_NAME,
  parsePortalCookieValue,
} from "@/server/services/client-portal.service"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { getAssetThumbUrl } from "@/server/services/gallery.service"
import { formatDateShort } from "@/lib/utils/currency"

export const dynamic = "force-dynamic"

export default async function PortalGalleriesPage() {
  const session = parsePortalCookieValue(cookies().get(PORTAL_COOKIE_NAME)?.value)
  if (!session) return null

  const supabase = createSupabaseServiceClient()

  const { data: galleriesRaw } = await supabase
    .from("galleries")
    .select(
      "id, name, status, asset_count, cover_asset_id, created_at, expires_at, gallery_type",
    )
    .eq("client_id", session.clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const galleries = (galleriesRaw ?? []) as any[]

  // Resolver thumb de portada
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

  // Cargar tokens activos para link público
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
  const renderCard = (g: any) => {
    const cover = g.cover_asset_id ? thumbs[g.cover_asset_id] : null
    const token = tokenByGallery[g.id] as string | undefined
    const isExpired =
      g.status === "expired" ||
      (!!g.expires_at && new Date(g.expires_at).getTime() < Date.now())
    const clickable = !!token && !isExpired
    const href = clickable ? `/g/${token}` : "#"
    return (
      <Link
        key={g.id}
        href={href}
        target={clickable ? "_blank" : undefined}
        rel={clickable ? "noopener noreferrer" : undefined}
        className="group block overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="relative aspect-[4/3] bg-zinc-100 dark:bg-zinc-800">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={g.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-400">
              <ImageIcon className="h-8 w-8" />
            </div>
          )}
          {isExpired && (
            <span className="absolute right-2 top-2 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-semibold text-white">
              Vencida
            </span>
          )}
        </div>
        <div className="p-4">
          <p className="font-semibold text-zinc-900 group-hover:text-rose-600 dark:text-zinc-100">
            {g.name}
          </p>
          <div className="mt-1 flex items-center gap-2 text-[12px] text-zinc-500 dark:text-zinc-400">
            <span>
              {g.asset_count ?? 0} foto{(g.asset_count ?? 0) === 1 ? "" : "s"}
            </span>
            <span>·</span>
            <span>{formatDateShort(new Date(g.created_at))}</span>
            {clickable && <ExternalLink className="ml-auto h-3.5 w-3.5" />}
          </div>
          {isExpired ? (
            <p className="mt-2 text-[11px] font-medium text-rose-600 dark:text-rose-400">
              Esta galería venció. Pedile acceso a tu fotógrafo.
            </p>
          ) : g.expires_at ? (
            <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              Disponible hasta {formatDateShort(new Date(g.expires_at))}
            </p>
          ) : !token ? (
            <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
              Tu fotógrafo aún no compartió esta galería públicamente.
            </p>
          ) : null}
        </div>
      </Link>
    )
  }

  const selection = galleries.filter((g) => g.gallery_type !== "final_delivery")
  const delivery = galleries.filter((g) => g.gallery_type === "final_delivery")

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Tus galerías</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Acá vas a ver las galerías que tu fotógrafo te compartió.
        </p>
      </header>

      {galleries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <ImageIcon className="mx-auto h-8 w-8 text-zinc-400" />
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Aún no tenés galerías. Cuando tu fotógrafo cree una, va a aparecer acá.
          </p>
        </div>
      ) : (
        <>
          {delivery.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  ✨ Entrega final
                </h2>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                  Tus fotos editadas, listas para ver y descargar.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {delivery.map(renderCard)}
              </div>
            </section>
          )}

          {selection.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  📷 Selección
                </h2>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                  Elegí tus fotos favoritas y envíalas a tu fotógrafo.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {selection.map(renderCard)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
