import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cookies } from "next/headers"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import {
  trackGalleryView,
  validateGalleryToken,
} from "@/server/services/gallery.service"
import { getPublicBrandingByStudioId } from "@/server/services/studio-branding.service"
import { getGalleryPrintState } from "@/server/services/print-selection.service"
import { GalleryPasswordGate } from "@/components/public/gallery-password-gate"
import { PublicGalleryView } from "@/components/public/public-gallery-view"
import { PublicSelectionView } from "@/components/public/public-selection-view"
import {
  FinalDeliveryBook,
  BookLauncher,
} from "@/components/public/final-delivery-book"

export const dynamic = "force-dynamic"
// Sin esto, Next cachea los GET de Supabase (Data Cache, por URL de la query) y
// la vista pública sirve ajustes viejos de la galería (portada/foco/título…)
// aunque el estudio ya los haya cambiado. force-no-store = siempre datos frescos.
export const fetchCache = "force-no-store"

type PageProps = { params: { token: string } }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const view = await validateGalleryToken(params.token)
  if (!view) {
    return { title: "Galería no disponible", robots: { index: false, follow: false } }
  }
  // OG image: portada externa (cover_config.imageUrl) si existe, si no la
  // resolución web (1600px) — no el thumb de 400px (preview pixelado).
  const externalCover =
    typeof (view.gallery.coverConfig as Record<string, unknown> | undefined)?.["imageUrl"] ===
    "string"
      ? ((view.gallery.coverConfig as Record<string, unknown>)["imageUrl"] as string)
      : null
  const ogImage = externalCover || view.gallery.coverWebUrl || view.gallery.coverThumbUrl
  const branding = await getPublicBrandingByStudioId(view.gallery.studioId)
  return {
    title: view.gallery.name,
    description: view.gallery.description ?? view.gallery.subtitle ?? undefined,
    // Galerías privadas: nunca indexar en buscadores.
    robots: { index: false, follow: false },
    icons: branding?.favicon_url ? { icon: branding.favicon_url } : undefined,
    openGraph: ogImage
      ? { title: view.gallery.name, images: [{ url: ogImage, width: 1600 }] }
      : undefined,
    twitter: ogImage ? { card: "summary_large_image" } : undefined,
  }
}

export default async function PublicGalleryPage({ params }: PageProps) {
  const view = await validateGalleryToken(params.token)
  if (!view) notFound()

  if (view.gallery.visibility === "password") {
    const unlocked = cookies().get(`gallery_unlock_${params.token}`)?.value === "1"
    if (!unlocked) {
      return <GalleryPasswordGate token={params.token} galleryName={view.gallery.name} />
    }
  }

  void trackGalleryView(view.tokenInfo.id)

  const supabase = createSupabaseServiceClient()

  // Studio info para branding
  const { data: studioJoin } = await supabase
    .from("galleries")
    .select(
      "studios(name, logo_url), download_pin_required, selection_submitted, selection_locked",
    )
    .eq("id", view.gallery.id)
    .maybeSingle()
  const studioInfo = (
    studioJoin as {
      studios?: { name?: string; logo_url?: string | null }
      download_pin_required?: boolean
      selection_submitted?: boolean
      selection_locked?: boolean
    } | null
  ) ?? null

  // Branding del estudio (white-label): logo, color, footer.
  const branding = await getPublicBrandingByStudioId(view.gallery.studioId)

  // ── Vista de SOLO selección (token con view_mode='selection') ──
  // Los assets ya vienen filtrados a los favoritos del cliente.
  if (view.viewMode === "selection") {
    return (
      <PublicSelectionView
        token={params.token}
        gallery={{
          name: view.gallery.name,
          subtitle: view.gallery.subtitle,
          eventDate: view.gallery.eventDate,
          accentColor: view.gallery.accentColor,
          coverWebUrl: view.gallery.coverWebUrl,
          allow_download: view.gallery.allow_download,
        }}
        assets={view.assets}
        studio={{
          name: studioInfo?.studios?.name ?? "PixelOS",
          logoUrl: branding?.logo_url ?? studioInfo?.studios?.logo_url ?? null,
          primaryColor: branding?.primary_color ?? null,
          hideBranding: branding?.hide_studioflow_branding ?? false,
          footerHtml: branding?.custom_footer_html ?? null,
        }}
      />
    )
  }

  // ── Entrega final (vive dentro de la misma galería) ──
  const hasDeliveryTracks = view.assets.some(
    (a) => a.deliveryTrack === "social" || a.deliveryTrack === "high_quality",
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: deliveryReadyRow } = await (supabase as any)
    .from("galleries")
    .select("delivery_ready_at")
    .eq("id", view.gallery.id)
    .maybeSingle()
  const deliveryReady = !!(deliveryReadyRow as { delivery_ready_at: string | null } | null)?.delivery_ready_at

  // Google Drive link (si existe backup completado)
  let driveLink: string | null = null
  if (hasDeliveryTracks || deliveryReady) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: driveRow } = await (supabase as any)
      .from("gallery_drive_backups")
      .select("web_view_link")
      .eq("gallery_id", view.gallery.id)
      .not("web_view_link", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    driveLink = (driveRow as { web_view_link: string | null } | null)?.web_view_link ?? null
  }

  // Luxury Book: modo solo-libro reemplaza toda la vista
  if (hasDeliveryTracks && view.gallery.bookEnabled && view.gallery.bookDisplayMode === "book") {
    const deliveryAssets = view.assets.filter(
      (a) => a.deliveryTrack === "social" || a.deliveryTrack === "high_quality",
    )
    return (
      <FinalDeliveryBook
        gallery={{
          name: view.gallery.name,
          accentColor: view.gallery.accentColor,
          coverWebUrl: view.gallery.coverWebUrl,
          bookTemplateId: view.gallery.bookTemplateId,
          bookCoverImage: view.gallery.bookCoverImage,
          bookSettings: view.gallery.bookSettings,
        }}
        assets={deliveryAssets.map((a) => ({
          id: a.id, webUrl: a.webUrl, thumbUrl: a.thumbUrl,
          width: a.width, height: a.height,
        }))}
        studio={{
          name: studioInfo?.studios?.name ?? "PixelOS",
          logoUrl: branding?.logo_url ?? studioInfo?.studios?.logo_url ?? null,
          hideBranding: branding?.hide_studioflow_branding ?? false,
        }}
      />
    )
  }

  const printState = await getGalleryPrintState(view.gallery.id)

  return (
    <>
      <PublicGalleryView
        token={params.token}
        gallery={{
          ...view.gallery,
          download_pin_required: studioInfo?.download_pin_required ?? false,
          selection_submitted: studioInfo?.selection_submitted ?? false,
          selection_locked: studioInfo?.selection_locked ?? false,
        }}
        assets={view.assets}
        studio={{
          name: studioInfo?.studios?.name ?? "PixelOS",
          logoUrl: branding?.logo_url ?? studioInfo?.studios?.logo_url ?? null,
          primaryColor: branding?.primary_color ?? null,
          hideBranding: branding?.hide_studioflow_branding ?? false,
          footerHtml: branding?.custom_footer_html ?? null,
        }}
        printState={printState}
        deliveryReady={deliveryReady}
        finalDeliveryDriveLink={driveLink}
      />
      {hasDeliveryTracks && view.gallery.bookEnabled && view.gallery.bookDisplayMode === "both" && (
        <BookLauncher
          gallery={{
            name: view.gallery.name,
            accentColor: view.gallery.accentColor,
            coverWebUrl: view.gallery.coverWebUrl,
            bookTemplateId: view.gallery.bookTemplateId,
            bookCoverImage: view.gallery.bookCoverImage,
            bookSettings: view.gallery.bookSettings,
          }}
          assets={view.assets
            .filter((a) => a.deliveryTrack === "social" || a.deliveryTrack === "high_quality")
            .map((a) => ({
              id: a.id, webUrl: a.webUrl, thumbUrl: a.thumbUrl,
              width: a.width, height: a.height,
            }))}
          studio={{
            name: studioInfo?.studios?.name ?? "PixelOS",
            logoUrl: branding?.logo_url ?? studioInfo?.studios?.logo_url ?? null,
            hideBranding: branding?.hide_studioflow_branding ?? false,
          }}
        />
      )}
    </>
  )
}
