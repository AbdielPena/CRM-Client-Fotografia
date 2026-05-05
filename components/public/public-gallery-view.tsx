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
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils/cn"

type Asset = {
  id: string
  width: number | null
  height: number | null
  thumbUrl: string | null
  webUrl: string | null
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

type Studio = { name: string; logoUrl: string | null }

export function PublicGalleryView({
  token,
  gallery,
  assets,
  studio,
}: {
  token: string
  gallery: Gallery
  assets: Asset[]
  studio: Studio
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

  // Restore email from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return
    const saved = window.localStorage.getItem(`gallery_email_${gallery.id}`)
    if (saved) {
      setEmail(saved)
      setEmailPrompt(false)
    }
  }, [gallery.id])

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
          `¿Enviar tu selección de ${favs.size} foto${favs.size === 1 ? "" : "s"}? Una vez enviada no podrás modificarla.`,
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

  // Keyboard navigation in lightbox
  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null)
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? null : Math.max(0, i - 1)))
      if (e.key === "ArrowRight")
        setOpen((i) => (i === null ? null : Math.min(assets.length - 1, i + 1)))
      if ((e.key === "f" || e.key === "F") && open !== null) {
        void toggleHeart(assets[open].id)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, assets, toggleHeart])

  if (emailPrompt) {
    return <EmailPrompt galleryName={gallery.name} onSubmit={saveEmail} />
  }

  // Conteo + flag para barra inferior — el cliente puede enviar/re-enviar siempre
  const selectionCount = activeColl ? activeColl.asset_count : favs.size
  const canSubmit = selectionCount > 0

  return (
    <div className="min-h-screen bg-zinc-50 pb-24 dark:bg-zinc-950">
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
                {studio.name} · {assets.length} fotos
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-[12.5px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
            <Heart className="h-3.5 w-3.5" fill="currentColor" />
            {selectionCount}
          </span>
        </div>
      </header>

      {/* Banner de cuota — solo si el paquete tiene límite definido */}
      {quota && quota.included !== null && (
        <div
          className={`border-b ${
            quota.extras > 0
              ? "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10"
              : "border-blue-200 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10"
          }`}
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${
                quota.extras > 0
                  ? "bg-amber-200 text-amber-900 dark:bg-amber-500/30 dark:text-amber-200"
                  : "bg-blue-200 text-blue-900 dark:bg-blue-500/30 dark:text-blue-200"
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
              <p className="text-[12.5px] text-blue-900 dark:text-blue-200">
                Te quedan <strong>{quota.remaining}</strong> dentro de tu paquete.
                Si elegís más, contarán como extras.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Banner informativo — sin bloquear: el cliente puede modificar y reenviar */}
      {gallery.selection_submitted && (
        <div className="border-b border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
            <Send className="h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="text-[12.5px] text-emerald-900 dark:text-emerald-200">
              Tu selección fue enviada al fotógrafo. Podés seguir agregando o quitando fotos y volver a enviar cuando quieras.
            </p>
          </div>
        </div>
      )}

      {/* Panel de listas — siempre visible y editable */}
      {true && (
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
                  ? "border-rose-500 bg-rose-50 text-rose-700 dark:border-rose-400 dark:bg-rose-500/15 dark:text-rose-300"
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
                    ? "border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-500/15 dark:text-blue-300"
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
                  className="h-7 rounded-full border border-zinc-300 bg-white px-3 text-[12px] text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <button
                  type="button"
                  onClick={() => void createCollection()}
                  disabled={!newCollName.trim()}
                  className="rounded-full bg-blue-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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

      <main className="mx-auto max-w-7xl px-4 py-6">
        {assets.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            Aún no hay fotos en esta galería.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {assets.map((a, i) => {
              const marked = isMarked(a.id)
              return (
                <button
                  key={a.id}
                  onClick={() => setOpen(i)}
                  className={cn(
                    "group relative aspect-square overflow-hidden rounded-md bg-zinc-200 transition-all dark:bg-zinc-800",
                    marked && "ring-2 ring-rose-500 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-zinc-950",
                  )}
                >
                  {a.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.thumbUrl}
                      alt=""
                      loading="lazy"
                      draggable={false}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : null}

                  {/* Único botón = corazón */}
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
                        ? "bg-rose-500 text-white opacity-100 shadow-md hover:bg-rose-600"
                        : "bg-white/85 text-zinc-700 opacity-0 hover:bg-white group-hover:opacity-100",
                    )}
                    aria-label={marked ? "Quitar de selección" : "Agregar a selección"}
                  >
                    <Heart className="h-4 w-4" fill={marked ? "currentColor" : "none"} />
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </main>

      {/* Barra fija inferior: estado + opción de notificar al fotógrafo */}
      {canSubmit && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300">
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
              className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-700 disabled:opacity-60"
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

      {open !== null && assets[open] && (
        <Lightbox
          asset={assets[open]}
          index={open}
          total={assets.length}
          allowDownload={gallery.allow_download}
          isMarked={isMarked(assets[open].id)}
          locked={
            !!gallery.selection_submitted ||
            !!gallery.selection_locked ||
            (activeColl?.is_locked ?? false)
          }
          contextLabel={activeColl ? activeColl.name : "Favoritas"}
          onMark={() => toggleHeart(assets[open].id)}
          onClose={() => setOpen(null)}
          onPrev={() => setOpen((i) => (i === null ? null : Math.max(0, i - 1)))}
          onNext={() =>
            setOpen((i) => (i === null ? null : Math.min(assets.length - 1, i + 1)))
          }
          onDownload={() => handleDownload(assets[open].id)}
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
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (email.includes("@")) onSubmit(email.trim().toLowerCase())
        }}
        className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          {galleryName}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Ingresa tu email para acceder a las fotos y guardar tu selección.
        </p>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
          className="mt-6 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="submit"
          className="mt-4 w-full rounded-md bg-blue-600 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Ver fotos
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
  onMark: () => void
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
          {!locked && (
            <button
              onClick={onMark}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                isMarked
                  ? "bg-rose-500 text-white hover:bg-rose-600"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 dark:bg-zinc-900">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300">
          <KeyRound className="h-5 w-5" />
        </div>
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Ingresa tu PIN de descarga
        </h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Tu fotógrafo te dio un código para descargar las fotos sin marca de agua.
        </p>
        <input
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          placeholder="ABCDEFGH"
          className="mt-4 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-lg uppercase tracking-widest text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-md bg-zinc-100 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200"
          >
            Cancelar
          </button>
          <button
            onClick={() => void submit()}
            disabled={pending || !pin.trim()}
            className="flex-1 rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "Validando…" : "Descargar"}
          </button>
        </div>
      </div>
    </div>
  )
}
