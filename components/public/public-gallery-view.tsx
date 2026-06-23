"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Heart,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  Send,
  Loader2,
  KeyRound,
  Check,
  Image as ImageIcon,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils/cn"
import {
  resolveGalleryTheme,
  galleryStyleTokens,
  resolveCoverConfig,
} from "@/lib/galleries/templates"
import { PrintSelectionPanel } from "@/components/public/print-selection-panel"
import type { GalleryPrintState } from "@/server/services/print-selection.service"

type Asset = {
  id: string
  width: number | null
  height: number | null
  thumbUrl: string | null
  webUrl: string | null
  lqip?: string | null
  aspect?: number | null
  deliveryTrack?: "social" | "high_quality" | null
}

type Gallery = {
  id: string
  name: string
  description: string | null
  visibility: "public" | "private" | "password"
  allow_download: boolean
  require_email: boolean
  download_pin_required?: boolean
  selection_submitted?: boolean
  selection_locked?: boolean
  // Galerías 2.0
  galleryType?: "selection" | "final_delivery"
  templateId?: string
  theme?: Record<string, unknown>
  coverConfig?: Record<string, unknown>
  subtitle?: string | null
  welcomeText?: string | null
  accentColor?: string | null
  eventDate?: string | null
  coverThumbUrl?: string | null
  coverWebUrl?: string | null
}

type Collection = {
  id: string
  name: string
  asset_count: number
  is_locked: boolean
  submitted_at: string | null
  client_email: string | null
  asset_ids: string[]
}

type Studio = {
  name: string
  logoUrl: string | null
  primaryColor?: string | null
  hideBranding?: boolean
  footerHtml?: string | null
}

function formatEventDate(d: string): string | null {
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString("es", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  } catch {
    return null
  }
}

/** Portada hero full-bleed (premium) que aparece arriba de la galería. */
function GalleryHero({
  gallery,
  cover,
  accent,
  photoCount,
}: {
  gallery: Gallery
  cover: ReturnType<typeof resolveCoverConfig>
  accent: string
  photoCount: number
}) {
  const bg = gallery.coverWebUrl || gallery.coverThumbUrl
  if (!bg) return null
  const title = cover.title || gallery.name
  const subtitle =
    cover.subtitle ||
    gallery.subtitle ||
    (gallery.eventDate ? formatEventDate(gallery.eventDate) : null)
  const textLight = cover.textColor !== "dark"
  const fg = textLight ? "#ffffff" : "#111111"
  const align =
    cover.textAlign === "left"
      ? "items-start text-left"
      : cover.textAlign === "right"
        ? "items-end text-right"
        : "items-center text-center"
  return (
    <section className="relative h-[70vh] min-h-[440px] w-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={bg}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          objectPosition: `${(cover.focalX ?? 0.5) * 100}% ${(cover.focalY ?? 0.5) * 100}%`,
        }}
      />
      {cover.overlay !== "none" && (
        <div
          className="absolute inset-0"
          style={{
            background: cover.overlay === "light" ? "#ffffff" : "#000000",
            opacity: cover.overlayIntensity ?? 0.35,
          }}
        />
      )}
      <div
        className={cn(
          "relative z-10 mx-auto flex h-full max-w-5xl flex-col justify-center gap-3 px-6",
          align,
        )}
      >
        <h1 className="text-4xl font-semibold leading-[1.05] sm:text-6xl" style={{ color: fg }}>
          {title}
        </h1>
        {subtitle && (
          <p
            className="text-base sm:text-lg"
            style={{ color: textLight ? "rgba(255,255,255,.85)" : "rgba(0,0,0,.7)" }}
          >
            {subtitle}
          </p>
        )}
        {gallery.welcomeText && (
          <p
            className="max-w-xl text-sm"
            style={{ color: textLight ? "rgba(255,255,255,.75)" : "rgba(0,0,0,.6)" }}
          >
            {gallery.welcomeText}
          </p>
        )}
        {cover.showButton && (
          <a
            href="#fotos"
            className="mt-3 inline-block rounded-full px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105"
            style={{ background: accent }}
          >
            {cover.buttonLabel ||
              (gallery.galleryType === "final_delivery" ? "Ver mis fotos" : "Entrar a seleccionar")}
          </a>
        )}
        <p
          className="mt-1 text-xs"
          style={{ color: textLight ? "rgba(255,255,255,.7)" : "rgba(0,0,0,.55)" }}
        >
          {photoCount} fotos
        </p>
      </div>
    </section>
  )
}

/** Polling del export ZIP (endpoint público por token) hasta que está listo. */
async function waitForZip(token: string, exportId: string): Promise<string> {
  const base = `/api/galleries/public/${token}/zip/${exportId}`
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const res = await fetch(base)
    if (!res.ok) continue
    const data = (await res.json()) as { status: string; error?: string | null }
    if (data.status === "ready" || data.status === "completed") {
      return `${base}?download=1`
    }
    if (data.status === "failed") {
      throw new Error(data.error ?? "La descarga falló al generarse")
    }
  }
  throw new Error("La descarga está tardando demasiado — intentá de nuevo en unos minutos")
}

export function PublicGalleryView({
  token,
  gallery,
  assets,
  studio,
  printState = null,
  deliveryReady = false,
  finalDeliveryDriveLink = null,
}: {
  token: string
  gallery: Gallery
  assets: Asset[]
  studio: Studio
  printState?: GalleryPrintState | null
  deliveryReady?: boolean
  finalDeliveryDriveLink?: string | null
}) {
  const [favs, setFavs] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<number | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [emailPrompt, setEmailPrompt] = useState(gallery.require_email)

  const [collections, setCollections] = useState<Collection[]>([])
  const [activeCollId, setActiveCollId] = useState<string | null>(null)
  const [creatingColl, setCreatingColl] = useState(false)
  const [newCollName, setNewCollName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [pinPrompt, setPinPrompt] = useState<{ assetId: string } | null>(null)
  const [zipBusy, setZipBusy] = useState<string | null>(null) // key del botón ZIP ocupado
  const [quota, setQuota] = useState<{
    included: number | null
    selected: number
    extras: number
    remaining: number | null
    extraUnitPrice: number
    extraTotal: number
    currency: string
    packageName: string | null
  } | null>(null)

  // Restore email from localStorage (or default to anon when email not required)
  useEffect(() => {
    if (typeof window === "undefined") return
    const saved = window.localStorage.getItem(`gallery_email_${gallery.id}`)
    if (saved) {
      setEmail(saved)
      setEmailPrompt(false)
    } else if (!gallery.require_email) {
      setEmail("anon@guest")
    }
  }, [gallery.id, gallery.require_email])

  // Cargar collections + favs cuando hay email
  const loadCollections = useCallback(async () => {
    if (!email) return
    try {
      const res = await fetch(
        `/api/galleries/public/${token}/collections?email=${encodeURIComponent(email)}`,
      )
      const data = (await res.json()) as { collections: Collection[] }
      setCollections(data.collections ?? [])
      if (data.collections.length > 0 && !activeCollId) {
        const firstUnlocked = data.collections.find((c) => !c.is_locked)
        setActiveCollId((firstUnlocked ?? data.collections[0])?.id ?? null)
      }
    } catch {
      // silent
    }
  }, [email, token, activeCollId])

  const loadFavs = useCallback(async () => {
    if (!email) return
    try {
      const res = await fetch(
        `/api/galleries/public/${token}/favorite?email=${encodeURIComponent(email)}`,
      )
      if (!res.ok) return
      const data = (await res.json()) as { favorites?: string[] }
      if (data.favorites) setFavs(new Set(data.favorites))
    } catch {
      // silent
    }
  }, [email, token])

  const loadQuota = useCallback(async () => {
    if (!email) return
    try {
      const res = await fetch(
        `/api/galleries/public/${token}/quota?email=${encodeURIComponent(email)}`,
      )
      if (!res.ok) return
      const data = (await res.json()) as { quota?: typeof quota }
      if (data.quota) setQuota(data.quota)
    } catch {
      // silent
    }
  }, [email, token])

  useEffect(() => {
    void loadCollections()
    void loadFavs()
    void loadQuota()
  }, [loadCollections, loadFavs, loadQuota])

  // Recargar quota cuando cambia el conteo (favs o lista activa)
  useEffect(() => {
    const t = setTimeout(() => void loadQuota(), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favs.size, activeCollId, collections])

  const saveEmail = (value: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`gallery_email_${gallery.id}`, value)
    }
    setEmail(value)
    setEmailPrompt(false)
  }

  const activeColl = useMemo(
    () => collections.find((c) => c.id === activeCollId) ?? null,
    [collections, activeCollId],
  )

  // Estado "marcada" según contexto: lista activa o favorito general
  const isMarked = useCallback(
    (assetId: string) => {
      if (activeColl) return activeColl.asset_ids.includes(assetId)
      return favs.has(assetId)
    },
    [activeColl, favs],
  )

  // Click corazón:
  //  - Hay lista activa → toggle item en esa lista (siempre modificable)
  //  - No hay lista → toggle favorito general
  const toggleHeart = useCallback(
    async (assetId: string) => {
      // Caso 1: lista activa — siempre se puede modificar
      if (activeColl) {
        const isIn = activeColl.asset_ids.includes(assetId)
        // Optimistic update
        setCollections((prev) =>
          prev.map((c) =>
            c.id === activeColl.id
              ? {
                  ...c,
                  asset_ids: isIn
                    ? c.asset_ids.filter((id) => id !== assetId)
                    : [...c.asset_ids, assetId],
                  asset_count: isIn ? c.asset_count - 1 : c.asset_count + 1,
                }
              : c,
          ),
        )
        try {
          const url = `/api/galleries/public/${token}/collections/${activeColl.id}/items`
          const res = isIn
            ? await fetch(`${url}?assetId=${encodeURIComponent(assetId)}`, {
                method: "DELETE",
              })
            : await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assetId }),
              })
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as
              | { error?: string }
              | null
            const msg =
              body?.error === "locked"
                ? "Esta lista ya fue enviada"
                : body?.error === "not_editable"
                  ? "Esta lista no permite cambios"
                  : (body?.error ?? `Error ${res.status}`)
            toast.error(msg)
            void loadCollections()
            return
          }
        } catch {
          toast.error("No se pudo actualizar")
          void loadCollections()
        }
        return
      }

      // Caso 2: sin lista activa → favorito general (siempre modificable)
      const wasFav = favs.has(assetId)
      // Optimistic
      setFavs((prev) => {
        const next = new Set(prev)
        if (wasFav) next.delete(assetId)
        else next.add(assetId)
        return next
      })
      try {
        const res = await fetch(`/api/galleries/public/${token}/favorite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId, clientEmail: email ?? "" }),
        })
        const j = (await res.json()) as { favorited?: boolean }
        setFavs((prev) => {
          const next = new Set(prev)
          if (j.favorited) next.add(assetId)
          else next.delete(assetId)
          return next
        })
      } catch {
        // Revertir
        setFavs((prev) => {
          const next = new Set(prev)
          if (wasFav) next.add(assetId)
          else next.delete(assetId)
          return next
        })
        toast.error("No se pudo guardar")
      }
    },
    [activeColl, favs, email, token, loadCollections],
  )

  const createCollection = useCallback(async () => {
    if (!newCollName.trim() || !email) return
    try {
      const res = await fetch(`/api/galleries/public/${token}/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCollName.trim(),
          clientEmail: email,
        }),
      })
      const data = (await res.json()) as { id?: string; error?: string }
      if (data.error) {
        toast.error(data.error)
        return
      }
      setCreatingColl(false)
      setNewCollName("")
      await loadCollections()
      if (data.id) setActiveCollId(data.id)
      toast.success("Lista creada")
    } catch {
      toast.error("Error creando lista")
    }
  }, [email, newCollName, token, loadCollections])

  const submitActive = useCallback(async () => {
    setSubmitting(true)
    try {
      // Hay lista activa → enviar esa lista
      if (activeColl) {
        if (activeColl.asset_count === 0) {
          toast.error("Agrega al menos una foto antes de enviar")
          return
        }
        if (
          !confirm(
            `¿Enviar "${activeColl.name}" con ${activeColl.asset_count} foto${activeColl.asset_count === 1 ? "" : "s"}? No podrás modificarla después.`,
          )
        ) {
          return
        }
        const res = await fetch(
          `/api/galleries/public/${token}/collections/${activeColl.id}/submit`,
          { method: "POST" },
        )
        const data = (await res.json()) as { ok?: boolean; error?: string }
        if (data.error) {
          toast.error(data.error)
          return
        }
        toast.success("¡Lista enviada al fotógrafo!")
        await loadCollections()
        return
      }

      // Sin lista activa → enviar favoritos generales
      if (favs.size === 0) {
        toast.error("Marca al menos una foto con corazón antes de enviar")
        return
      }
      if (
        !confirm(
          `¿Enviar tu selección de ${favs.size} foto${favs.size === 1 ? "" : "s"} al fotógrafo? Podrás seguir modificando tu selección después.`,
        )
      ) {
        return
      }
      const res = await fetch(`/api/galleries/public/${token}/selection/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientEmail: email ?? "" }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (data.error) {
        toast.error(data.error)
        return
      }
      toast.success("¡Selección enviada al fotógrafo!")
    } catch {
      toast.error("Error enviando")
    } finally {
      setSubmitting(false)
    }
  }, [activeColl, favs.size, token, email, loadCollections])

  const downloadUrl = (assetId: string) => {
    const u = new URL(
      `/api/galleries/public/${token}/download/${assetId}`,
      typeof window !== "undefined" ? window.location.origin : "http://localhost",
    )
    if (email) u.searchParams.set("email", email)
    return u.pathname + u.search
  }

  const handleDownload = (assetId: string) => {
    if (gallery.download_pin_required) {
      setPinPrompt({ assetId })
      return
    }
    window.location.href = downloadUrl(assetId)
  }

  // ─── Secciones: selección vs entrega final ────────────────────────────────
  // La galería puede tener fotos de selección (sin track) y fotos de entrega
  // (con track). Si tiene ambas, se muestra un toggle para cambiar entre secciones.
  const selectionAssets = useMemo(
    () => assets.filter((a) => !a.deliveryTrack),
    [assets],
  )
  const deliveryAssets = useMemo(
    () => assets.filter((a) => a.deliveryTrack === "social" || a.deliveryTrack === "high_quality"),
    [assets],
  )
  const byTrack = useMemo(() => {
    const high_quality = deliveryAssets.filter((a) => a.deliveryTrack === "high_quality")
    const social = deliveryAssets.filter((a) => a.deliveryTrack === "social")
    return { high_quality, social }
  }, [deliveryAssets])
  const hasTracks = deliveryAssets.length > 0
  const hasSelection = selectionAssets.length > 0
  const showBothSections = hasSelection && hasTracks && deliveryReady
  const [activeSection, setActiveSection] = useState<"selection" | "delivery">(
    deliveryReady && hasTracks ? "delivery" : "selection",
  )
  const isShowingDelivery = activeSection === "delivery" && hasTracks && deliveryReady
  const visibleAssets = isShowingDelivery ? deliveryAssets : selectionAssets.length > 0 ? selectionAssets : assets

  const requestZip = useCallback(
    async (key: string, assetIds: string[], resolution: "web" | "original") => {
      if (assetIds.length === 0) {
        toast.error("No hay fotos para descargar")
        return
      }
      if (assetIds.length > 2000) {
        toast.error("Son demasiadas fotos para un solo ZIP (máx. 2000). Usá el link de Drive.")
        return
      }
      setZipBusy(key)
      try {
        const res = await fetch(`/api/galleries/public/${token}/zip`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: "selection", assetIds, resolution }),
        })
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(err?.error ?? "No se pudo iniciar la descarga")
        }
        const { exportId } = (await res.json()) as { exportId: string }
        toast.info("Preparando tu ZIP… puede tardar un momento")
        const url = await waitForZip(token, exportId)
        window.location.href = url
        toast.success("¡Descarga iniciada!")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al descargar")
      } finally {
        setZipBusy(null)
      }
    },
    [token],
  )

  // Keyboard navigation in lightbox
  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null)
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? null : Math.max(0, i - 1)))
      if (e.key === "ArrowRight")
        setOpen((i) => (i === null ? null : Math.min(visibleAssets.length - 1, i + 1)))
      if ((e.key === "f" || e.key === "F") && open !== null) {
        void toggleHeart(visibleAssets[open].id)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, visibleAssets, toggleHeart])

  // ─── Tema visual (template + overrides) ──────────────────────────────────
  const theme = useMemo(
    () => resolveGalleryTheme(gallery.templateId, gallery.theme),
    [gallery.templateId, gallery.theme],
  )
  const tokens = useMemo(() => galleryStyleTokens(theme), [theme])
  const cover = useMemo(() => resolveCoverConfig(gallery.coverConfig), [gallery.coverConfig])

  // Inyectar la Google Font del template (una vez)
  useEffect(() => {
    const g = tokens.googleFont
    if (!g || typeof document === "undefined") return
    const id = `g-font-${g}`
    if (document.getElementById(id)) return
    const link = document.createElement("link")
    link.id = id
    link.rel = "stylesheet"
    link.href = `https://fonts.googleapis.com/css2?family=${g}`
    document.head.appendChild(link)
  }, [tokens.googleFont])

  if (emailPrompt) {
    return <EmailPrompt galleryName={gallery.name} onSubmit={saveEmail} />
  }

  // Conteo + flag para barra inferior — el cliente puede enviar/re-enviar siempre
  const selectionCount = activeColl ? activeColl.asset_count : favs.size
  const canSubmit = selectionCount > 0

  return (
    <div
      className={cn(
        "min-h-screen pb-24",
        tokens.mode === "dark" ? "dark bg-zinc-950" : "bg-zinc-50",
      )}
      style={{ fontFamily: tokens.fontStack }}
    >
      <GalleryHero gallery={gallery} cover={cover} accent={tokens.accent} photoCount={assets.length} />

      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {studio.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={studio.logoUrl} alt={studio.name} className="h-7 w-7 rounded" />
            ) : (
              <div className="grid h-7 w-7 place-items-center rounded bg-zinc-900 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                {studio.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {gallery.name}
              </h1>
              <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                {studio.name} · {visibleAssets.length} fotos
              </p>
            </div>
          </div>

          {showBothSections ? (
            <div className="flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
              <button
                type="button"
                onClick={() => { setActiveSection("selection"); setOpen(null) }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
                  activeSection === "selection"
                    ? "bg-white text-gold-700 shadow-sm dark:bg-zinc-700 dark:text-gold-300"
                    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
                )}
              >
                <Heart className="h-3 w-3" fill={activeSection === "selection" ? "currentColor" : "none"} />
                Selección
              </button>
              <button
                type="button"
                onClick={() => { setActiveSection("delivery"); setOpen(null) }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
                  activeSection === "delivery"
                    ? "bg-white text-emerald-700 shadow-sm dark:bg-zinc-700 dark:text-emerald-300"
                    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
                )}
              >
                <Download className="h-3 w-3" />
                Entrega final
              </button>
            </div>
          ) : isShowingDelivery ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[12.5px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              <Download className="h-3.5 w-3.5" />
              Entrega final
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-50 px-3 py-1 text-[12.5px] font-medium text-gold-700 dark:bg-gold-500/15 dark:text-gold-300">
              <Heart className="h-3.5 w-3.5" fill="currentColor" />
              {selectionCount}
            </span>
          )}
        </div>
      </header>

      {/* Banner de cuota — solo en galerías de SELECCIÓN */}
      {!isShowingDelivery && quota && quota.included !== null && (
        <div
          className={`border-b ${
            quota.extras > 0
              ? "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10"
              : "border-gold-200 bg-gold-50 dark:border-gold-500/30 dark:bg-gold-500/10"
          }`}
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${
                quota.extras > 0
                  ? "bg-amber-200 text-amber-900 dark:bg-amber-500/30 dark:text-amber-200"
                  : "bg-gold-100 text-gold-800 dark:bg-gold-500/30 dark:text-gold-200"
              }`}
            >
              {quota.selected} / {quota.included}{" "}
              {quota.packageName ? `· ${quota.packageName}` : "incluidas"}
            </span>
            {quota.extras > 0 ? (
              <p className="text-[12.5px] text-amber-900 dark:text-amber-200">
                Llevás <strong>{quota.extras}</strong> foto
                {quota.extras === 1 ? "" : "s"} extra
                {quota.extras === 1 ? "" : "s"}
                {quota.extraUnitPrice > 0 && (
                  <>
                    {" "}— costo adicional aprox.{" "}
                    <strong>
                      {new Intl.NumberFormat("es", {
                        style: "currency",
                        currency: quota.currency,
                      }).format(quota.extraTotal)}
                    </strong>
                  </>
                )}
                . Tu fotógrafo te confirmará el detalle.
              </p>
            ) : (
              <p className="text-[12.5px] text-gold-800 dark:text-gold-200">
                Te quedan <strong>{quota.remaining}</strong> dentro de tu paquete.
                Si eliges más, contarán como extras.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Entrega final: seguir eligiendo con ♥ + descargar desde la web (ZIP) y/o Drive */}
      {((isShowingDelivery && gallery.allow_download) || !!finalDeliveryDriveLink) && (
        <div className="border-b border-gold-200 bg-gold-50 dark:border-gold-500/30 dark:bg-gold-500/10">
          <div className="mx-auto max-w-7xl px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-1 text-[12.5px] font-medium text-gold-900 dark:text-gold-100">
                🎉 Tus fotografías finales ya están listas. Podés verlas y descargarlas aquí:
              </p>

              {/* Descargas web por ZIP */}
              {isShowingDelivery && gallery.allow_download && (
                <>
                  {/* Entrega final completa: por pista de calidad o todo */}
                  {hasTracks ? (
                    <>
                      {byTrack.high_quality.length > 0 && (
                        <button
                          type="button"
                          disabled={zipBusy !== null}
                          onClick={() =>
                            requestZip(
                              "hq",
                              byTrack.high_quality.map((a) => a.id),
                              "original",
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-full border border-gold-300 bg-white px-4 py-1.5 text-xs font-semibold text-gold-800 hover:border-gold-400 disabled:opacity-50 dark:bg-transparent dark:text-gold-200"
                        >
                          {zipBusy === "hq" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          Máxima calidad ({byTrack.high_quality.length})
                        </button>
                      )}
                      {byTrack.social.length > 0 && (
                        <button
                          type="button"
                          disabled={zipBusy !== null}
                          onClick={() =>
                            requestZip(
                              "social",
                              byTrack.social.map((a) => a.id),
                              "web",
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-full border border-gold-300 bg-white px-4 py-1.5 text-xs font-semibold text-gold-800 hover:border-gold-400 disabled:opacity-50 dark:bg-transparent dark:text-gold-200"
                        >
                          {zipBusy === "social" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          Redes sociales ({byTrack.social.length})
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={zipBusy !== null}
                      onClick={() =>
                        requestZip(
                          "todo",
                          visibleAssets.map((a) => a.id),
                          "original",
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-full border border-gold-300 bg-white px-4 py-1.5 text-xs font-semibold text-gold-800 hover:border-gold-400 disabled:opacity-50 dark:bg-transparent dark:text-gold-200"
                    >
                      {zipBusy === "todo" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      Descargar todas ({assets.length})
                    </button>
                  )}
                </>
              )}

              {/* Google Drive */}
              {finalDeliveryDriveLink && (
                <a
                  href={finalDeliveryDriveLink}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-gold-300 bg-white px-4 py-1.5 text-xs font-semibold text-gold-800 hover:border-gold-400 dark:bg-transparent dark:text-gold-200"
                >
                  <Download className="h-3.5 w-3.5" />
                  Google Drive
                </a>
              )}
            </div>

            {isShowingDelivery && gallery.allow_download && (
              <p className="mt-1.5 text-[11px] text-gold-800/80 dark:text-gold-200/70">
                La descarga se prepara en un ZIP y puede tardar un momento según la cantidad de fotos.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Banner informativo — solo en galerías de selección */}
      {!isShowingDelivery && gallery.selection_submitted && (
        <div className="border-b border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
            <Send className="h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="text-[12.5px] text-emerald-900 dark:text-emerald-200">
              Tu selección fue enviada al fotógrafo. Podés seguir agregando o quitando fotos y volver a enviar cuando quieras.
            </p>
          </div>
        </div>
      )}

      {/* Panel de listas — solo en galerías de selección */}
      {!isShowingDelivery && (
        <div className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3">
            <p className="mr-2 text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Tus listas:
            </p>

            {/* Botón "Sin lista" — favoritos generales */}
            <button
              type="button"
              onClick={() => setActiveCollId(null)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors",
                activeCollId === null
                  ? "border-gold-500 bg-gold-50 text-gold-700 dark:border-gold-400 dark:bg-gold-500/15 dark:text-gold-300"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
              )}
            >
              <Heart className="h-3 w-3" fill={activeCollId === null ? "currentColor" : "none"} />
              Favoritas
              <span className="rounded-full bg-zinc-100 px-1.5 text-[10px] font-semibold tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {favs.size}
              </span>
            </button>

            {collections.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCollId(c.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors",
                  c.id === activeCollId
                    ? "border-gold-600 bg-gold-50 text-gold-700 dark:border-gold-500 dark:bg-gold-500/15 dark:text-gold-300"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
                )}
              >
                {c.submitted_at && <Send className="h-3 w-3 text-emerald-500" />}
                {c.name}
                <span className="rounded-full bg-zinc-100 px-1.5 text-[10px] font-semibold tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {c.asset_count}
                </span>
              </button>
            ))}

            {creatingColl ? (
              <div className="inline-flex items-center gap-1">
                <input
                  autoFocus
                  value={newCollName}
                  onChange={(e) => setNewCollName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void createCollection()
                    if (e.key === "Escape") {
                      setCreatingColl(false)
                      setNewCollName("")
                    }
                  }}
                  placeholder="Nombre (ej: Para imprimir)"
                  className="h-7 rounded-full border border-zinc-300 bg-white px-3 text-[12px] text-zinc-900 placeholder:text-zinc-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <button
                  type="button"
                  onClick={() => void createCollection()}
                  disabled={!newCollName.trim()}
                  className="rounded-full bg-gold-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-gold-700 disabled:opacity-50"
                >
                  Crear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingColl(false)
                    setNewCollName("")
                  }}
                  className="rounded-full bg-zinc-200 p-1 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreatingColl(true)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-300 px-3 py-1 text-[12.5px] font-medium text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <Plus className="h-3 w-3" />
                Nueva lista
              </button>
            )}
          </div>
        </div>
      )}

      {gallery.description && (
        <div className="mx-auto max-w-7xl px-4 pt-6">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {gallery.description}
          </p>
        </div>
      )}

      <main id="fotos" className="mx-auto max-w-7xl px-4 py-6">
        {visibleAssets.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            Aún no hay fotos en esta galería.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {visibleAssets.map((a, i) => {
              const marked = isMarked(a.id)
              return (
                <button
                  key={a.id}
                  onClick={() => setOpen(i)}
                  style={
                    a.lqip
                      ? {
                          backgroundImage: `url(${a.lqip})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : undefined
                  }
                  className={cn(
                    "group relative aspect-square overflow-hidden rounded-md bg-zinc-200 transition-all dark:bg-zinc-800",
                    !isShowingDelivery && marked && "ring-2 ring-gold-500 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-zinc-950",
                  )}
                >
                  {a.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.thumbUrl}
                      alt={`Foto ${i + 1}`}
                      loading="lazy"
                      draggable={false}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : null}

                  {/* Corazón de selección — solo en galerías de selección */}
                  {!isShowingDelivery && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation()
                        void toggleHeart(a.id)
                      }}
                      className={cn(
                        "absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full backdrop-blur transition-all",
                        marked
                          ? "bg-gold-500 text-white opacity-100 shadow-md hover:bg-gold-600"
                          : "bg-white/85 text-zinc-700 opacity-0 hover:bg-white group-hover:opacity-100",
                      )}
                      aria-label={marked ? "Quitar de selección" : "Agregar a selección"}
                    >
                      <Heart className="h-4 w-4" fill={marked ? "currentColor" : "none"} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </main>

      {/* Barra fija inferior: estado + opción de notificar al fotógrafo — solo selección */}
      {!isShowingDelivery && canSubmit && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gold-100 text-gold-600 dark:bg-gold-500/20 dark:text-gold-300">
                <Heart className="h-4 w-4" fill="currentColor" />
              </span>
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {selectionCount} foto{selectionCount === 1 ? "" : "s"}{" "}
                  {activeColl ? `en "${activeColl.name}"` : "favoritas"}
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                    <Check className="h-3 w-3" />
                    Guardado
                  </span>
                </p>
                <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400">
                  Cada cambio se guarda automáticamente. Avisá al fotógrafo cuando termines.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void submitActive()}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-gold-500 to-gold-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-105 disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Avisar al fotógrafo
            </button>
          </div>
        </div>
      )}

      {open !== null && visibleAssets[open] && (
        <Lightbox
          asset={visibleAssets[open]}
          index={open}
          total={visibleAssets.length}
          allowDownload={isShowingDelivery ? true : gallery.allow_download}
          isMarked={isShowingDelivery ? false : isMarked(visibleAssets[open].id)}
          locked={isShowingDelivery ? true : (
            !!gallery.selection_locked ||
            (activeColl?.is_locked ?? false)
          )}
          contextLabel={isShowingDelivery ? "Entrega final" : (activeColl ? activeColl.name : "Favoritas")}
          onMark={isShowingDelivery ? undefined : () => toggleHeart(visibleAssets[open].id)}
          onClose={() => setOpen(null)}
          onPrev={() => setOpen((i) => (i === null ? null : Math.max(0, i - 1)))}
          onNext={() =>
            setOpen((i) => (i === null ? null : Math.min(visibleAssets.length - 1, i + 1)))
          }
          onDownload={() => handleDownload(visibleAssets[open].id)}
        />
      )}

      {/* PIN gate para descarga */}
      {pinPrompt && (
        <PinGate
          token={token}
          galleryId={gallery.id}
          onClose={() => setPinPrompt(null)}
          onValidated={(pinId) => {
            const u = new URL(
              `/api/galleries/public/${token}/download/${pinPrompt.assetId}`,
              window.location.origin,
            )
            if (email) u.searchParams.set("email", email)
            u.searchParams.set("pin", pinId)
            setPinPrompt(null)
            window.location.href = u.pathname + u.search
          }}
        />
      )}

      {/* Selección para impresión (si el plan la incluye y está habilitada) */}
      {printState?.enabled && (
        <PrintSelectionPanel
          token={token}
          assets={assets.map((a) => ({ id: a.id, thumbUrl: a.thumbUrl }))}
          initialState={printState}
          clientEmail={email}
          clientName={null}
        />
      )}

      <footer className="mx-auto max-w-7xl px-4 py-8 text-center">
        {studio.footerHtml && (
          <div
            className="mx-auto mb-2 text-xs text-zinc-500 dark:text-zinc-400"
            // El estudio controla este HTML desde su configuración de branding.
            dangerouslySetInnerHTML={{ __html: studio.footerHtml }}
          />
        )}
        {!studio.hideBranding && (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-600">
            Hecho con <span className="font-medium">PixelOS</span>
          </p>
        )}
      </footer>
    </div>
  )
}

// ─── Email prompt ───────────────────────────────────────────────────────────

function EmailPrompt({
  galleryName,
  onSubmit,
}: {
  galleryName: string
  onSubmit: (v: string) => void
}) {
  const [email, setEmail] = useState("")
  return (
    <div className="client-luxe relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div className="bg-luxe-radial pointer-events-none absolute inset-0" />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (email.includes("@")) onSubmit(email.trim().toLowerCase())
        }}
        className="lx-card animate-fade-in-up relative w-full max-w-sm p-8 text-center"
      >
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-white shadow-luxe">
          <ImageIcon className="h-5 w-5" />
        </div>
        <p className="lx-overline mb-2">Tu galería</p>
        <h1 className="font-serif text-2xl font-semibold text-foreground">
          {galleryName}
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Ingresa tu email para acceder a las fotos y guardar tu selección.
        </p>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
          className="sf-input-focus mt-6 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-center text-sm text-foreground focus:outline-none"
        />
        <button type="submit" className="lx-btn-gold mt-4 w-full">
          Ver mis fotos
        </button>
      </form>
    </div>
  )
}

// ─── Lightbox ───────────────────────────────────────────────────────────────

function Lightbox({
  asset,
  index,
  total,
  allowDownload,
  isMarked,
  locked,
  contextLabel,
  onMark,
  onClose,
  onPrev,
  onNext,
  onDownload,
}: {
  asset: Asset
  index: number
  total: number
  allowDownload: boolean
  isMarked: boolean
  locked: boolean
  contextLabel: string
  onMark?: () => void
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onDownload: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex items-center justify-between p-4 text-sm text-white">
        <span className="tabular-nums opacity-70">
          {index + 1} / {total}
        </span>
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {!locked && onMark && (
            <button
              onClick={onMark}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                isMarked
                  ? "bg-gold-500 text-white hover:bg-gold-600"
                  : "bg-white/15 text-white hover:bg-white/25",
              )}
              title={`${isMarked ? "Quitar de" : "Agregar a"} ${contextLabel}`}
            >
              <Heart className="h-4 w-4" fill={isMarked ? "currentColor" : "none"} />
              {isMarked ? "En selección" : "Seleccionar"}
            </button>
          )}
          {allowDownload && (
            <button
              onClick={onDownload}
              className="rounded-md p-2 hover:bg-white/15"
              aria-label="Descargar"
            >
              <Download className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-md p-2 hover:bg-white/15"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-4 pb-4">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onPrev()
          }}
          className="absolute left-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          aria-label="Anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        {asset.webUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.webUrl}
            alt=""
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80vh] max-w-[60vw] w-auto h-auto object-contain rounded-lg shadow-2xl"
          />
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onNext()
          }}
          className="absolute right-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          aria-label="Siguiente"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

// ─── PIN Gate (descarga sin marca de agua) ─────────────────────────────────

function PinGate({
  token,
  galleryId,
  onClose,
  onValidated,
}: {
  token: string
  galleryId: string
  onClose: () => void
  onValidated: (pinId: string) => void
}) {
  const [pin, setPin] = useState("")
  const [pending, setPending] = useState(false)

  const submit = async () => {
    if (!pin.trim()) return
    setPending(true)
    try {
      onValidated(pin.trim().toUpperCase())
    } finally {
      setPending(false)
    }
  }

  void galleryId
  void token

  return (
    <div className="client-luxe fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="lx-card w-full max-w-sm p-6">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-white">
          <KeyRound className="h-5 w-5" />
        </div>
        <h3 className="font-serif text-lg font-semibold text-foreground">
          Ingresa tu PIN de descarga
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Tu fotógrafo te dio un código para descargar las fotos sin marca de agua.
        </p>
        <input
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          placeholder="ABCDEFGH"
          className="sf-input-focus mt-4 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-center font-mono text-lg uppercase tracking-widest text-foreground focus:outline-none"
        />
        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="lx-btn-outline flex-1 !py-2.5 text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={() => void submit()}
            disabled={pending || !pin.trim()}
            className="lx-btn-gold flex-1 !py-2.5 text-sm disabled:opacity-50"
          >
            {pending ? "Validando…" : "Descargar"}
          </button>
        </div>
      </div>
    </div>
  )
}
