import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Send } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  getAssetThumbUrl,
  getAssetWebUrl,
  getGalleryActivity,
  getGalleryAssets,
  getGalleryById,
} from "@/server/services/gallery.service"
import { getCollectionsByGallery } from "@/server/services/gallery-collection.service"
import { getSetsByGallery } from "@/server/services/gallery-set.service"
import { getPinsByGallery } from "@/server/services/gallery-download-pin.service"
import { getGallerySelectionQuota } from "@/server/services/selection-quota.service"
import { getGalleryPrintState } from "@/server/services/print-selection.service"
import { createSupabaseServerClient } from "@/server/supabase/server"

import { AppTopbar } from "@/components/layout/app-topbar"
import { GalleryDetailTabs } from "@/components/galleries/gallery-detail-tabs"
import { GalleryExtrasInvoiceButton } from "@/components/galleries/gallery-extras-invoice-button"
import { PrintProductionPanel } from "@/components/galleries/print-production-panel"
import { DriveBackupPanel } from "@/components/galleries/drive-backup-panel"
import { getGoogleDriveStatus } from "@/server/services/gallery-drive.service"
import { getDriveBackupStatusAction } from "@/server/actions/gallery-drive.actions"

export const metadata: Metadata = { title: "Detalle de galería" }

export default async function GalleryDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()
  const galleryId = params.id

  const [gallery, assets, collections, sets, pins, activity, unread] = await Promise.all([
    getGalleryById(session.studioId, galleryId),
    getGalleryAssets(session.studioId, galleryId),
    getCollectionsByGallery(session.studioId, galleryId),
    getSetsByGallery(session.studioId, galleryId),
    getPinsByGallery(session.studioId, galleryId),
    getGalleryActivity(session.studioId, galleryId),
    countUnreadNotifications(session.studioId),
  ])

  if (!gallery) notFound()

  // Resolve cliente (si tiene)
  let clientLabel: string | null = null
  let clientEmail: string | null = null
  if (gallery.client_id) {
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from("clients")
      .select("name, email")
      .eq("id", gallery.client_id)
      .maybeSingle()
    if (data) {
      const c = data as { name: string; email: string | null }
      clientEmail = c.email
      clientLabel = c.email ? `${c.name} · ${c.email}` : c.name
    }
  }

  // Extras facturables: solo si se envió la selección y excede la cuota del plan.
  let extrasQuota: { extras: number; extraTotal: number; currency: string } | null = null
  if (gallery.selection_submitted && gallery.client_id && gallery.project_id) {
    const q = await getGallerySelectionQuota(galleryId, clientEmail ?? undefined)
    if (q.extras > 0 && q.extraUnitPrice > 0) {
      extrasQuota = { extras: q.extras, extraTotal: q.extraTotal, currency: q.currency }
    }
  }

  // Public share token (si existe alguno activo)
  const supabase = createSupabaseServerClient()
  const { data: tokens } = await supabase
    .from("gallery_share_tokens")
    .select("token, expires_at, view_count")
    .eq("gallery_id", galleryId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
  const activeToken = (tokens ?? [])[0] as {
    token: string
    expires_at: string | null
    view_count: number
  } | undefined

  // Hidratar assets con thumbUrl + webUrl
  const assetsWithUrls = assets.map((a) => ({
    id: a.id,
    original_name: a.original_name,
    filename: a.filename,
    status: a.status,
    width: a.width,
    height: a.height,
    sort_order: a.sort_order,
    set_id: (a as unknown as { set_id: string | null }).set_id ?? null,
    is_private: (a as unknown as { is_private: boolean }).is_private ?? false,
    thumbUrl: getAssetThumbUrl(a.thumb_key),
    webUrl: getAssetWebUrl(a.web_key),
  }))

  // Estado de selección de impresión (para el panel de producción).
  const printState = await getGalleryPrintState(galleryId)

  // Entrega a Google Drive (solo galerías de entrega final).
  const isFinalDelivery = (gallery.gallery_type ?? "selection") === "final_delivery"
  const driveStatus = isFinalDelivery ? await getGoogleDriveStatus(session.studioId) : null
  const driveBackup = isFinalDelivery ? await getDriveBackupStatusAction(galleryId) : null

  return (
    <>
      <AppTopbar unreadNotifications={unread} />

      <div className="px-6 pt-6 lg:px-8">
        <Link
          href="/galleries"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a galerías
        </Link>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold leading-tight tracking-tight text-foreground truncate">
              {gallery.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
              <span>{gallery.asset_count} fotos</span>
              <span>·</span>
              <span className="capitalize">{gallery.status}</span>
              <span>·</span>
              <span className="capitalize">{gallery.visibility}</span>
              {clientLabel && (
                <>
                  <span>·</span>
                  <span>{clientLabel}</span>
                </>
              )}
              {gallery.selection_submitted && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">
                  <Send className="h-3 w-3" />
                  Selección recibida
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {extrasQuota && (
              <GalleryExtrasInvoiceButton
                galleryId={galleryId}
                extras={extrasQuota.extras}
                extraTotal={extrasQuota.extraTotal}
                currency={extrasQuota.currency}
              />
            )}
            {activeToken && (
              <a
                href={`/g/${activeToken.token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12.5px] font-medium text-foreground transition-colors hover:border-border-strong"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Ver pública
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 lg:px-8">
        <PrintProductionPanel galleryId={galleryId} state={printState} />
        {isFinalDelivery && driveStatus && (
          <DriveBackupPanel
            galleryId={galleryId}
            connected={driveStatus.connected}
            needsReconnect={driveStatus.needsReconnect}
            driveEmail={driveStatus.email}
            initialStatus={driveBackup}
          />
        )}
      </div>

      <GalleryDetailTabs
        gallery={{
          id: gallery.id,
          name: gallery.name,
          slug: gallery.slug,
          description: gallery.description,
          status: gallery.status,
          visibility: gallery.visibility,
          allow_download: gallery.allow_download,
          require_email: gallery.require_email,
          expires_at: gallery.expires_at,
          watermark_enabled:
            (gallery as unknown as { watermark_enabled: boolean }).watermark_enabled ?? false,
          watermark_text:
            (gallery as unknown as { watermark_text: string | null }).watermark_text ?? null,
          watermark_position:
            (gallery as unknown as { watermark_position: string }).watermark_position ?? "bottom-right",
          watermark_opacity: Number(
            (gallery as unknown as { watermark_opacity: number }).watermark_opacity ?? 0.5,
          ),
          download_pin_required:
            (gallery as unknown as { download_pin_required: boolean }).download_pin_required ?? false,
          selection_submitted: gallery.selection_submitted ?? false,
          gallery_type: gallery.gallery_type ?? "selection",
          template_id: gallery.template_id ?? "classic_proofing",
          theme: gallery.theme ?? {},
          cover_config: gallery.cover_config ?? {},
          subtitle: gallery.subtitle ?? null,
          welcome_text: gallery.welcome_text ?? null,
        }}
        assets={assetsWithUrls}
        sets={sets}
        collections={collections}
        pins={pins}
        studioId={session.studioId}
        publicToken={activeToken?.token ?? null}
        activity={activity}
      />
    </>
  )
}
