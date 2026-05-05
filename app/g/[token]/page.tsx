import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cookies } from "next/headers"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import {
  trackGalleryView,
  validateGalleryToken,
} from "@/server/services/gallery.service"
import { GalleryPasswordGate } from "@/components/public/gallery-password-gate"
import { PublicGalleryView } from "@/components/public/public-gallery-view"

export const dynamic = "force-dynamic"

type PageProps = { params: { token: string } }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const view = await validateGalleryToken(params.token)
  if (!view) return { title: "Galería no disponible" }
  return {
    title: view.gallery.name,
    description: view.gallery.description ?? undefined,
    openGraph: view.gallery.coverThumbUrl
      ? { images: [{ url: view.gallery.coverThumbUrl }] }
      : undefined,
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
        logoUrl: studioInfo?.studios?.logo_url ?? null,
      }}
    />
  )
}
