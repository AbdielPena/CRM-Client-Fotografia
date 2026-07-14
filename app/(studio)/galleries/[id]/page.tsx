import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Send, Sparkles } from "lucide-react"
import type { Metadata } from "next"

import { requireStudioAuth } from "@/server/middleware/auth"
import { countUnreadNotifications } from "@/server/services/notification.service"
import {
  getAssetThumbUrl,
  getAssetWebUrl,
  getFavoriteSelections,
  getGalleryActivity,
  getGalleryAssets,
  getGalleryById,
  getGalleryComments,
  getRootGallery,
} from "@/server/services/gallery.service"
import { getCollectionsByGallery } from "@/server/services/gallery-collection.service"
import { getSetsByGallery } from "@/server/services/gallery-set.service"
import { getPinsByGallery } from "@/server/services/gallery-download-pin.service"
import { getGallerySelectionQuota } from "@/server/services/selection-quota.service"
import { getGalleryPrintAdminView } from "@/server/services/print-selection.service"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { createSupabaseServiceClient } from "@/server/supabase/service"

import { AppTopbar } from "@/components/layout/app-topbar"
import { GalleryDetailTabs } from "@/components/galleries/gallery-detail-tabs"
import { GalleryDeleteButton } from "@/components/galleries/gallery-delete-button"
import { GalleryDeliveryDateCard } from "@/components/galleries/gallery-delivery-date-card"
import { GalleryLinkSessionCard } from "@/components/galleries/gallery-link-session-card"
import { GalleryExtrasInvoiceButton } from "@/components/galleries/gallery-extras-invoice-button"
import { PrintProductionPanel } from "@/components/galleries/print-production-panel"
import { DriveBackupPanel } from "@/components/galleries/drive-backup-panel"
import { LuxuryBookPanel } from "@/components/galleries/luxury-book-panel"
import { MotherDedicationCard } from "@/components/galleries/mother-dedication-card"
import { getGoogleDriveStatus } from "@/server/services/gallery-drive.service"
import { getDriveBackupStatusAction } from "@/server/actions/gallery-drive.actions"
import {
  getSelectionWaTemplate,
  getDeliveryWaTemplate,
  getPrintWaTemplate,
  getPrintsReadyWaTemplate,
} from "@/server/services/share-message.service"
import {
  getReselectionForGallery,
  getSelectionRoundsForGallery,
  countSelectedAssets,
} from "@/server/services/reselection.service"

export const metadata: Metadata = { title: "Detalle de galería" }

export default async function GalleryDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireStudioAuth()
  const galleryId = params.id

  const [gallery, assets, collections, sets, pins, activity, unread, favoriteSelections] =
    await Promise.all([
      getGalleryById(session.studioId, galleryId),
      getGalleryAssets(session.studioId, galleryId),
      getCollectionsByGallery(session.studioId, galleryId),
      getSetsByGallery(session.studioId, galleryId),
      getPinsByGallery(session.studioId, galleryId),
      getGalleryActivity(session.studioId, galleryId),
      countUnreadNotifications(session.studioId),
      getFavoriteSelections(galleryId),
    ])

  if (!gallery) notFound()

  // Resolve cliente (si tiene)
  let clientLabel: string | null = null
  let clientEmail: string | null = null
  let clientName: string | null = null
  let clientPhone: string | null = null
  if (gallery.client_id) {
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from("clients")
      .select("name, email, phone")
      .eq("id", gallery.client_id)
      .maybeSingle()
    if (data) {
      const c = data as { name: string; email: string | null; phone: string | null }
      clientEmail = c.email
      clientName = c.name
      clientPhone = c.phone
      clientLabel = c.email ? `${c.name} · ${c.email}` : c.name
    }
  }

  // Sesiones disponibles para vincular (solo si la galería está huérfana, sin cliente).
  let linkableSessions: { projectId: string; label: string }[] = []
  if (!gallery.client_id) {
    const sbLink = createSupabaseServerClient()
    const { data: projs } = await sbLink
      .from("projects")
      .select("id, name, client:clients(name)")
      .eq("studio_id", session.studioId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(300)
    linkableSessions = (
      (projs ?? []) as Array<{
        id: string
        name: string | null
        client: { name: string } | { name: string }[] | null
      }>
    ).map((p) => {
      const cName = Array.isArray(p.client) ? p.client[0]?.name : p.client?.name
      return {
        projectId: p.id,
        label: cName ? `${cName} — ${p.name ?? "Sesión"}` : p.name ?? "Sesión",
      }
    })
  }

  // Extras facturables: solo si se envió la selección y excede la cuota del plan.
  let extrasQuota: { extras: number; extraTotal: number; currency: string } | null = null
  if (gallery.selection_submitted && gallery.client_id && gallery.project_id) {
    const q = await getGallerySelectionQuota(galleryId, clientEmail ?? undefined)
    if (q.extras > 0 && q.extraUnitPrice > 0) {
      extrasQuota = { extras: q.extras, extraTotal: q.extraTotal, currency: q.currency }
    }
  }

  // Public share token (si existe alguno activo). PREFERIMOS el token de galería
  // COMPLETA: el token de solo-selección (view_mode='selection', para el flujo de
  // favoritos) NO debe ser el link principal del detalle aunque sea el más
  // reciente — si lo fuera, "Ver pública" y el panel de ENTREGA mostrarían la
  // selección sin editar en vez de las fotos finales. Traemos varios y elegimos.
  const supabase = createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tokens } = await (supabase as any)
    .from("gallery_share_tokens")
    .select("token, expires_at, view_count, view_mode")
    .eq("gallery_id", galleryId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(20)
  const tokenList = (tokens ?? []) as Array<{
    token: string
    expires_at: string | null
    view_count: number
    view_mode: string | null
  }>
  const activeToken =
    tokenList.find((t) => t.view_mode !== "selection") ?? tokenList[0]

  // Link de la carpeta de Google Drive (respaldo de entrega) para compartir.
  // gallery_drive_backups no está en los tipos generados → cast a any.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: driveRow } = await (supabase as any)
    .from("gallery_drive_backups")
    .select("web_view_link")
    .eq("gallery_id", galleryId)
    .not("web_view_link", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const driveLink =
    (driveRow as { web_view_link: string | null } | null)?.web_view_link ?? null

  // Mensajes de WhatsApp (fuente única, editables en Ajustes → WhatsApp):
  // selección + entrega final (esta con {{link_web}} y {{link_drive}}).
  const [waSelectionTemplate, waDeliveryTemplate, waPrintTemplate, waPrintsReadyTemplate] =
    await Promise.all([
      getSelectionWaTemplate(session.studioId),
      getDeliveryWaTemplate(session.studioId),
      getPrintWaTemplate(session.studioId),
      getPrintsReadyWaTemplate(session.studioId),
    ])

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
    delivery_track:
      (a as unknown as { delivery_track: "social" | "high_quality" | null })
        .delivery_track ?? null,
    is_private: (a as unknown as { is_private: boolean }).is_private ?? false,
    thumbUrl: getAssetThumbUrl(a.thumb_key),
    webUrl: getAssetWebUrl(a.web_key),
  }))

  // Imagen de portada para el editor de apariencia (foco). Prioridad:
  //  1) asset elegido como portada (cover_asset_id)
  //  2) portada externa subida (cover_config.imageUrl)
  //  3) primera foto completada como respaldo
  // (Antes ignoraba la portada externa → al subir una, el editor mostraba otra foto.)
  const externalCover =
    typeof (gallery.cover_config as Record<string, unknown> | null)?.["imageUrl"] === "string"
      ? ((gallery.cover_config as Record<string, unknown>)["imageUrl"] as string)
      : null
  const coverById = assetsWithUrls.find((a) => a.id === gallery.cover_asset_id)
  const fallbackAsset =
    assetsWithUrls.find((a) => a.status === "completed") ?? assetsWithUrls[0]
  const coverImageUrl =
    coverById?.webUrl ??
    coverById?.thumbUrl ??
    externalCover ??
    fallbackAsset?.webUrl ??
    fallbackAsset?.thumbUrl ??
    null

  // Selecciones por favoritos (flujo "Avisar al fotógrafo") con marca de enviada.
  const submittedBy =
    (gallery as unknown as { selection_submitted_by?: string | null })
      .selection_submitted_by ?? null
  const submittedAt =
    (gallery as unknown as { selection_submitted_at?: string | null })
      .selection_submitted_at ?? null
  const favSelections = favoriteSelections.map((f) => ({
    clientEmail: f.clientEmail,
    assetIds: f.assetIds,
    submitted: !!submittedBy && f.clientEmail === submittedBy,
    submittedAt: submittedBy && f.clientEmail === submittedBy ? submittedAt : null,
  }))

  // Segunda selección (re-selección): fotos que el cliente ya eligió, para que
  // afine y baje al número del plan. Cuenta ♥ generales + ítems de sus listas
  // (misma fuente que la creación) — antes solo contaba ♥ y daba 0 cuando el
  // cliente armó una lista, dejando el botón deshabilitado.
  const favoritesCount = await countSelectedAssets(galleryId)
  // Galería de la SESIÓN (raíz). Si esta es una ronda de selección hija, la
  // entrega final NO se hace aquí sino en la galería de la sesión (atada al
  // cliente). `sessionGallery` != null solo cuando esta galería es una hija.
  const rootGallery = await getRootGallery(session.studioId, galleryId)
  const sessionGallery =
    rootGallery && rootGallery.id !== galleryId ? rootGallery : null

  // Enlace de navegación entre los MÓDULOS SEPARADOS (SOLO LECTURA — no modifica
  // ningún dato). Desde una SELECCIÓN: la galería de ENTREGA que la referencia
  // (source_gallery_id). Desde una ENTREGA: su galería de SELECCIÓN de origen.
  // Alimenta el botón "Ir a la galería de entrega/selección".
  let linkedDelivery: { id: string; name: string } | null = null
  let linkedSelection: { id: string; name: string } | null = null
  {
    const sbLink = createSupabaseServiceClient()
    if (gallery.gallery_type === "final_delivery") {
      const srcId =
        (gallery as unknown as { source_gallery_id?: string | null }).source_gallery_id ?? null
      if (srcId) {
        const { data } = await sbLink
          .from("galleries")
          .select("id, name")
          .eq("id", srcId)
          .eq("studio_id", session.studioId)
          .is("deleted_at", null)
          .maybeSingle()
        if (data) linkedSelection = data as { id: string; name: string }
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sbLink as any)
        .from("galleries")
        .select("id, name")
        .eq("studio_id", session.studioId)
        .eq("source_gallery_id", galleryId)
        .eq("gallery_type", "final_delivery")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data) linkedDelivery = data as { id: string; name: string }
    }
  }
  const reselection = await getReselectionForGallery(session.studioId, galleryId)
  // Todas las rondas de re-selección (2da, 3ra…) con sus fotos, para mostrarlas
  // como listas separadas en la pestaña Selecciones (todo en un solo lugar).
  const selectionRounds = await getSelectionRoundsForGallery(session.studioId, galleryId).catch(
    () => [],
  )
  // Comentarios del cliente por foto (galería de selección) + miniatura de cada foto.
  const galleryComments = await getGalleryComments(galleryId).catch(() => [])
  const thumbByAssetId = new Map(assetsWithUrls.map((a) => [a.id, a.thumbUrl]))
  const assetComments = galleryComments.map((c) => ({
    ...c,
    thumbUrl: thumbByAssetId.get(c.assetId) ?? null,
  }))

  // Estado de selección de impresión + miniaturas (para el panel de producción).
  const printView = await getGalleryPrintAdminView(galleryId)

  // Entrega a Google Drive (si la galería tiene assets de entrega o delivery_ready_at).
  const hasDeliveryAssets = assetsWithUrls.some(
    (a) => a.delivery_track === "social" || a.delivery_track === "high_quality",
  )
  // Fotos de la entrega final — para elegir la portada del álbum desde ahí
  // (sin subir una imagen aparte). Se pasan al LuxuryBookPanel.
  const deliveryPhotosForBook = assetsWithUrls
    .filter((a) => a.delivery_track === "social" || a.delivery_track === "high_quality")
    .map((a) => ({ id: a.id, thumbUrl: a.thumbUrl, webUrl: a.webUrl }))
  const deliveryReadyAt = (gallery as unknown as { delivery_ready_at?: string | null }).delivery_ready_at ?? null
  const showDeliveryPanels = hasDeliveryAssets || !!deliveryReadyAt
  // "Entrega habilitada" = ya existen las carpetas de entrega (Máxima Calidad /
  // Redes) aunque todavía no se hayan subido fotos. Con esto, el Álbum Experience
  // y la dedicatoria de la madre se pueden PREPARAR apenas se habilita la entrega,
  // sin esperar a subir las fotos (antes solo salían con fotos ya subidas).
  const DELIVERY_SET_RE = /redes|social|instagram|facebook|web|maxima|calidad|alta|original|print/i
  const hasDeliverySets = (sets as Array<{ name?: string | null }>).some((s) =>
    DELIVERY_SET_RE.test(
      (s.name ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, ""),
    ),
  )
  const deliveryEnabled = showDeliveryPanels || hasDeliverySets
  const driveStatus = showDeliveryPanels ? await getGoogleDriveStatus(session.studioId) : null
  const driveBackup = showDeliveryPanels ? await getDriveBackupStatusAction(galleryId) : null

  // Toda la parte de ENTREGA vive en la pestaña "Entrega" del navbar (más
  // organizada): Fecha de entrega + Google Drive + Luxury Book. La producción de
  // IMPRESIÓN tiene su propia pestaña "Impresiones" (ver printsSlot abajo).
  // "Validar entrega" se antepone dentro de la pestaña (en GalleryDetailTabs).
  const deliverySlot = (
    <>
      <GalleryDeliveryDateCard
        galleryId={gallery.id}
        initialDate={
          (gallery as unknown as { delivery_date?: string | null }).delivery_date ?? null
        }
        hasProject={!!gallery.project_id}
      />
      {showDeliveryPanels && driveStatus && (
        <DriveBackupPanel
          galleryId={galleryId}
          connected={driveStatus.connected}
          needsReconnect={driveStatus.needsReconnect}
          driveEmail={driveStatus.email}
          initialStatus={driveBackup}
        />
      )}
      {deliveryEnabled && (
        <LuxuryBookPanel
          galleryId={galleryId}
          publicToken={activeToken?.token ?? null}
          deliveryPhotos={deliveryPhotosForBook}
          initial={{
            enabled:
              (gallery as unknown as { book_enabled?: boolean }).book_enabled ?? false,
            displayMode: ((gallery as unknown as { book_display_mode?: string })
              .book_display_mode ?? "classic") as "classic" | "book" | "both",
            templateId:
              (gallery as unknown as { book_template_id?: string | null })
                .book_template_id ?? null,
            coverImage:
              (gallery as unknown as { book_cover_image?: string | null })
                .book_cover_image ?? null,
            settings:
              ((gallery as unknown as { book_settings?: Record<string, unknown> })
                .book_settings ?? {}) as {
                title?: string
                subtitle?: string
                quinceaneraName?: string
                eventDate?: string
                accent?: string
                showLogo?: boolean
              },
          }}
        />
      )}
      {/* Mensaje / dedicatoria de la madre — junto a la entrega (aparece apenas se
          habilita, para prepararlo; también editable por la mamá vía su link). */}
      {deliveryEnabled && (
        <MotherDedicationCard
          galleryId={gallery.id}
          publicToken={activeToken?.token ?? null}
          initialMessage={
            (gallery as unknown as { mother_message?: string | null }).mother_message ?? ""
          }
          initialFrom={
            (gallery as unknown as { mother_message_from?: string | null })
              .mother_message_from ?? ""
          }
          initialEnabled={
            (gallery as unknown as { mother_message_enabled?: boolean })
              .mother_message_enabled ?? false
          }
        />
      )}
    </>
  )

  // IMPRESIONES: pestaña propia en el navbar de la galería (solo si el plan tiene
  // impresos y hay algo que producir). Antes colgaba al final de "Entrega".
  // Solo ENTREGA FINAL: las impresiones se eligen de las fotos entregadas.
  // `state.enabled` ya exige entrega; no mostrar en galerías de selección.
  const printRelevant =
    !!printView &&
    (printView.state.enabled ||
      printView.state.categories.some((c) => c.used > 0))
  const printsSlot = printRelevant ? (
    <PrintProductionPanel
      view={printView}
      title="Producción de impresión del cliente"
      waPrintTemplate={waPrintTemplate}
      printsReadyTemplate={waPrintsReadyTemplate}
    />
  ) : null

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
            <GalleryDeleteButton
              galleryId={gallery.id}
              galleryName={gallery.name}
              assetCount={gallery.asset_count}
              selectionSubmitted={gallery.selection_submitted ?? false}
              selectionSubmittedBy={
                (gallery as unknown as { selection_submitted_by?: string | null })
                  .selection_submitted_by ?? null
              }
              clientLabel={clientLabel}
            />
          </div>
        </div>
      </div>

      {!gallery.client_id && (
        <div className="px-6 lg:px-8">
          <GalleryLinkSessionCard galleryId={gallery.id} sessions={linkableSessions} />
        </div>
      )}

      <GalleryDetailTabs
        deliverySlot={deliverySlot}
        printsSlot={printsSlot}
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
          selection_locked:
            (gallery as unknown as { selection_locked?: boolean }).selection_locked ?? false,
          gallery_type: gallery.gallery_type ?? "selection",
          delivery_ready_at:
            (gallery as unknown as { delivery_ready_at: string | null }).delivery_ready_at ?? null,
          template_id: gallery.template_id ?? "classic_proofing",
          theme: gallery.theme ?? {},
          cover_config: gallery.cover_config ?? {},
          subtitle: gallery.subtitle ?? null,
          welcome_text: gallery.welcome_text ?? null,
          book_enabled:
            (gallery as unknown as { book_enabled?: boolean }).book_enabled ?? false,
          book_display_mode:
            (gallery as unknown as { book_display_mode?: string }).book_display_mode ??
            "classic",
        }}
        assets={assetsWithUrls}
        sets={sets}
        collections={collections}
        favoriteSelections={favSelections}
        pins={pins}
        studioId={session.studioId}
        publicToken={activeToken?.token ?? null}
        activity={activity}
        coverImageUrl={coverImageUrl}
        client={
          gallery.client_id
            ? { name: clientName, email: clientEmail, phone: clientPhone }
            : null
        }
        driveLink={driveLink}
        waSelectionTemplate={waSelectionTemplate}
        waDeliveryTemplate={waDeliveryTemplate}
        favoritesCount={favoritesCount}
        reselection={reselection}
        reselectionRounds={selectionRounds}
        sessionGallery={sessionGallery}
        linkedDelivery={linkedDelivery}
        linkedSelection={linkedSelection}
        assetComments={assetComments}
        finalSelectionGalleryId={
          (gallery as unknown as { final_selection_gallery_id?: string | null })
            .final_selection_gallery_id ?? null
        }
        motherMessage={
          (gallery as unknown as { mother_message: string | null }).mother_message ?? null
        }
        motherMessageFrom={
          (gallery as unknown as { mother_message_from: string | null })
            .mother_message_from ?? null
        }
        motherMessageEnabled={
          (gallery as unknown as { mother_message_enabled?: boolean })
            .mother_message_enabled ?? false
        }
      />
    </>
  )
}
