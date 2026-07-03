"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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

// ── Paleta editorial (aprobada por el cliente) ──────────────────────────────
const ED = {
  paper: "#FAF8F4", // porcelana cálida
  paper2: "#F3EFE7",
  ink: "#1D1A16", // casi negro cálido
  muted: "#8C8478",
  line: "#E6E0D3",
  gold: "#A9884E",
}
const SERIF = "var(--font-serif), 'Playfair Display', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif"

/** Mensaje de agradecimiento del estudio — se muestra cuando la dedicatoria
 *  está habilitada pero la madre no escribió su texto. */
const DEFAULT_THANKYOU =
  "Gracias por confiar en nosotros para capturar este momento tan especial. Fue un privilegio ser parte de tu historia, y esperamos que estas fotografías guarden para siempre la alegría de este día."

/** Cadencia editorial tipo revista: pares, tríos y una foto sola de vez en cuando. */
const EDITORIAL_CADENCE = [2, 3, 2, 1]
function chunkEditorial<T>(items: T[]): { n: number; items: T[] }[] {
  const rows: { n: number; items: T[] }[] = []
  let i = 0
  let c = 0
  while (i < items.length) {
    const n = EDITORIAL_CADENCE[c % EDITORIAL_CADENCE.length]!
    rows.push({ n, items: items.slice(i, i + n) })
    i += n
    c++
  }
  return rows
}

/** Portada editorial (revista): imagen de estudio + overline + título serif grande. */
function EditorialCover({
  gallery,
  cover,
  studio,
  label,
  ctaLabel,
  photoCount,
}: {
  gallery: Gallery
  cover: ReturnType<typeof resolveCoverConfig>
  studio: Studio
  label: string
  ctaLabel: string
  photoCount: number
}) {
  const candidates = [
    cover.imageUrl || null,
    gallery.coverWebUrl,
    gallery.coverThumbUrl,
  ].filter((u): u is string => !!u)
  const [imgIdx, setImgIdx] = useState(0)
  const bg = candidates[Math.min(imgIdx, candidates.length - 1)] ?? null
  const hasImg = !!bg
  const title = cover.title || gallery.name
  const dateLabel =
    cover.subtitle ||
    gallery.subtitle ||
    (gallery.eventDate ? formatEventDate(gallery.eventDate) : null)
  const fx = (cover.focalX ?? 0.5) * 100
  const fy = (cover.focalY ?? 0.5) * 100

  return (
    <header
      className={cn(
        "relative flex min-h-[86svh] flex-col items-center justify-center overflow-hidden px-6 text-center",
        hasImg ? "text-white" : "",
      )}
      style={hasImg ? undefined : { background: ED.paper, color: ED.ink }}
    >
      {hasImg && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bg!}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: `${fx}% ${fy}%` }}
            onError={() => setImgIdx((i) => (i < candidates.length - 1 ? i + 1 : i))}
          />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(15,13,11,.24), rgba(15,13,11,.5))" }}
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(120% 92% at 50% 42%, transparent 50%, rgba(12,10,8,.55))" }}
          />
        </>
      )}

      {/* Wordmark del estudio */}
      <div className="absolute left-0 right-0 top-7 z-10 flex items-center justify-center">
        {studio.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={studio.logoUrl}
            alt={studio.name}
            className="h-7 w-auto opacity-90"
            style={hasImg ? { filter: "brightness(0) invert(1)" } : undefined}
          />
        ) : (
          <span
            className="uppercase"
            style={{ fontFamily: SERIF, letterSpacing: "0.36em", fontSize: "0.72rem" }}
          >
            {studio.name}
          </span>
        )}
      </div>

      <div className="animate-fade-in-up relative z-10 max-w-3xl">
        <p
          className="mb-4 font-semibold uppercase"
          style={{
            letterSpacing: "0.34em",
            fontSize: "0.7rem",
            color: hasImg ? "rgba(255,255,255,.82)" : ED.gold,
          }}
        >
          {label}
        </p>
        <h1
          className="text-balance"
          style={{
            fontFamily: SERIF,
            fontWeight: 500,
            lineHeight: 0.98,
            letterSpacing: "0.01em",
            fontSize: "clamp(3.2rem, 10vw, 7.5rem)",
            textShadow: hasImg ? "0 2px 30px rgba(0,0,0,.28)" : "none",
          }}
        >
          {title}
        </h1>
        <div
          className="mt-6 flex items-center justify-center gap-3 uppercase"
          style={{
            letterSpacing: "0.16em",
            fontSize: "0.78rem",
            color: hasImg ? "rgba(255,255,255,.82)" : ED.muted,
          }}
        >
          {dateLabel && (
            <>
              <span>{dateLabel}</span>
              <span className="opacity-40">—</span>
            </>
          )}
          <span>
            {photoCount} {photoCount === 1 ? "imagen" : "imágenes"}
          </span>
        </div>
      </div>

      <a
        href="#fotos"
        className="absolute bottom-8 left-0 right-0 z-10 mx-auto flex w-fit flex-col items-center gap-3 uppercase"
        style={{
          letterSpacing: "0.3em",
          fontSize: "0.62rem",
          color: hasImg ? "rgba(255,255,255,.72)" : ED.muted,
        }}
      >
        <span>{ctaLabel}</span>
        <span
          className="h-10 w-px"
          style={{
            background: hasImg
              ? "linear-gradient(rgba(255,255,255,.72), transparent)"
              : "linear-gradient(#8C8478, transparent)",
          }}
        />
      </a>
    </header>
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
  deliveryOnly = false,
  suggestedSelectionName = null,
  motherMessage = null,
  motherMessageFrom = null,
  motherMessageEnabled = false,
}: {
  token: string
  gallery: Gallery
  assets: Asset[]
  studio: Studio
  printState?: GalleryPrintState | null
  deliveryReady?: boolean
  finalDeliveryDriveLink?: string | null
  /** Vista de SOLO entrega final (link de descarga): oculta toda la selección. */
  deliveryOnly?: boolean
  /** Nombre de la quinceañera (del proyecto) para prellenar el nombre de la lista. */
  suggestedSelectionName?: string | null
  /** Dedicatoria de la madre a la quinceañera (se muestra en la entrega). */
  motherMessage?: string | null
  motherMessageFrom?: string | null
  /** Si el estudio habilitó el bloque de dedicatoria/agradecimiento. */
  motherMessageEnabled?: boolean
}) {
  const [favs, setFavs] = useState<Set<string>>(new Set())
  // Assets que el usuario tocó localmente — `loadFavs` no debe pisarlos con
  // datos viejos de un GET en vuelo (causaba que el corazón se quitara solo).
  const dirtyFavsRef = useRef<Set<string>>(new Set())
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
      if (data.favorites) {
        const server = data.favorites
        setFavs((prev) => {
          const next = new Set(server)
          // Preservar toggles locales recientes: si un GET lento resuelve
          // después de que el usuario marcó/desmarcó, no lo revertimos.
          for (const id of dirtyFavsRef.current) {
            if (prev.has(id)) next.add(id)
            else next.delete(id)
          }
          return next
        })
      }
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
      // Bloqueo del fotógrafo: ya empezó a editar → el cliente no puede tocar.
      if (gallery.selection_locked) {
        toast.error("El fotógrafo ya está editando — la selección está bloqueada por ahora")
        return
      }
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
      // Marcar como "tocado localmente" para que un loadFavs en vuelo no lo pise.
      dirtyFavsRef.current.add(assetId)
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
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error === "locked" ? "locked" : `HTTP ${res.status}`)
        }
        const j = (await res.json()) as { favorited?: boolean }
        setFavs((prev) => {
          const next = new Set(prev)
          if (j.favorited) next.add(assetId)
          else next.delete(assetId)
          return next
        })
      } catch (err) {
        // Revertir al estado PREVIO al click (no borrar a ciegas).
        setFavs((prev) => {
          const next = new Set(prev)
          if (wasFav) next.add(assetId)
          else next.delete(assetId)
          return next
        })
        toast.error(
          err instanceof Error && err.message === "locked"
            ? "El fotógrafo ya está editando — la selección está bloqueada por ahora"
            : "No se pudo guardar",
        )
      }
    },
    [activeColl, favs, email, token, loadCollections, gallery.selection_locked],
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
          // Rotula la selección con el nombre (de la quinceañera) para que el
          // fotógrafo distinga cada selección cuando el cliente hace varias.
          clientName: newCollName.trim(),
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
  // En modo "solo entrega" NO se muestra el toggle ni nada de selección.
  const showBothSections = !deliveryOnly && hasSelection && hasTracks && deliveryReady
  // Default SIEMPRE en "selección": aunque la entrega esté lista, el cliente
  // debe poder seguir viendo todas sus fotos y re-seleccionar. El toggle da
  // acceso a la entrega final cuando existe.
  const [activeSection, setActiveSection] = useState<"selection" | "delivery">(
    "selection",
  )
  const isShowingDelivery = deliveryOnly
    ? hasTracks
    : activeSection === "delivery" && hasTracks && deliveryReady
  const visibleAssets = isShowingDelivery
    ? deliveryAssets.length > 0
      ? deliveryAssets
      : assets
    : selectionAssets.length > 0
      ? selectionAssets
      : assets

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

  // Tile de foto (respeta la forma real, sin recorte cuadrado). Mantiene el
  // corazón de selección y abre el lightbox.
  const renderTile = (a: Asset, i: number) => {
    const marked = !isShowingDelivery && !deliveryOnly && isMarked(a.id)
    const ar = a.width && a.height ? `${a.width}/${a.height}` : "4/5"
    return (
      <figure
        key={a.id}
        role="button"
        tabIndex={0}
        onClick={() => setOpen(i)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setOpen(i)
          }
        }}
        className="group relative m-0 cursor-pointer overflow-hidden"
        style={{
          aspectRatio: ar,
          background: a.lqip ? undefined : "#efeae1",
          backgroundImage: a.lqip ? `url(${a.lqip})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          boxShadow: marked ? `0 0 0 2px ${ED.gold}` : "0 24px 46px -30px rgba(40,34,24,.34)",
        }}
      >
        {a.thumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.thumbUrl}
            alt=""
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          />
        )}
        {!isShowingDelivery && !deliveryOnly && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              void toggleHeart(a.id)
            }}
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full backdrop-blur transition-all active:scale-90"
            style={marked ? { background: ED.gold, color: "#fff" } : { background: "rgba(255,255,255,.92)", color: ED.ink }}
            aria-label={marked ? "Quitar de selección" : "Agregar a selección"}
          >
            <Heart className="h-[18px] w-[18px]" fill={marked ? "currentColor" : "none"} />
          </button>
        )}
      </figure>
    )
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: ED.paper, color: ED.ink, fontFamily: tokens.fontStack }}>
      <EditorialCover
        gallery={gallery}
        cover={cover}
        studio={studio}
        label={isShowingDelivery ? "Entrega final" : "Galería"}
        ctaLabel={isShowingDelivery ? "Ver y descargar" : "Ver fotos"}
        photoCount={visibleAssets.length}
      />

      {/* Barra fina superior: estudio + controles (sin selección en modo entrega) */}
      <header
        className="sticky top-0 z-20 backdrop-blur"
        style={{ background: "rgba(250,248,244,.86)", borderBottom: `1px solid ${ED.line}` }}
      >
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            {studio.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={studio.logoUrl} alt={studio.name} className="h-6 w-auto" />
            ) : (
              <span className="uppercase" style={{ fontFamily: SERIF, letterSpacing: "0.3em", fontSize: "0.72rem", color: ED.ink }}>
                {studio.name}
              </span>
            )}
            <span
              className="hidden truncate uppercase sm:inline"
              style={{ color: ED.muted, fontSize: "0.74rem", letterSpacing: "0.14em" }}
            >
              {gallery.name}
            </span>
          </div>

          {showBothSections ? (
            <div className="flex items-center gap-1 rounded-full p-0.5" style={{ border: `1px solid ${ED.line}`, background: "#fff" }}>
              <button
                type="button"
                onClick={() => { setActiveSection("selection"); setOpen(null) }}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors"
                style={activeSection === "selection" ? { background: ED.ink, color: "#F7F3EC" } : { color: ED.muted }}
              >
                <Heart className="h-3 w-3" fill={activeSection === "selection" ? "currentColor" : "none"} />
                Selección
              </button>
              <button
                type="button"
                onClick={() => { setActiveSection("delivery"); setOpen(null) }}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors"
                style={activeSection === "delivery" ? { background: ED.ink, color: "#F7F3EC" } : { color: ED.muted }}
              >
                <Download className="h-3 w-3" />
                Entrega
              </button>
            </div>
          ) : isShowingDelivery ? (
            <span className="inline-flex items-center gap-1.5 uppercase" style={{ color: ED.gold, fontSize: "0.7rem", letterSpacing: "0.2em" }}>
              <Download className="h-3.5 w-3.5" />
              Entrega final
            </span>
          ) : !deliveryOnly ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium"
              style={{ background: "#fff", border: `1px solid ${ED.line}`, color: ED.gold }}
            >
              <Heart className="h-3.5 w-3.5" fill="currentColor" />
              {selectionCount}
            </span>
          ) : null}
        </div>
      </header>

      {/* Cuota — solo en galerías de SELECCIÓN */}
      {!isShowingDelivery && !deliveryOnly && quota && quota.included !== null && (
        <div style={{ borderBottom: `1px solid ${ED.line}`, background: quota.extras > 0 ? "#FBF3E6" : ED.paper2 }}>
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-3 px-6 py-3">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold"
              style={{ background: "#fff", border: `1px solid ${ED.line}`, color: ED.ink }}
            >
              {quota.selected} / {quota.included}{" "}
              {quota.packageName ? `· ${quota.packageName}` : "incluidas"}
            </span>
            {quota.extras > 0 ? (
              <p className="text-[12.5px]" style={{ color: "#8a6d2f" }}>
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
              <p className="text-[12.5px]" style={{ color: ED.muted }}>
                Te quedan <strong>{quota.remaining}</strong> dentro de tu paquete.
                Si eliges más, contarán como extras.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Descargas de entrega final */}
      {((isShowingDelivery && gallery.allow_download) || !!finalDeliveryDriveLink) && (
        <div style={{ borderBottom: `1px solid ${ED.line}`, background: "#fff" }}>
          <div className="mx-auto max-w-[1240px] px-6 py-6">
            <p className="mb-3 font-semibold uppercase" style={{ color: ED.gold, fontSize: "0.68rem", letterSpacing: "0.28em" }}>
              Descarga tus fotos
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              {isShowingDelivery && gallery.allow_download && (
                hasTracks ? (
                  <>
                    {byTrack.high_quality.length > 0 && (
                      <button
                        type="button"
                        disabled={zipBusy !== null}
                        onClick={() => requestZip("hq", byTrack.high_quality.map((a) => a.id), "original")}
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-[0.8rem] font-semibold transition-opacity disabled:opacity-50"
                        style={{ background: ED.ink, color: "#F7F3EC", border: `1px solid ${ED.ink}` }}
                      >
                        {zipBusy === "hq" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        Máxima calidad ({byTrack.high_quality.length})
                      </button>
                    )}
                    {byTrack.social.length > 0 && (
                      <button
                        type="button"
                        disabled={zipBusy !== null}
                        onClick={() => requestZip("social", byTrack.social.map((a) => a.id), "web")}
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-[0.8rem] font-semibold transition-colors disabled:opacity-50"
                        style={{ background: "#fff", color: ED.ink, border: `1px solid ${ED.ink}` }}
                      >
                        {zipBusy === "social" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        Redes sociales ({byTrack.social.length})
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={zipBusy !== null}
                    onClick={() => requestZip("todo", visibleAssets.map((a) => a.id), "original")}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-[0.8rem] font-semibold transition-opacity disabled:opacity-50"
                    style={{ background: ED.ink, color: "#F7F3EC", border: `1px solid ${ED.ink}` }}
                  >
                    {zipBusy === "todo" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Descargar todas ({visibleAssets.length})
                  </button>
                )
              )}

              {finalDeliveryDriveLink && (
                <a
                  href={finalDeliveryDriveLink}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-[0.8rem] font-semibold transition-colors"
                  style={{ background: "#fff", color: ED.ink, border: `1px solid ${ED.ink}` }}
                >
                  <Download className="h-3.5 w-3.5" />
                  Google Drive
                </a>
              )}
            </div>

            {isShowingDelivery && gallery.allow_download && (
              <p className="mt-3 text-[11.5px]" style={{ color: ED.muted }}>
                Se guardan directamente en tu teléfono. El ZIP puede tardar un momento según la cantidad de fotos.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Selección bloqueada por el fotógrafo */}
      {!isShowingDelivery && !deliveryOnly && gallery.selection_locked && (
        <div style={{ borderBottom: `1px solid ${ED.line}`, background: "#FBF3E6" }}>
          <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-6 py-3">
            <p className="text-[12.5px]" style={{ color: "#8a6d2f" }}>
              🔒 El fotógrafo ya comenzó a editar tu selección, por eso está bloqueada por ahora. Si necesitas un cambio, escríbele.
            </p>
          </div>
        </div>
      )}

      {/* Selección enviada */}
      {!isShowingDelivery && !deliveryOnly && gallery.selection_submitted && !gallery.selection_locked && (
        <div style={{ borderBottom: `1px solid ${ED.line}`, background: ED.paper2 }}>
          <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-6 py-3">
            <Send className="h-4 w-4 flex-shrink-0" style={{ color: ED.gold }} />
            <p className="text-[12.5px]" style={{ color: ED.ink }}>
              Tu selección fue enviada al fotógrafo. Podés seguir agregando o quitando fotos y volver a enviar cuando quieras.
            </p>
          </div>
        </div>
      )}

      {/* Panel de listas — solo en galerías de selección */}
      {!isShowingDelivery && !deliveryOnly && (
        <div style={{ borderBottom: `1px solid ${ED.line}`, background: "#fff" }}>
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-2 px-6 py-3.5">
            <p className="mr-2 font-semibold uppercase" style={{ color: ED.muted, fontSize: "0.66rem", letterSpacing: "0.2em" }}>
              Selecciones
            </p>

            <button
              type="button"
              onClick={() => setActiveCollId(null)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors"
              style={activeCollId === null ? { background: ED.paper2, border: `1px solid ${ED.gold}`, color: ED.gold } : { background: "#fff", border: `1px solid ${ED.line}`, color: ED.ink }}
            >
              <Heart className="h-3 w-3" fill={activeCollId === null ? "currentColor" : "none"} />
              Favoritas
              <span className="rounded-full px-1.5 text-[10px] font-semibold tabular-nums" style={{ background: ED.paper2, color: ED.muted }}>
                {favs.size}
              </span>
            </button>

            {collections.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCollId(c.id)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors"
                style={c.id === activeCollId ? { background: ED.paper2, border: `1px solid ${ED.gold}`, color: ED.gold } : { background: "#fff", border: `1px solid ${ED.line}`, color: ED.ink }}
              >
                {c.submitted_at && <Send className="h-3 w-3" style={{ color: ED.gold }} />}
                {c.name}
                <span className="rounded-full px-1.5 text-[10px] font-semibold tabular-nums" style={{ background: ED.paper2, color: ED.muted }}>
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
                  placeholder="Nombre de la quinceañera"
                  className="h-8 rounded-full px-3 text-[12px] focus:outline-none"
                  style={{ border: `1px solid ${ED.line}`, background: "#fff", color: ED.ink }}
                />
                <button
                  type="button"
                  onClick={() => void createCollection()}
                  disabled={!newCollName.trim()}
                  className="rounded-full px-3 py-1 text-[11px] font-medium disabled:opacity-50"
                  style={{ background: ED.ink, color: "#F7F3EC" }}
                >
                  Crear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingColl(false)
                    setNewCollName("")
                  }}
                  className="rounded-full p-1"
                  style={{ background: ED.paper2, color: ED.muted }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  // Prellenar con el nombre de la quinceañera (si el proyecto lo
                  // tiene) para que la selección quede rotulada con su nombre.
                  if (!newCollName && suggestedSelectionName) {
                    setNewCollName(suggestedSelectionName)
                  }
                  setCreatingColl(true)
                }}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors"
                style={{ border: `1px dashed ${ED.line}`, color: ED.muted }}
              >
                <Plus className="h-3 w-3" />
                Nueva selección
              </button>
            )}
          </div>
        </div>
      )}

      {gallery.description && (
        <div className="mx-auto max-w-2xl px-6 pt-16 text-center">
          <p
            className="text-balance"
            style={{ fontFamily: SERIF, fontSize: "clamp(1.2rem,2.4vw,1.6rem)", lineHeight: 1.5, color: "#413b32" }}
          >
            {gallery.description}
          </p>
        </div>
      )}

      {/* Dedicatoria de la madre (si escribió) o agradecimiento del estudio —
          se muestra solo si el estudio habilitó el bloque. */}
      {motherMessageEnabled &&
        (() => {
          const msg = motherMessage?.trim() ?? ""
          const isDedication = msg.length > 0
          const text = isDedication ? msg : DEFAULT_THANKYOU
          const sign = isDedication ? motherMessageFrom?.trim() ?? "" : studio.name
          return (
            <figure className="mx-auto max-w-2xl px-6 pt-16 text-center">
              <p
                className="font-semibold uppercase"
                style={{ color: ED.gold, fontSize: "0.66rem", letterSpacing: "0.24em" }}
              >
                {isDedication ? "Dedicatoria" : "Gracias"}
              </p>
              <blockquote
                className="mt-5 text-balance"
                style={{
                  fontFamily: SERIF,
                  fontStyle: "italic",
                  fontSize: "clamp(1.35rem,3vw,2rem)",
                  lineHeight: 1.5,
                  color: "#3a332b",
                }}
              >
                “{text}”
              </blockquote>
              {sign && (
                <figcaption
                  className="mt-5"
                  style={{ fontFamily: SERIF, fontSize: "1.05rem", color: ED.gold }}
                >
                  — {sign}
                </figcaption>
              )}
              <div
                className="mx-auto mt-8 h-px w-16"
                style={{ background: ED.line }}
                aria-hidden
              />
            </figure>
          )
        })()}

      {/* Flujo editorial: pares, tríos y una foto sola de vez en cuando.
          En móvil, 1 foto grande por fila. Respeta la forma real de la foto. */}
      <main id="fotos" className="mx-auto max-w-[1240px] px-4 py-14 sm:px-6 sm:py-20">
        {visibleAssets.length === 0 ? (
          <p className="py-16 text-center text-sm" style={{ color: ED.muted }}>
            Aún no hay fotos en esta galería.
          </p>
        ) : (
          <div className="flex flex-col gap-6 sm:gap-9">
            {chunkEditorial(visibleAssets.map((a, i) => ({ a, i }))).map((row, r) => {
              if (row.n === 1) {
                const first = row.items[0]!
                return (
                  <div key={r} className="mx-auto w-full max-w-[540px] py-2 sm:py-6">
                    {renderTile(first.a, first.i)}
                  </div>
                )
              }
              return (
                <div
                  key={r}
                  className={cn(
                    "grid grid-cols-1 items-start gap-4 sm:gap-6",
                    row.n === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
                  )}
                >
                  {row.items.map(({ a, i }) => renderTile(a, i))}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Barra fija: estado + avisar al fotógrafo — solo selección */}
      {!isShowingDelivery && !deliveryOnly && canSubmit && (
        <div className="fixed bottom-0 left-0 right-0 z-30 backdrop-blur" style={{ background: "rgba(255,255,255,.96)", borderTop: `1px solid ${ED.line}` }}>
          <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-3 px-6 py-3.5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full" style={{ background: ED.paper2, color: ED.gold }}>
                <Heart className="h-4 w-4" fill="currentColor" />
              </span>
              <div>
                <p className="text-sm font-semibold" style={{ color: ED.ink }}>
                  {selectionCount} foto{selectionCount === 1 ? "" : "s"}{" "}
                  {activeColl ? `en "${activeColl.name}"` : "favoritas"}
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: ED.paper2, color: ED.gold }}>
                    <Check className="h-3 w-3" />
                    Guardado
                  </span>
                </p>
                <p className="text-[11.5px]" style={{ color: ED.muted }}>
                  Cada cambio se guarda automáticamente. Avisá al fotógrafo cuando termines.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void submitActive()}
              disabled={submitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60"
              style={{ background: ED.ink, color: "#F7F3EC" }}
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

      <footer className="mx-auto max-w-[1240px] px-6 pb-24 pt-6 text-center">
        <div className="mx-auto mb-7 h-px w-14" style={{ background: ED.gold }} />
        {studio.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={studio.logoUrl} alt={studio.name} className="mx-auto mb-3 h-7 w-auto" />
        ) : (
          <p className="uppercase" style={{ fontFamily: SERIF, letterSpacing: "0.4em", fontSize: "0.82rem", color: ED.ink }}>
            {studio.name}
          </p>
        )}
        {studio.footerHtml && (
          <div
            className="mx-auto mb-2 mt-1 text-xs"
            style={{ color: ED.muted }}
            // El estudio controla este HTML desde su configuración de branding.
            dangerouslySetInnerHTML={{ __html: studio.footerHtml }}
          />
        )}
        {!studio.hideBranding && (
          <p className="mt-3 uppercase" style={{ fontSize: "0.64rem", letterSpacing: "0.22em", color: ED.muted }}>
            Hecho con PixelOS
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
  const touchX = useRef<number | null>(null)
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col backdrop-blur-sm"
      style={{ background: "rgba(18,15,12,.94)" }}
      onClick={onClose}
    >
      <div className="flex items-center justify-between px-4 py-4 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="tabular-nums uppercase" style={{ letterSpacing: "0.14em", fontSize: "0.72rem", color: "rgba(255,255,255,.66)" }}>
          {index + 1} / {total}
        </span>
        <div className="flex items-center gap-1.5">
          {!locked && onMark && (
            <button
              onClick={onMark}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors"
              style={isMarked ? { background: ED.gold, color: "#fff" } : { background: "rgba(255,255,255,.14)", color: "#fff" }}
              title={`${isMarked ? "Quitar de" : "Agregar a"} ${contextLabel}`}
            >
              <Heart className="h-4 w-4" fill={isMarked ? "currentColor" : "none"} />
              {isMarked ? "En selección" : "Seleccionar"}
            </button>
          )}
          {allowDownload && (
            <button onClick={onDownload} className="rounded-full p-2 hover:bg-white/15" aria-label="Descargar">
              <Download className="h-4 w-4" />
            </button>
          )}
          <button onClick={onClose} className="rounded-full p-2 hover:bg-white/15" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        className="relative flex flex-1 items-center justify-center px-2 pb-4 sm:px-4"
        onTouchStart={(e) => {
          touchX.current = e.touches[0]?.clientX ?? null
        }}
        onTouchEnd={(e) => {
          const start = touchX.current
          touchX.current = null
          if (start == null) return
          const end = e.changedTouches[0]?.clientX ?? start
          const dx = end - start
          if (Math.abs(dx) > 45) {
            if (dx < 0) onNext()
            else onPrev()
          }
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            onPrev()
          }}
          className="absolute left-2 z-10 rounded-full p-2.5 text-white transition-colors hover:bg-white/15 sm:left-5"
          aria-label="Anterior"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        {asset.webUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.webUrl}
            alt=""
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            className="h-auto max-h-[84vh] w-auto max-w-[94vw] object-contain shadow-2xl sm:max-w-[80vw]"
          />
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onNext()
          }}
          className="absolute right-2 z-10 rounded-full p-2.5 text-white transition-colors hover:bg-white/15 sm:right-5"
          aria-label="Siguiente"
        >
          <ChevronRight className="h-6 w-6" />
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
