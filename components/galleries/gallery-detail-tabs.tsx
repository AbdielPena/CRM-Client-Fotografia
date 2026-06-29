"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import {
  Image as ImageIcon,
  FolderTree,
  Heart,
  KeyRound,
  Droplet,
  Share2,
  Plus,
  Trash2,
  Copy,
  Check,
  X,
  Send,
  Loader2,
  Palette,
  Activity,
  Sparkles,
  MessageCircle,
  ExternalLink,
  ArrowDownAZ,
  CheckCircle2,
  Ban,
} from "lucide-react"
import { toast } from "sonner"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils/cn"
import { renderWaMessage } from "@/lib/share/wa-message"
import { AssetGrid } from "@/components/galleries/asset-grid"
import { AssetUploader, type UploadTarget } from "@/components/galleries/asset-uploader"
import { DeliverToClientButton } from "@/components/galleries/deliver-to-client-modal"
import { ValidateDeliveryTab } from "@/components/galleries/validate-delivery-tab"
import { GalleryAppearanceTab } from "@/components/galleries/gallery-appearance-tab"
import { GalleryActivityTab } from "@/components/galleries/gallery-activity-tab"

import {
  createSetAction,
  deleteSetAction,
  enableFinalDeliveryAction,
} from "@/server/actions/gallery-set.actions"
import {
  createCollectionAction,
  deleteCollectionAction,
} from "@/server/actions/gallery-collection.actions"
import {
  createPinAction,
  deletePinAction,
  revokePinAction,
} from "@/server/actions/gallery-download-pin.actions"
import {
  publishGalleryAction,
  shareGalleryAction,
  updateGalleryAction,
  cancelDeliveryAction,
} from "@/server/actions/gallery.actions"

// ─── Types ──────────────────────────────────────────────────────────────────

type Gallery = {
  id: string
  name: string
  slug: string
  description: string | null
  status: string
  visibility: "private" | "public" | "password"
  allow_download: boolean
  require_email: boolean
  expires_at: string | null
  watermark_enabled: boolean
  watermark_text: string | null
  watermark_position: string
  watermark_opacity: number
  download_pin_required: boolean
  selection_submitted: boolean
  // Galerías 2.0
  gallery_type: "selection" | "final_delivery"
  delivery_ready_at: string | null
  template_id: string
  theme: Record<string, unknown>
  cover_config: Record<string, unknown>
  subtitle: string | null
  welcome_text: string | null
}

type Asset = {
  id: string
  original_name: string
  filename: string
  status: string
  width: number | null
  height: number | null
  sort_order: number
  set_id: string | null
  delivery_track?: "social" | "high_quality" | null
  is_private: boolean
  thumbUrl: string | null
  webUrl: string | null
}

type SetRow = {
  id: string
  name: string
  description: string | null
  asset_count: number
  is_private: boolean
}

type CollectionRow = {
  id: string
  name: string
  description: string | null
  client_email: string | null
  client_name: string | null
  asset_count: number
  is_locked: boolean
  submitted_at: string | null
  created_at: string
}

/** Selección hecha con favoritos ❤️ (flujo "Avisar al fotógrafo"). */
type FavoriteSelectionRow = {
  clientEmail: string
  assetIds: string[]
  submitted: boolean
  submittedAt: string | null
}

type PinRow = {
  id: string
  label: string | null
  pin_last4: string
  resolution: "original" | "web"
  max_downloads: number
  used_count: number
  expires_at: string | null
  revoked_at: string | null
  last_used_at: string | null
  created_at: string
}

type ActivityData = {
  views: number
  lastViewedAt: string | null
  downloads: number
  favoritesTotal: number
  uniqueVisitors: number
  topFavorites: Array<{ assetId: string; count: number; thumbUrl: string | null }>
}

interface Props {
  gallery: Gallery
  assets: Asset[]
  sets: SetRow[]
  collections: CollectionRow[]
  favoriteSelections?: FavoriteSelectionRow[]
  pins: PinRow[]
  studioId: string
  publicToken: string | null
  activity: ActivityData
  coverImageUrl: string | null
  client: { name: string | null; email: string | null; phone: string | null } | null
  driveLink?: string | null
  /** Mensaje de WhatsApp de selección (editable en Ajustes → WhatsApp). */
  waSelectionTemplate?: string
}

// ─── Main ───────────────────────────────────────────────────────────────────

export function GalleryDetailTabs({
  gallery,
  assets,
  sets,
  collections,
  favoriteSelections = [],
  pins,
  studioId,
  publicToken,
  activity,
  coverImageUrl,
  client,
  driveLink = null,
  waSelectionTemplate,
}: Props) {
  const submittedCount = collections.filter((c) => c.is_locked).length
  const hasDelivery = assets.some(
    (a) => a.delivery_track === "social" || a.delivery_track === "high_quality",
  )

  return (
    <div className="px-6 pb-12 pt-6 lg:px-8">
      <Tabs defaultValue="photos">
        <TabsList className="h-9 bg-muted/60">
          <TabsTrigger value="photos" className="gap-1.5">
            <ImageIcon className="h-3.5 w-3.5" /> Fotos
            <span className="ml-1 text-[10px] text-muted-foreground tabular-nums">
              {assets.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="sets" className="gap-1.5">
            <FolderTree className="h-3.5 w-3.5" /> Sets
            <span className="ml-1 text-[10px] text-muted-foreground tabular-nums">
              {sets.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="selections" className="gap-1.5">
            <Heart className="h-3.5 w-3.5" /> Selecciones
            {submittedCount > 0 && (
              <span className="ml-1 rounded-full bg-brand px-1.5 py-0.5 text-[9px] font-bold text-brand-foreground tabular-nums">
                {submittedCount}
              </span>
            )}
          </TabsTrigger>
          {hasDelivery && (
            <TabsTrigger value="validate" className="gap-1.5">
              <Check className="h-3.5 w-3.5" /> Validar entrega
            </TabsTrigger>
          )}
          <TabsTrigger value="pins" className="gap-1.5">
            <KeyRound className="h-3.5 w-3.5" /> PINs
          </TabsTrigger>
          <TabsTrigger value="watermark" className="gap-1.5">
            <Droplet className="h-3.5 w-3.5" /> Marca de agua
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-1.5">
            <Palette className="h-3.5 w-3.5" /> Apariencia
          </TabsTrigger>
          <TabsTrigger value="share" className="gap-1.5">
            <Share2 className="h-3.5 w-3.5" /> Compartir
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" /> Actividad
          </TabsTrigger>
        </TabsList>

        <TabsContent value="photos" className="mt-5">
          <PhotosTab
            gallery={gallery}
            assets={assets}
            sets={sets}
            studioId={studioId}
            client={client}
          />
        </TabsContent>

        <TabsContent value="sets" className="mt-5">
          <SetsTab galleryId={gallery.id} sets={sets} assets={assets} />
        </TabsContent>

        <TabsContent value="selections" className="mt-5">
          <SelectionsTab
            galleryId={gallery.id}
            collections={collections}
            favorites={favoriteSelections}
            assets={assets}
          />
        </TabsContent>

        {hasDelivery && (
          <TabsContent value="validate" className="mt-5">
            <ValidateDeliveryTab
              galleryId={gallery.id}
              assets={assets}
              favorites={favoriteSelections}
              collections={collections}
            />
          </TabsContent>
        )}

        <TabsContent value="pins" className="mt-5">
          <PinsTab galleryId={gallery.id} pins={pins} />
        </TabsContent>

        <TabsContent value="watermark" className="mt-5">
          <WatermarkTab gallery={gallery} />
        </TabsContent>

        <TabsContent value="appearance" className="mt-5">
          <GalleryAppearanceTab
            galleryId={gallery.id}
            galleryType={gallery.gallery_type}
            initial={{
              templateId: gallery.template_id,
              theme: gallery.theme,
              coverConfig: gallery.cover_config,
              subtitle: gallery.subtitle,
              welcomeText: gallery.welcome_text,
              coverImageUrl,
              coverAssetId: (gallery as unknown as { cover_asset_id?: string | null }).cover_asset_id ?? null,
            }}
            assets={assets.filter((a) => a.status === "completed").map((a) => ({
              id: a.id,
              thumbUrl: a.thumbUrl,
              webUrl: a.webUrl,
              original_name: a.original_name,
            }))}
          />
        </TabsContent>

        <TabsContent value="share" className="mt-5">
          <ShareTab
            gallery={gallery}
            publicToken={publicToken}
            driveLink={driveLink}
            client={client}
            hasDeliveryAssets={hasDelivery}
            waSelectionTemplate={waSelectionTemplate}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-5">
          <GalleryActivityTab activity={activity} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Photos tab ─────────────────────────────────────────────────────────────

/** Infiere la pista de entrega a partir del nombre del set. */
function inferDeliveryTrack(name: string): "social" | "high_quality" | null {
  const n = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
  if (/(redes|social|instagram|facebook|web)/.test(n)) return "social"
  if (/(maxima|calidad|alta|original|print)/.test(n)) return "high_quality"
  return null
}

function PhotosTab({
  gallery,
  assets,
  sets,
  studioId,
  client,
}: {
  gallery: Gallery
  assets: Asset[]
  sets: SetRow[]
  studioId: string
  client: { name: string | null; email: string | null; phone: string | null } | null
}) {
  // Si la galería tiene sets cuyo nombre matchea Redes/Máxima Calidad, mostrar
  // selector de target. Vale para entrega final O para galerías de selección que
  // habilitaron entrega final con el botón "+ Habilitar entrega final".
  const deliverySets = sets
    .map((s) => ({ set: s, track: inferDeliveryTrack(s.name) }))
    .filter((x) => x.track !== null)
  const uploadTargets: UploadTarget[] | undefined =
    deliverySets.length > 0
      ? deliverySets.map(({ set, track }) => ({
          id: set.id,
          name: set.name,
          deliveryTrack: track,
        }))
      : undefined

  const hasDeliveryAssets = assets.some(
    (a) => a.delivery_track === "social" || a.delivery_track === "high_quality",
  )
  const canDeliver = !!uploadTargets && assets.length > 0 && !!client
  return (
    <div className="space-y-5">
      {/* Estado de entrega enviada: permite cancelar (des-publicar) la entrega. */}
      {gallery.delivery_ready_at && (
        <DeliveryStatusBanner
          galleryId={gallery.id}
          deliveryReadyAt={gallery.delivery_ready_at}
        />
      )}
      {/* Habilitar entrega final (crea carpetas de pista en la misma galería). */}
      {!uploadTargets && (
        <EnableFinalDeliveryBanner galleryId={gallery.id} hasDeliveryAssets={hasDeliveryAssets} />
      )}
      {canDeliver && client && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-50/60 px-4 py-3 dark:bg-emerald-500/5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground">
              ¿Listo para entregar a {client.name ?? "tu cliente"}?
            </p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              Le avisamos por email y/o WhatsApp y te damos los links para compartir manualmente.
            </p>
          </div>
          <DeliverToClientButton
            galleryId={gallery.id}
            clientName={client.name}
            clientEmail={client.email}
            clientPhone={client.phone}
          />
        </div>
      )}
      <AssetUploader galleryId={gallery.id} studioId={studioId} targets={uploadTargets} />
      {assets.length > 1 && (
        <SortByNameButton galleryId={gallery.id} />
      )}
      {assets.length > 0 ? (
        <AssetGrid
          galleryId={gallery.id}
          assets={assets.map((a) => ({
            id: a.id,
            thumbUrl: a.thumbUrl,
            webUrl: a.webUrl,
            originalName: a.original_name,
            status: a.status,
            isFavorite: false,
            width: a.width ?? undefined,
            height: a.height ?? undefined,
          }))}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Aún no hay fotos. Subí tus primeras imágenes desde el uploader de arriba.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Sets tab ───────────────────────────────────────────────────────────────

function SetsTab({
  galleryId,
  sets,
  assets,
}: {
  galleryId: string
  sets: SetRow[]
  assets: Asset[]
}) {
  const router = useRouter()
  const [creating, setCreating] = React.useState(false)
  const [name, setName] = React.useState("")
  const [pending, startTransition] = useTransition()

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const fd = new FormData()
    fd.set("name", name.trim())
    startTransition(async () => {
      try {
        await createSetAction(galleryId, fd)
        toast.success("Set creado")
        setName("")
        setCreating(false)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      }
    })
  }

  const handleDelete = (setId: string) => {
    if (!confirm("¿Eliminar este set? Las fotos se moverán al raíz de la galería.")) return
    startTransition(async () => {
      try {
        await deleteSetAction(setId, galleryId, true)
        toast.success("Set eliminado")
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      }
    })
  }

  const rootCount = assets.filter((a) => !a.set_id).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">
          Organiza tus fotos en carpetas (Destacados, Ceremonia, etc.). Cada foto
          puede pertenecer a un set, o quedar en el raíz.
        </p>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12.5px] font-medium text-brand-foreground transition-colors hover:bg-brand/90"
          >
            <Plus className="h-3.5 w-3.5" /> Nuevo set
          </button>
        )}
      </div>

      {creating && (
        <form
          onSubmit={handleCreate}
          className="flex gap-2 rounded-lg border border-border bg-card p-3"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ej. Ceremonia, Recepción, Destacados…"
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
          >
            {pending ? "Creando…" : "Crear"}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false)
              setName("")
            }}
            className="rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/70"
          >
            Cancelar
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* Root set virtual */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-foreground">
                Sin clasificar
              </p>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                Fotos en el raíz
              </p>
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground tabular-nums">
              {rootCount}
            </span>
          </div>
        </div>

        {sets.map((s) => (
          <div
            key={s.id}
            className="rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-foreground">
                  {s.name}
                </p>
                {s.description && (
                  <p className="mt-0.5 line-clamp-2 text-[11.5px] text-muted-foreground">
                    {s.description}
                  </p>
                )}
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground tabular-nums">
                {s.asset_count}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => handleDelete(s.id)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="h-3 w-3" />
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Selections tab ─────────────────────────────────────────────────────────

function SelectionsTab({
  galleryId,
  collections,
  favorites,
  assets,
}: {
  galleryId: string
  collections: CollectionRow[]
  favorites: FavoriteSelectionRow[]
  assets: Asset[]
}) {
  const router = useRouter()
  const [creating, setCreating] = React.useState(false)
  const [name, setName] = React.useState("")
  const [pending, startTransition] = useTransition()
  // La clave activa puede ser una lista (id) o una selección por favoritos ("fav:<email>").
  // Por defecto: la selección ENVIADA > primera de favoritos > primera lista.
  const [selectedColl, setSelectedColl] = React.useState<string | null>(
    favorites.find((f) => f.submitted)
      ? `fav:${favorites.find((f) => f.submitted)!.clientEmail}`
      : favorites[0]
        ? `fav:${favorites[0].clientEmail}`
        : (collections[0]?.id ?? null),
  )
  const [items, setItems] = React.useState<
    Array<{ id: string; asset_id: string; original_name: string; thumbUrl: string | null }>
  >([])
  const [loadingItems, setLoadingItems] = React.useState(false)

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const fd = new FormData()
    fd.set("name", name.trim())
    fd.set("isClientEditable", "true")
    startTransition(async () => {
      try {
        await createCollectionAction(galleryId, fd)
        toast.success("Selección creada")
        setName("")
        setCreating(false)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      }
    })
  }

  const handleDelete = (id: string) => {
    if (!confirm("¿Eliminar esta selección? Esta acción no se puede deshacer.")) return
    startTransition(async () => {
      try {
        await deleteCollectionAction(id, galleryId)
        toast.success("Selección eliminada")
        if (selectedColl === id) setSelectedColl(null)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      }
    })
  }

  // Cargar items de la selección activa via fetch /api (solo listas; los
  // favoritos ya vienen resueltos en memoria desde `assets`).
  React.useEffect(() => {
    if (!selectedColl || selectedColl.startsWith("fav:")) {
      setItems([])
      return
    }
    setLoadingItems(true)
    fetch(`/api/galleries/${galleryId}/collections/${selectedColl}/items`)
      .then((r) => r.json())
      .then((d: { items: typeof items }) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoadingItems(false))
  }, [selectedColl, galleryId])

  const activeColl = collections.find((c) => c.id === selectedColl) ?? null
  const activeFav = selectedColl?.startsWith("fav:")
    ? (favorites.find((f) => `fav:${f.clientEmail}` === selectedColl) ?? null)
    : null
  const favItems = activeFav
    ? assets.filter((a) => activeFav.assetIds.includes(a.id))
    : []

  const [copyOpen, setCopyOpen] = React.useState(false)
  type CopyFormat = "original" | "jpg" | "arw" | "none"
  type CopySep = "comma" | "newline"
  const [copyFormat, setCopyFormat] = React.useState<CopyFormat>("none")
  const [copySep, setCopySep] = React.useState<CopySep>("newline")

  // Compartir la selección como vista aparte (solo los favoritos del cliente).
  const [selShareUrl, setSelShareUrl] = React.useState<string | null>(null)
  const handleShareSelection = () => {
    const fd = new FormData()
    fd.set("viewMode", "selection")
    startTransition(async () => {
      try {
        const res = await shareGalleryAction(galleryId, fd)
        const url = `${typeof window !== "undefined" ? window.location.origin : ""}/g/${res.token}`
        setSelShareUrl(url)
        await navigator.clipboard.writeText(url)
        toast.success("Link de selección copiado")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      }
    })
  }

  const rawNames = activeFav
    ? favItems.map((a) => a.original_name)
    : items.map((i) => i.original_name)

  const formatNames = (
    names: string[],
    format: CopyFormat,
    sep: CopySep,
  ): string => {
    const stripExt = (n: string) => n.replace(/\.[^./\\]+$/, "")
    const mapped = names.map((n) => {
      if (format === "original") return n
      if (format === "none") return stripExt(n)
      return `${stripExt(n)}.${format}`
    })
    return mapped.join(sep === "comma" ? ", " : "\n")
  }

  const openCopyDialog = () => setCopyOpen(true)

  const doCopy = () => {
    const text = formatNames(rawNames, copyFormat, copySep)
    navigator.clipboard.writeText(text)
    toast.success(`${rawNames.length} nombre${rawNames.length === 1 ? "" : "s"} copiado${rawNames.length === 1 ? "" : "s"}`)
    setCopyOpen(false)
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">
      {/* Sidebar listas */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-foreground">
            Selecciones ({favorites.length + collections.length})
          </p>
          {!creating && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-muted px-2 text-[11.5px] font-medium text-foreground hover:bg-muted/70"
            >
              <Plus className="h-3 w-3" /> Nueva
            </button>
          )}
        </div>

        {creating && (
          <form onSubmit={handleCreate} className="space-y-2 rounded-lg border border-border bg-card p-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre"
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
            />
            <div className="flex gap-1">
              <button
                type="submit"
                disabled={pending}
                className="flex-1 rounded-md bg-brand px-2 py-1 text-[11px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
              >
                Crear
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false)
                  setName("")
                }}
                className="rounded-md bg-muted px-2 py-1 text-[11px] text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </form>
        )}

        <div className="space-y-1">
          {collections.length === 0 && favorites.length === 0 && !creating && (
            <p className="rounded-lg border border-dashed border-border bg-card/40 px-3 py-4 text-center text-[12px] text-muted-foreground">
              Aún no hay selecciones. Cuando el cliente marque favoritas ❤️ o
              cree listas, aparecerán acá.
            </p>
          )}

          {/* Selecciones por favoritos ❤️ — el flujo "Avisar al fotógrafo" */}
          {favorites.map((f) => {
            const key = `fav:${f.clientEmail}`
            const active = key === selectedColl
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedColl(key)}
                className={cn(
                  "group flex w-full items-start justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                  active
                    ? "border-brand bg-brand-soft"
                    : "border-border bg-card hover:border-border-strong",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Heart className="h-3 w-3 flex-shrink-0 fill-current text-rose-500" />
                    <p
                      className={cn(
                        "truncate text-[12.5px] font-semibold",
                        active ? "text-brand" : "text-foreground",
                      )}
                    >
                      Favoritas
                    </p>
                    {f.submitted && <Send className="h-3 w-3 flex-shrink-0 text-brand" />}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {f.clientEmail}
                  </p>
                </div>
                <span className="flex-shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground tabular-nums">
                  {f.assetIds.length}
                </span>
              </button>
            )
          })}

          {collections.map((c) => {
            const active = c.id === selectedColl
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedColl(c.id)}
                className={cn(
                  "group flex w-full items-start justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                  active
                    ? "border-brand bg-brand-soft"
                    : "border-border bg-card hover:border-border-strong",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p
                      className={cn(
                        "truncate text-[12.5px] font-semibold",
                        active ? "text-brand" : "text-foreground",
                      )}
                    >
                      {c.name}
                    </p>
                    {c.is_locked && (
                      <Send className="h-3 w-3 flex-shrink-0 text-brand" />
                    )}
                  </div>
                  {c.client_name && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {c.client_name}
                    </p>
                  )}
                </div>
                <span className="flex-shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground tabular-nums">
                  {c.asset_count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Detalle selección */}
      <div className="min-w-0">
        {activeFav ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4 fill-current text-rose-500" />
                  <h3 className="truncate text-[15px] font-semibold text-foreground">
                    Favoritas
                  </h3>
                  {activeFav.submitted && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[10.5px] font-semibold text-brand">
                      <Send className="h-3 w-3" />
                      Enviada
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {favItems.length} foto{favItems.length === 1 ? "" : "s"} ·{" "}
                  {activeFav.clientEmail}
                  {activeFav.submittedAt &&
                    ` · enviada ${new Date(activeFav.submittedAt).toLocaleDateString("es-DO")}`}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <button
                  onClick={handleShareSelection}
                  disabled={pending || favItems.length === 0}
                  title="Compartir esta selección como vista aparte"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-2.5 text-[12px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-40"
                >
                  <Share2 className="h-3 w-3" />
                  {pending ? "Generando…" : "Compartir"}
                </button>
                <button
                  onClick={openCopyDialog}
                  disabled={favItems.length === 0}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-muted px-2.5 text-[12px] font-medium text-foreground hover:bg-muted/70 disabled:opacity-40"
                >
                  <Copy className="h-3 w-3" />
                  Copiar nombres
                </button>
              </div>
            </div>

            {selShareUrl && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand-soft/40 px-3 py-2">
                <Share2 className="h-3.5 w-3.5 flex-shrink-0 text-brand" />
                <input
                  readOnly
                  value={selShareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-foreground outline-none"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selShareUrl)
                    toast.success("Copiado")
                  }}
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-brand px-2 text-[11.5px] font-medium text-brand-foreground hover:bg-brand/90"
                >
                  <Copy className="h-3 w-3" /> Copiar
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`✨ Aquí está tu selección final de fotos, en una vista aparte: ${selShareUrl}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-[#25D366] px-2 text-[11.5px] font-semibold text-white hover:bg-[#1eb858]"
                >
                  <MessageCircle className="h-3 w-3" /> WhatsApp
                </a>
              </div>
            )}

            {favItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center text-sm text-muted-foreground">
                Las fotos de esta selección ya no están en la galería.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {favItems.map((a) => (
                  <div
                    key={a.id}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
                    title={a.original_name}
                  >
                    {a.thumbUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.thumbUrl}
                        alt={a.original_name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                      {a.original_name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : !activeColl ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center text-sm text-muted-foreground">
            Seleccioná una selección para ver las fotos elegidas.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-[15px] font-semibold text-foreground">
                    {activeColl.name}
                  </h3>
                  {activeColl.is_locked && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[10.5px] font-semibold text-brand">
                      <Send className="h-3 w-3" />
                      Enviada
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {activeColl.asset_count} foto
                  {activeColl.asset_count === 1 ? "" : "s"} ·{" "}
                  {activeColl.client_name ?? "sin cliente"}
                  {activeColl.submitted_at &&
                    ` · enviada ${new Date(activeColl.submitted_at).toLocaleDateString("es-DO")}`}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <button
                  onClick={openCopyDialog}
                  disabled={items.length === 0}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-muted px-2.5 text-[12px] font-medium text-foreground hover:bg-muted/70 disabled:opacity-40"
                >
                  <Copy className="h-3 w-3" />
                  Copiar nombres
                </button>
                <button
                  onClick={() => handleDelete(activeColl.id)}
                  className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Galería de fotos seleccionadas */}
            {loadingItems ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center text-sm text-muted-foreground">
                Esta lista está vacía.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
                      title={item.original_name}
                    >
                      {item.thumbUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.thumbUrl}
                          alt={item.original_name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <p className="truncate text-[10px] font-medium text-white">
                          {item.original_name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Lista de filenames */}
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Lista de archivos
                  </p>
                  <p className="select-all break-words font-mono text-[12px] text-foreground leading-relaxed">
                    {items.map((i) => i.original_name).join(", ")}
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Helper hint sobre asset count global */}
        {assets.length === 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11.5px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            La galería aún no tiene fotos. Subí imágenes en la pestaña Fotos para
            que el cliente pueda hacer selecciones.
          </div>
        )}
      </div>

      {/* Diálogo de copia con opciones de formato/separador */}
      {copyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setCopyOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Copiar nombres
                </h3>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {rawNames.length} archivo{rawNames.length === 1 ? "" : "s"} seleccionado{rawNames.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCopyOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Formato */}
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Formato
            </p>
            <div className="mb-4 grid grid-cols-2 gap-1.5">
              {([
                { v: "none", label: "Sin extensión", hint: "IMG_0123" },
                { v: "original", label: "Tal cual", hint: "IMG_0123.ARW" },
                { v: "jpg", label: "Forzar .jpg", hint: "IMG_0123.jpg" },
                { v: "arw", label: "Forzar .arw", hint: "IMG_0123.arw" },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setCopyFormat(opt.v)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    copyFormat === opt.v
                      ? "border-brand bg-brand/5"
                      : "border-border bg-background hover:border-border-strong",
                  )}
                >
                  <p className="text-[12.5px] font-medium text-foreground">
                    {opt.label}
                  </p>
                  <p className="font-mono text-[10.5px] text-muted-foreground">
                    {opt.hint}
                  </p>
                </button>
              ))}
            </div>

            {/* Separador */}
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Separador
            </p>
            <div className="mb-4 grid grid-cols-2 gap-1.5">
              {([
                { v: "newline", label: "Línea por línea" },
                { v: "comma", label: "Coma (, )" },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setCopySep(opt.v)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-[12.5px] font-medium transition-colors",
                    copySep === opt.v
                      ? "border-brand bg-brand/5 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-border-strong",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Preview */}
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Vista previa
            </p>
            <pre className="mb-4 max-h-40 overflow-auto rounded-lg border border-border bg-muted/50 p-2.5 font-mono text-[11px] leading-relaxed text-foreground whitespace-pre-wrap">
              {formatNames(rawNames.slice(0, 6), copyFormat, copySep)}
              {rawNames.length > 6 ? `\n…y ${rawNames.length - 6} más` : ""}
            </pre>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCopyOpen(false)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-[12.5px] text-muted-foreground hover:border-border-strong"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={doCopy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-[12.5px] font-semibold text-brand-foreground hover:bg-brand/90"
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar al portapapeles
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Pins tab ───────────────────────────────────────────────────────────────

function PinsTab({ galleryId, pins }: { galleryId: string; pins: PinRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [creating, setCreating] = React.useState(false)
  const [label, setLabel] = React.useState("")
  const [maxDownloads, setMaxDownloads] = React.useState("0")
  const [resolution, setResolution] = React.useState<"original" | "web">("original")
  const [lastCreated, setLastCreated] = React.useState<{ pin: string; last4: string } | null>(null)

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    const fd = new FormData()
    fd.set("label", label.trim())
    fd.set("maxDownloads", String(Math.max(0, Number(maxDownloads) || 0)))
    fd.set("resolution", resolution)
    startTransition(async () => {
      try {
        const result = await createPinAction(galleryId, fd)
        toast.success("PIN creado")
        setLastCreated({ pin: result.rawPin, last4: result.last4 })
        setLabel("")
        setMaxDownloads("0")
        setCreating(false)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      }
    })
  }

  const handleRevoke = (id: string) => {
    if (!confirm("¿Revocar este PIN? Ya no podrá usarse.")) return
    startTransition(async () => {
      try {
        await revokePinAction(id, galleryId)
        toast.success("PIN revocado")
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      }
    })
  }

  const handleDelete = (id: string) => {
    if (!confirm("¿Eliminar este PIN definitivamente?")) return
    startTransition(async () => {
      try {
        await deletePinAction(id, galleryId)
        toast.success("PIN eliminado")
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      }
    })
  }

  const copyPin = (pin: string) => {
    navigator.clipboard.writeText(pin)
    toast.success("PIN copiado")
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] text-muted-foreground max-w-2xl">
          Genera códigos para que tus clientes descarguen las fotos sin marca de
          agua. Cada PIN tiene un límite opcional de descargas. Una vez agotado o
          vencido, deja de funcionar.
        </p>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12.5px] font-medium text-brand-foreground hover:bg-brand/90"
          >
            <Plus className="h-3.5 w-3.5" /> Generar PIN
          </button>
        )}
      </div>

      {/* PIN recién creado — mostrar UNA vez */}
      {lastCreated && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              Tu nuevo PIN — guárdalo, no lo volveremos a mostrar
            </p>
            <p className="mt-1 select-all font-mono text-2xl font-bold tracking-[0.18em] text-emerald-900 dark:text-emerald-100">
              {lastCreated.pin}
            </p>
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <button
              onClick={() => copyPin(lastCreated.pin)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700"
            >
              <Copy className="h-3.5 w-3.5" /> Copiar
            </button>
            <button
              onClick={() => setLastCreated(null)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {creating && (
        <form
          onSubmit={handleCreate}
          className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3"
        >
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Etiqueta interna
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ej. Para Andrea"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Límite de descargas (0 = ilimitado)
            </label>
            <input
              type="number"
              min={0}
              value={maxDownloads}
              onChange={(e) => setMaxDownloads(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Resolución
            </label>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value as "original" | "web")}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            >
              <option value="original">Original (alta resolución)</option>
              <option value="web">Web (1600px)</option>
            </select>
          </div>
          <div className="sm:col-span-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/70"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-brand px-4 py-1.5 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
            >
              {pending ? "Generando…" : "Generar PIN"}
            </button>
          </div>
        </form>
      )}

      {/* Lista de PINs existentes */}
      {pins.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-10 text-center text-sm text-muted-foreground">
          Sin PINs creados todavía.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-[12.5px]">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Etiqueta</th>
                <th className="px-4 py-2.5 text-left font-medium">Código</th>
                <th className="px-4 py-2.5 text-left font-medium">Resolución</th>
                <th className="px-4 py-2.5 text-left font-medium">Usos</th>
                <th className="px-4 py-2.5 text-left font-medium">Estado</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pins.map((p) => {
                const isRevoked = !!p.revoked_at
                const isExpired =
                  !!p.expires_at && new Date(p.expires_at).getTime() < Date.now()
                const isExhausted =
                  p.max_downloads > 0 && p.used_count >= p.max_downloads
                const inactive = isRevoked || isExpired || isExhausted
                return (
                  <tr key={p.id} className={inactive ? "opacity-60" : ""}>
                    <td className="px-4 py-2.5 text-foreground">
                      {p.label ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-foreground">
                      ••••{p.pin_last4}
                    </td>
                    <td className="px-4 py-2.5 capitalize text-muted-foreground">
                      {p.resolution}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-foreground">
                      {p.used_count}
                      {p.max_downloads > 0 ? ` / ${p.max_downloads}` : ""}
                    </td>
                    <td className="px-4 py-2.5">
                      {isRevoked ? (
                        <span className="text-rose-600 dark:text-rose-400">Revocado</span>
                      ) : isExpired ? (
                        <span className="text-amber-600 dark:text-amber-400">Vencido</span>
                      ) : isExhausted ? (
                        <span className="text-amber-600 dark:text-amber-400">Agotado</span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400">Activo</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        {!inactive && (
                          <button
                            onClick={() => handleRevoke(p.id)}
                            className="rounded-md px-2 py-1 text-[11.5px] text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            Revocar
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="rounded-md p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Watermark tab ──────────────────────────────────────────────────────────

type WatermarkMode = "text" | "image"
type WatermarkPosition =
  | "top-left"
  | "top-right"
  | "center"
  | "bottom-left"
  | "bottom-right"
  | "tile"

function WatermarkTab({ gallery }: { gallery: Gallery }) {
  const router = useRouter()
  const [savingState, setSavingState] = React.useState<"idle" | "saving" | "uploading">(
    "idle",
  )
  const [enabled, setEnabled] = React.useState(gallery.watermark_enabled)
  const [mode, setMode] = React.useState<WatermarkMode>(
    ((gallery as unknown as { watermark_mode?: string }).watermark_mode as WatermarkMode) ??
      "text",
  )
  const [text, setText] = React.useState(gallery.watermark_text ?? "")
  const [imageKey, setImageKey] = React.useState<string | null>(
    (gallery as unknown as { watermark_image_key?: string | null }).watermark_image_key ??
      null,
  )
  const [position, setPosition] = React.useState<WatermarkPosition>(
    (gallery.watermark_position as WatermarkPosition) || "bottom-right",
  )
  const [opacity, setOpacity] = React.useState(gallery.watermark_opacity)
  const [reprocessAll, setReprocessAll] = React.useState(false)

  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const handleUploadLogo = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Logo máximo 5MB")
      return
    }
    setSavingState("uploading")
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/galleries/${gallery.id}/watermark/upload`, {
        method: "POST",
        body: fd,
      })
      const data = (await res.json()) as { imageKey?: string; error?: string }
      if (data.error || !data.imageKey) {
        toast.error(data.error ?? "Error subiendo logo")
        return
      }
      setImageKey(data.imageKey)
      toast.success("Logo subido. No olvides guardar cambios.")
    } catch {
      toast.error("Error subiendo logo")
    } finally {
      setSavingState("idle")
    }
  }

  const handleSave = async () => {
    if (mode === "image" && enabled && !imageKey) {
      toast.error("Sube un logo o cambia a modo texto")
      return
    }
    if (mode === "text" && enabled && !text.trim()) {
      toast.error("Escribe un texto para la marca de agua")
      return
    }
    setSavingState("saving")
    try {
      const res = await fetch(`/api/galleries/${gallery.id}/watermark`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          mode,
          text: text || null,
          imageKey: imageKey || null,
          position,
          opacity,
          reprocessAll,
        }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string; reprocessed?: number }
      if (data.error) {
        toast.error(data.error)
        return
      }
      toast.success(
        data.reprocessed
          ? `Guardado. Re-procesando ${data.reprocessed} fotos…`
          : "Marca de agua actualizada",
      )
      router.refresh()
    } catch {
      toast.error("Error guardando")
    } finally {
      setSavingState("idle")
    }
  }

  const pending = savingState !== "idle"

  return (
    <div className="max-w-2xl space-y-5">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-foreground">
              Marca de agua automática
            </h3>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Se aplica al rendition web (lo que ven los clientes). Las descargas
              con PIN se sirven sin marca de agua.
            </p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="peer sr-only"
            />
            <div className="peer h-5 w-9 rounded-full bg-muted after:absolute after:start-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-card after:shadow after:transition-all peer-checked:bg-brand peer-checked:after:translate-x-full" />
          </label>
        </div>

        {enabled && (
          <div className="mt-4 space-y-4">
            {/* Modo: texto vs imagen */}
            <div>
              <label className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                Tipo
              </label>
              <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
                <button
                  type="button"
                  onClick={() => setMode("text")}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    mode === "text"
                      ? "bg-brand text-brand-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Texto
                </button>
                <button
                  type="button"
                  onClick={() => setMode("image")}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    mode === "image"
                      ? "bg-brand text-brand-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Logo (imagen)
                </button>
              </div>
            </div>

            {mode === "text" ? (
              <div>
                <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Texto
                </label>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="© Tu Estudio"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Logo
                </label>
                <div className="flex items-center gap-3">
                  {imageKey ? (
                    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
                      <span className="inline-block h-8 w-8 rounded bg-checkered" />
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {imageKey.split("/").pop()}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[12.5px] text-muted-foreground">
                      Aún no has subido un logo.
                    </span>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/webp,image/svg+xml,image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void handleUploadLogo(f)
                      if (fileInputRef.current) fileInputRef.current.value = ""
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={savingState === "uploading"}
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                  >
                    {savingState === "uploading"
                      ? "Subiendo…"
                      : imageKey
                        ? "Cambiar logo"
                        : "Subir logo"}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  PNG con transparencia recomendado. Máximo 5MB.
                </p>
              </div>
            )}

            <div>
              <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                Posición
              </label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value as WatermarkPosition)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="top-left">Arriba izquierda</option>
                <option value="top-right">Arriba derecha</option>
                <option value="center">Centro</option>
                <option value="bottom-left">Abajo izquierda</option>
                <option value="bottom-right">Abajo derecha</option>
                <option value="tile">Mosaico (cubre toda la foto)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 flex items-center justify-between text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Opacidad</span>
                <span className="font-mono text-foreground tabular-nums">
                  {Math.round(opacity * 100)}%
                </span>
              </label>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-full accent-brand"
              />
            </div>

            <label className="flex items-center gap-2 text-[12.5px] text-foreground">
              <input
                type="checkbox"
                checked={reprocessAll}
                onChange={(e) => setReprocessAll(e.target.checked)}
                className="rounded border-border accent-brand"
              />
              Re-procesar fotos existentes con esta marca de agua
            </label>
          </div>
        )}

        <div className="mt-5 flex items-center gap-2">
          <button
            onClick={() => void handleSave()}
            disabled={pending}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90 disabled:opacity-50"
          >
            {savingState === "saving" ? "Guardando…" : "Guardar cambios"}
          </button>
          <p className="text-[11.5px] text-muted-foreground">
            Aplica automáticamente a cada foto nueva al subirla.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Share tab ──────────────────────────────────────────────────────────────

function ShareTab({
  gallery,
  publicToken,
  driveLink = null,
  client = null,
  hasDeliveryAssets = false,
  waSelectionTemplate,
}: {
  gallery: Gallery
  publicToken: string | null
  driveLink?: string | null
  client?: { name: string | null; email: string | null; phone: string | null } | null
  hasDeliveryAssets?: boolean
  waSelectionTemplate?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [token, setToken] = React.useState(publicToken)
  const [copied, setCopied] = React.useState(false)
  const [driveCopied, setDriveCopied] = React.useState(false)
  const [selToken, setSelToken] = React.useState<string | null>(null)
  const [selCopied, setSelCopied] = React.useState(false)
  const [msgCopied, setMsgCopied] = React.useState(false)

  const publicUrl = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/g/${token}`
    : null

  // WhatsApp: número del cliente normalizado (RD/US sin código → +1) y mensajes.
  const waPhone = (client?.phone ?? "").replace(/\D/g, "").replace(/^(\d{10})$/, "1$1")
  const firstName = (client?.name ?? "").trim().split(/\s+/)[0] || ""
  const greet = firstName ? `¡Hola ${firstName}! ` : "¡Hola! "
  const waLink = (msg: string) =>
    `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`
  // Mensaje de selección: viene del template editable (Ajustes → WhatsApp).
  const msgSeleccion = publicUrl
    ? renderWaMessage(waSelectionTemplate, {
        cliente: firstName,
        galeria: gallery.name,
        link: publicUrl,
      })
    : ""
  const msgEntrega = publicUrl
    ? `${greet}🎉 ¡Tu entrega final ya está lista! Puedes verla, seguir eligiendo fotos y descargarlas aquí: ${publicUrl}`
    : ""
  const msgDrive = driveLink
    ? `${greet}📁 Aquí puedes descargar tus fotos desde Google Drive: ${driveLink}`
    : ""

  const handleCopyDrive = () => {
    if (!driveLink) return
    navigator.clipboard.writeText(driveLink)
    setDriveCopied(true)
    toast.success("Link de Drive copiado")
    setTimeout(() => setDriveCopied(false), 2000)
  }

  const handleGenerate = () => {
    const fd = new FormData()
    startTransition(async () => {
      try {
        const result = await shareGalleryAction(gallery.id, fd)
        setToken(result.token)
        toast.success("Link generado")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      }
    })
  }

  // ── Link de SOLO selección (vista aparte con los favoritos del cliente) ──
  const selUrl = selToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/g/${selToken}`
    : null
  const msgSel = selUrl
    ? `${greet}✨ Aquí está tu selección final de fotos, en una vista aparte: ${selUrl}`
    : ""
  const handleGenerateSelection = () => {
    const fd = new FormData()
    fd.set("viewMode", "selection")
    startTransition(async () => {
      try {
        const result = await shareGalleryAction(gallery.id, fd)
        setSelToken(result.token)
        toast.success("Link de selección generado")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      }
    })
  }
  const handleCopySel = () => {
    if (!selUrl) return
    navigator.clipboard.writeText(selUrl)
    setSelCopied(true)
    toast.success("Link copiado")
    setTimeout(() => setSelCopied(false), 2000)
  }

  const handlePublish = () => {
    startTransition(async () => {
      try {
        await publishGalleryAction(gallery.id)
        toast.success("Galería publicada")
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      }
    })
  }

  const handleCopy = () => {
    if (!publicUrl) return
    navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    toast.success("Link copiado")
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCopyMsg = () => {
    const m = hasDeliveryAssets ? msgEntrega : msgSeleccion
    if (!m) return
    navigator.clipboard.writeText(m)
    setMsgCopied(true)
    toast.success("Mensaje copiado")
    setTimeout(() => setMsgCopied(false), 2000)
  }

  return (
    <div className="max-w-2xl space-y-4">
      {gallery.status !== "published" && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div>
            <p className="text-[13px] font-semibold text-amber-900 dark:text-amber-200">
              La galería está en borrador
            </p>
            <p className="text-[12px] text-amber-700 dark:text-amber-300">
              Publícala para que el cliente pueda verla con el link.
            </p>
          </div>
          <button
            onClick={handlePublish}
            disabled={pending}
            className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
          >
            Publicar ahora
          </button>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-[14px] font-semibold text-foreground">
          Link público para el cliente
        </h3>

        {publicUrl ? (
          <div className="mt-3">
            <div className="flex gap-2">
              <input
                readOnly
                value={publicUrl}
                className="flex-1 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-[12.5px] text-foreground"
              />
              <button
                onClick={handleCopy}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand/90"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <div className="mt-3">
              <a
                href={waLink(
                  hasDeliveryAssets ? msgEntrega : msgSeleccion,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-[#25D366] px-3 text-xs font-semibold text-white hover:bg-[#1eb858]"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {hasDeliveryAssets
                  ? "Compartir galería por WhatsApp"
                  : "Compartir selección por WhatsApp"}
              </a>
            </div>

            {/* Mensaje listo para copiar (el mismo que va por WhatsApp) */}
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  Mensaje para el cliente
                </span>
                <button
                  onClick={handleCopyMsg}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white/70 px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-white dark:border-emerald-500/40 dark:bg-transparent dark:text-emerald-300"
                >
                  {msgCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {msgCopied ? "Copiado" : "Copiar mensaje"}
                </button>
              </div>
              <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-foreground">
                {hasDeliveryAssets ? msgEntrega : msgSeleccion}
              </p>
              {!hasDeliveryAssets && (
                <p className="mt-1.5 text-[10.5px] text-muted-foreground">
                  Se edita en Ajustes → WhatsApp y se actualiza en todas las galerías.
                </p>
              )}
            </div>

            <p className="mt-2 text-[11.5px] text-muted-foreground">
              {hasDeliveryAssets
                ? "El cliente ve su selección y la entrega final en la misma galería con un toggle."
                : "Link de selección: el cliente favoritea con ♥ y elige sus fotos."}
              {!waPhone && " (Agrega el teléfono del cliente para enviar directo por WhatsApp.)"}
            </p>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-[12.5px] text-muted-foreground">
              Genera un link único para compartir esta galería con tu cliente.
            </p>
            <button
              onClick={handleGenerate}
              disabled={pending}
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
            >
              {pending ? "Generando…" : "Generar link"}
            </button>
          </div>
        )}
      </div>

      {/* Compartir SOLO la selección del cliente (vista aparte con sus favoritos) */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
          <Share2 className="h-4 w-4 text-muted-foreground" /> Vista de selección (aparte)
        </h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Link que muestra SOLO las fotos que el cliente marcó con ♥, separadas de la
          galería completa.
        </p>
        {selUrl ? (
          <div className="mt-3">
            <div className="flex gap-2">
              <input
                readOnly
                value={selUrl}
                className="flex-1 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-[12.5px] text-foreground"
              />
              <button
                onClick={handleCopySel}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand/90"
              >
                {selCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {selCopied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <a
              href={waLink(msgSel)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-[#25D366] px-3 text-xs font-semibold text-white hover:bg-[#1eb858]"
            >
              <MessageCircle className="h-3.5 w-3.5" /> Compartir selección por WhatsApp
            </a>
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              Refleja los favoritos actuales del cliente.
              {!waPhone && " (Agrega el teléfono del cliente para enviar directo.)"}
            </p>
          </div>
        ) : (
          <button
            onClick={handleGenerateSelection}
            disabled={pending}
            className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-50"
          >
            <Share2 className="h-3.5 w-3.5" /> {pending ? "Generando…" : "Generar link de selección"}
          </button>
        )}
      </div>

      {/* Google Drive — si tiene entrega habilitada o link de Drive */}
      {(hasDeliveryAssets || !!driveLink) && (
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
          <ExternalLink className="h-4 w-4 text-muted-foreground" /> Google Drive
        </h3>
        {driveLink ? (
          <div className="mt-3">
            <div className="flex gap-2">
              <input
                readOnly
                value={driveLink}
                className="flex-1 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-[12.5px] text-foreground"
              />
              <button
                onClick={handleCopyDrive}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand/90"
              >
                {driveCopied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {driveCopied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={driveLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-muted/50"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Abrir carpeta
              </a>
              <a
                href={waLink(msgDrive)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#25D366] px-3 text-xs font-semibold text-white hover:bg-[#1eb858]"
              >
                <MessageCircle className="h-3.5 w-3.5" /> Compartir Drive
              </a>
            </div>
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              Carpeta con las fotos en alta. El cliente también ve este botón de
              descarga dentro de la galería de entrega.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-[12.5px] text-muted-foreground">
            Aún no hay carpeta de Drive. Se genera automáticamente al respaldar la
            entrega final en Google Drive.
          </p>
        )}
      </div>
      )}
    </div>
  )
}

function SortByNameButton({ galleryId }: { galleryId: string }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            const { sortAssetsByNameAction } = await import("@/server/actions/gallery.actions")
            const r = await sortAssetsByNameAction(galleryId)
            toast.success(`${r.sorted} fotos ordenadas por nombre`)
            router.refresh()
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al ordenar")
          } finally {
            setBusy(false)
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownAZ className="h-3.5 w-3.5" />}
        Ordenar por nombre
      </button>
      <span className="text-[11px] text-muted-foreground">
        (orden de captura de la cámara)
      </span>
    </div>
  )
}

/** Banner cuando la entrega ya fue enviada al cliente: permite cancelarla. */
function DeliveryStatusBanner({
  galleryId,
  deliveryReadyAt,
}: {
  galleryId: string
  deliveryReadyAt: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = React.useState(false)

  const cancel = () =>
    start(async () => {
      try {
        await cancelDeliveryAction({ galleryId })
        toast.success("Entrega cancelada. El cliente ya no la verá.")
        setConfirming(false)
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error")
      }
    })

  const fecha = (() => {
    try {
      return new Date(deliveryReadyAt).toLocaleDateString("es-DO", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    } catch {
      return null
    }
  })()

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-50/60 p-4 dark:bg-emerald-500/5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-foreground">
            Entrega final enviada{fecha ? ` · ${fecha}` : ""}
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            El cliente ve la sección de entrega en su galería. Podés volver a
            enviarla (actualizar) con el botón de arriba, o cancelarla para
            ocultarla. Cancelar no borra ninguna foto.
          </p>
        </div>
      </div>
      {confirming ? (
        <div className="flex shrink-0 items-center gap-2 self-center">
          <button
            type="button"
            onClick={cancel}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
            Confirmar
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            No
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex shrink-0 items-center gap-1.5 self-center rounded-lg border border-red-500/40 px-3 py-1.5 text-[12.5px] font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
        >
          <Ban className="h-3.5 w-3.5" />
          Cancelar entrega
        </button>
      )}
    </div>
  )
}

/** Banner para habilitar entrega final: crea las 2 carpetas de pista en la misma galería. */
function EnableFinalDeliveryBanner({
  galleryId,
  hasDeliveryAssets,
}: {
  galleryId: string
  hasDeliveryAssets: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const enable = () =>
    start(async () => {
      try {
        const r = await enableFinalDeliveryAction(galleryId)
        if (r.created > 0) {
          toast.success(`${r.created} carpeta(s) de entrega creada(s)`)
        } else {
          toast.success("Las carpetas ya existían")
        }
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error")
      }
    })

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-brand/20 bg-brand-soft/40 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-foreground">
            {hasDeliveryAssets
              ? "Faltan las carpetas de entrega"
              : "¿Lista la entrega final?"}
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {hasDeliveryAssets
              ? "Recreá las carpetas de entrega para organizar las fotos finales."
              : "Habilitá la entrega final en esta galería. Se crean las carpetas 💎 Máxima Calidad y 📱 Redes Sociales para subir las fotos editadas. Todo queda en la misma galería."}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={enable}
        disabled={pending}
        className="inline-flex shrink-0 items-center gap-1.5 self-center rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {hasDeliveryAssets ? "Crear carpetas" : "Habilitar entrega"}
      </button>
    </div>
  )
}
