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
import { FinalDeliveryView } from "@/components/public/final-delivery-view"

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
  // OG image en resolución web (1600px) — no el thumb de 400px (preview pixelado).
  const ogImage = view.gallery.coverWebUrl || view.gallery.coverThumbUrl
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

  // ── Entrega final ──
  // Si la galería es de entrega final O tiene fotos clasificadas en pistas
  // (Máxima Calidad / Redes), el cliente ve la experiencia de entrega:
  // carpetas explicadas, descargas ZIP y link de Google Drive.
  const hasDeliveryTracks = view.assets.some(
    (a) => a.deliveryTrack === "social" || a.deliveryTrack === "high_quality",
  )
  if (view.gallery.galleryType === "final_delivery" || hasDeliveryTracks) {
    // Cast a any: gallery_drive_backups no está en los tipos generados.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: driveRow } = await (supabase as any)
      .from("gallery_drive_backups")
      .select("web_view_link")
      .eq("gallery_id", view.gallery.id)
      .not("web_view_link", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const driveLink =
      (driveRow as { web_view_link: string | null } | null)?.web_view_link ?? null

    // En entrega final solo mostramos las fotos con track asignado (las finales).
    // Una galería de selección reciclada puede tener además las fotos de prueba
    // originales sin track — esas no van en la entrega.
    const deliveryAssets = hasDeliveryTracks
      ? view.assets.filter(
          (a) => a.deliveryTrack === "social" || a.deliveryTrack === "high_quality",
        )
      : view.assets

    return (
      <FinalDeliveryView
        token={params.token}
        gallery={{
          id: view.gallery.id,
          name: view.gallery.name,
          description: view.gallery.description,
          subtitle: view.gallery.subtitle,
          welcomeText: view.gallery.welcomeText,
          eventDate: view.gallery.eventDate,
          accentColor: view.gallery.accentColor,
          coverThumbUrl: view.gallery.coverThumbUrl,
          coverWebUrl: view.gallery.coverWebUrl,
          allow_download: view.gallery.allow_download,
        }}
        assets={deliveryAssets}
        studio={{
          name: studioInfo?.studios?.name ?? "StudioFlow",
          logoUrl: branding?.logo_url ?? studioInfo?.studios?.logo_url ?? null,
          primaryColor: branding?.primary_color ?? null,
          hideBranding: branding?.hide_studioflow_branding ?? false,
          footerHtml: branding?.custom_footer_html ?? null,
        }}
        driveLink={driveLink}
      />
    )
  }

  // Estado de selección de impresión (si el plan la incluye y está habilitada).
  const printState = await getGalleryPrintState(view.gallery.id)

  return (
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
        name: studioInfo?.studios?.name ?? "StudioFlow",
        logoUrl: branding?.logo_url ?? studioInfo?.studios?.logo_url ?? null,
        primaryColor: branding?.primary_color ?? null,
        hideBranding: branding?.hide_studioflow_branding ?? false,
        footerHtml: branding?.custom_footer_html ?? null,
      }}
      printState={printState}
    />
  )
}
