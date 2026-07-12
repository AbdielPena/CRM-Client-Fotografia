import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  getGalleryById,
  getGalleryAssets,
  getAssetThumbUrl,
} from "@/server/services/gallery.service"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { parseBookPages } from "@/lib/book/layouts"
import { getBookTemplates } from "@/server/services/book-template.service"
import { BookDesigner } from "@/components/galleries/book-designer"

export const metadata: Metadata = { title: "Diseñador de álbum" }
export const dynamic = "force-dynamic"

export default async function BookDesignerPage({ params }: { params: { id: string } }) {
  const session = await requireStudioAuth()
  const galleryId = params.id

  const [gallery, assets] = await Promise.all([
    getGalleryById(session.studioId, galleryId),
    getGalleryAssets(session.studioId, galleryId),
  ])
  if (!gallery) notFound()

  // Fotos disponibles para el álbum = las de ENTREGA (delivery_track); si no hay
  // ninguna todavía, cae a todas las completadas (mismo criterio que el libro).
  const hydrated = assets.map((a) => ({
    id: a.id,
    thumbUrl: getAssetThumbUrl(a.thumb_key),
    status: a.status,
    deliveryTrack: (a as unknown as { delivery_track: string | null }).delivery_track ?? null,
    originalName: (a as unknown as { original_name?: string | null }).original_name ?? "",
  }))
  // Banco de fotos en ORDEN DE CREACIÓN (nombre de captura: APX07717 → APX07718…),
  // para que el auto-llenado y el botón "Ordenar por creación" queden cronológicos.
  const byCreation = (
    x: { originalName: string },
    y: { originalName: string },
  ) =>
    x.originalName.localeCompare(y.originalName, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  const deliveryPhotos = hydrated.filter((a) => a.deliveryTrack).sort(byCreation)
  const pool = (
    deliveryPhotos.length
      ? deliveryPhotos
      : hydrated.filter((a) => a.status === "completed").sort(byCreation)
  ).map((a) => ({ id: a.id, thumbUrl: a.thumbUrl }))

  const bookSettings =
    ((gallery as unknown as { book_settings?: Record<string, unknown> }).book_settings ?? {}) as Record<
      string,
      unknown
    >
  const initialPages = parseBookPages(bookSettings.pages)

  // Token público activo para "Ver el libro".
  const supabase = createSupabaseServerClient()
  const { data: tokens } = await supabase
    .from("gallery_share_tokens")
    .select("token")
    .eq("gallery_id", galleryId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
  const publicToken = (tokens ?? [])[0]?.token ?? null

  // Portada (imagen + logo del estudio) para la vista previa del editor.
  const coverImg =
    ((gallery as unknown as { book_cover_image?: string | null }).book_cover_image ?? null) ||
    pool[0]?.thumbUrl ||
    null
  const { data: studioRow } = await supabase
    .from("studios")
    .select("logo_url")
    .eq("id", session.studioId)
    .maybeSingle()
  const logoUrl = (studioRow as { logo_url: string | null } | null)?.logo_url ?? null

  const templates = await getBookTemplates(session.studioId)

  return (
    <BookDesigner
      galleryId={galleryId}
      assets={pool}
      initialPages={initialPages}
      initialSettings={bookSettings}
      publicToken={publicToken}
      coverImg={coverImg}
      logoUrl={logoUrl}
      templates={templates}
    />
  )
}
