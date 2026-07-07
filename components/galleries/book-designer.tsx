"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Reorder, useDragControls } from "framer-motion"
import {
  ArrowLeft,
  ExternalLink,
  GripVertical,
  Plus,
  Copy,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
  Images,
  LayoutGrid,
} from "lucide-react"
import { toast } from "sonner"

import { updateGalleryBookConfigAction } from "@/server/actions/gallery.actions"
import {
  BOOK_LAYOUTS,
  layoutCapacity,
  layoutGridStyle,
  layoutItemStyle,
  type BookPage,
  type BookPageLayout,
} from "@/lib/book/layouts"

type DAsset = { id: string; thumbUrl: string | null }

const uid = () => `pg_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`

export function BookDesigner({
  galleryId,
  assets,
  initialPages,
  initialSettings,
  publicToken,
}: {
  galleryId: string
  assets: DAsset[]
  initialPages: BookPage[]
  initialSettings: Record<string, unknown>
  publicToken: string | null
}) {
  const seed = useMemo<BookPage[]>(
    () =>
      initialPages.length
        ? initialPages
        : assets.map((a) => ({ id: uid(), layout: "single" as BookPageLayout, assetIds: [a.id] })),
    [initialPages, assets],
  )
  const [pages, setPages] = useState<BookPage[]>(seed)
  const [activeId, setActiveId] = useState<string | null>(seed[0]?.id ?? null)
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle")

  const assetsById = useMemo(() => {
    const m = new Map<string, DAsset>()
    for (const a of assets) m.set(a.id, a)
    return m
  }, [assets])

  // Uso de cada foto (para el badge en el banco).
  const usage = useMemo(() => {
    const m = new Map<string, number>()
    for (const pg of pages) for (const id of pg.assetIds) m.set(id, (m.get(id) ?? 0) + 1)
    return m
  }, [pages])

  // Auto-guardado (debounce). Se salta el primer render.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    setSave("saving")
    const t = setTimeout(async () => {
      const res = await updateGalleryBookConfigAction(galleryId, {
        settings: { ...initialSettings, pages },
      })
      if (res?.error) {
        setSave("error")
        const msg = Object.values(res.error).flat().filter(Boolean).join(" — ") || "No se pudo guardar"
        toast.error(msg)
      } else {
        setSave("saved")
      }
    }, 700)
    return () => clearTimeout(t)
  }, [pages, galleryId, initialSettings])

  const activePage = pages.find((p) => p.id === activeId) ?? null

  function patchPage(id: string, fn: (p: BookPage) => BookPage) {
    setPages((prev) => prev.map((p) => (p.id === id ? fn(p) : p)))
  }

  function addPhotoToActive(assetId: string) {
    if (!activePage) {
      toast.error("Elige una página primero")
      return
    }
    const cap = layoutCapacity(activePage.layout)
    if (activePage.assetIds.length >= cap) {
      toast.error(`Esta página (${activePage.layout}) ya está llena. Cambia el layout o crea otra.`)
      return
    }
    patchPage(activePage.id, (p) => ({ ...p, assetIds: [...p.assetIds, assetId] }))
  }

  function removePhoto(pageId: string, index: number) {
    patchPage(pageId, (p) => ({ ...p, assetIds: p.assetIds.filter((_, i) => i !== index) }))
  }

  function movePhoto(pageId: string, index: number, dir: -1 | 1) {
    patchPage(pageId, (p) => {
      const arr = [...p.assetIds]
      const j = index + dir
      if (j < 0 || j >= arr.length) return p
      ;[arr[index], arr[j]] = [arr[j]!, arr[index]!]
      return { ...p, assetIds: arr }
    })
  }

  function setLayout(pageId: string, layout: BookPageLayout) {
    patchPage(pageId, (p) => ({ ...p, layout, assetIds: p.assetIds.slice(0, layoutCapacity(layout)) }))
  }

  function addPage() {
    const np: BookPage = { id: uid(), layout: "single", assetIds: [] }
    setPages((prev) => [...prev, np])
    setActiveId(np.id)
  }

  function duplicatePage(id: string) {
    setPages((prev) => {
      const idx = prev.findIndex((p) => p.id === id)
      if (idx < 0) return prev
      const copy: BookPage = { ...prev[idx]!, id: uid(), assetIds: [...prev[idx]!.assetIds] }
      const next = [...prev]
      next.splice(idx + 1, 0, copy)
      return next
    })
  }

  function deletePage(id: string) {
    setPages((prev) => prev.filter((p) => p.id !== id))
    if (activeId === id) setActiveId(null)
  }

  return (
    <div className="flex h-[calc(100vh-1px)] flex-col bg-background">
      {/* Barra superior */}
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/galleries/${galleryId}`}
            className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Volver
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold text-foreground">Diseñador de álbum</h1>
            <p className="text-[11.5px] text-muted-foreground">
              {pages.length} página{pages.length === 1 ? "" : "s"} · arrastra para reordenar · el cliente verá exactamente esto
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SaveBadge state={save} />
          {publicToken && (
            <a
              href={`/g/${publicToken}?libro=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-medium text-brand-foreground hover:bg-brand/90"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Ver el libro
            </a>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Páginas */}
        <main className="min-w-0 flex-1 overflow-y-auto p-5">
          {pages.length === 0 ? (
            <div className="mx-auto mt-16 max-w-md rounded-2xl border border-dashed border-border p-10 text-center">
              <LayoutGrid className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No hay páginas. Crea la primera y arrastra fotos desde la derecha.
              </p>
              <button
                onClick={addPage}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90"
              >
                <Plus className="h-4 w-4" /> Nueva página
              </button>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl">
              <Reorder.Group
                as="div"
                axis="y"
                values={pages}
                onReorder={setPages}
                className="flex flex-col gap-3"
              >
                {pages.map((page, i) => (
                  <PageCard
                    key={page.id}
                    page={page}
                    index={i}
                    active={page.id === activeId}
                    assetsById={assetsById}
                    onActivate={() => setActiveId(page.id)}
                    onLayout={(l) => setLayout(page.id, l)}
                    onRemovePhoto={(idx) => removePhoto(page.id, idx)}
                    onMovePhoto={(idx, dir) => movePhoto(page.id, idx, dir)}
                    onDuplicate={() => duplicatePage(page.id)}
                    onDelete={() => deletePage(page.id)}
                  />
                ))}
              </Reorder.Group>
              <button
                onClick={addPage}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card/40 py-4 text-[12.5px] font-medium text-muted-foreground transition-colors hover:border-brand hover:text-brand"
              >
                <Plus className="h-4 w-4" /> Nueva página
              </button>
            </div>
          )}
        </main>

        {/* Banco de fotos */}
        <aside className="flex w-64 shrink-0 flex-col border-l border-border">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Images className="h-4 w-4 text-muted-foreground" />
            <span className="text-[13px] font-semibold text-foreground">Fotos</span>
            <span className="ml-auto text-[11px] text-muted-foreground">{assets.length}</span>
          </div>
          <p className="px-4 pt-2.5 text-[11px] leading-snug text-muted-foreground">
            Toca una foto para agregarla a la página seleccionada
            {activePage ? "" : " (elige una página primero)"}.
          </p>
          <div className="grid grid-cols-3 gap-1.5 overflow-y-auto p-3">
            {assets.map((a) => {
              const n = usage.get(a.id) ?? 0
              return (
                <button
                  key={a.id}
                  onClick={() => addPhotoToActive(a.id)}
                  className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
                  title="Agregar a la página seleccionada"
                >
                  {a.thumbUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                  {n > 0 && (
                    <span className="absolute right-1 top-1 rounded-full bg-brand px-1.5 text-[9px] font-bold text-brand-foreground">
                      {n}
                    </span>
                  )}
                  <span className="absolute inset-0 hidden place-items-center bg-black/40 group-hover:grid">
                    <Plus className="h-5 w-5 text-white" />
                  </span>
                </button>
              )
            })}
          </div>
        </aside>
      </div>
    </div>
  )
}

function SaveBadge({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "saving")
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…
      </span>
    )
  if (state === "saved")
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-emerald-600">
        <Check className="h-3.5 w-3.5" /> Guardado
      </span>
    )
  if (state === "error")
    return <span className="text-[12px] text-destructive">Error al guardar</span>
  return <span className="text-[12px] text-muted-foreground">Auto-guardado</span>
}

function PageCard({
  page,
  index,
  active,
  assetsById,
  onActivate,
  onLayout,
  onRemovePhoto,
  onMovePhoto,
  onDuplicate,
  onDelete,
}: {
  page: BookPage
  index: number
  active: boolean
  assetsById: Map<string, DAsset>
  onActivate: () => void
  onLayout: (l: BookPageLayout) => void
  onRemovePhoto: (idx: number) => void
  onMovePhoto: (idx: number, dir: -1 | 1) => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const controls = useDragControls()
  const cap = layoutCapacity(page.layout)
  const cells = Array.from({ length: cap }, (_, i) => page.assetIds[i] ?? null)

  return (
    <Reorder.Item
      as="div"
      value={page}
      dragListener={false}
      dragControls={controls}
      onPointerDown={onActivate}
      className={`flex items-stretch gap-3 rounded-xl border bg-card p-3 ${active ? "border-brand ring-2 ring-brand/20" : "border-border"}`}
    >
      {/* Handle + número */}
      <div className="flex flex-col items-center gap-1">
        <button
          onPointerDown={(e) => controls.start(e)}
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          title="Arrastrar para reordenar"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="text-[11px] font-bold text-muted-foreground tabular-nums">{index + 1}</span>
      </div>

      {/* Mini WYSIWYG de la página */}
      <div
        onClick={onActivate}
        className="grid w-28 shrink-0 gap-1 self-start overflow-hidden rounded-lg bg-[#1a1512] p-1"
        style={{ aspectRatio: "3 / 4", ...layoutGridStyle(page.layout) }}
      >
        {cells.map((assetId, idx) => {
          const a = assetId ? assetsById.get(assetId) : null
          return (
            <div
              key={idx}
              className="group relative overflow-hidden rounded"
              style={layoutItemStyle(page.layout, idx)}
            >
              {a?.thumbUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.thumbUrl} alt="" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 hidden items-start justify-between p-0.5 group-hover:flex">
                    <div className="flex flex-col gap-0.5">
                      {idx > 0 && (
                        <button onClick={(e) => { e.stopPropagation(); onMovePhoto(idx, -1) }} className="rounded bg-black/60 p-0.5 text-white" title="Mover antes">
                          <ChevronLeft className="h-3 w-3" />
                        </button>
                      )}
                      {idx < page.assetIds.length - 1 && (
                        <button onClick={(e) => { e.stopPropagation(); onMovePhoto(idx, 1) }} className="rounded bg-black/60 p-0.5 text-white" title="Mover después">
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); onRemovePhoto(idx) }} className="rounded bg-black/60 p-0.5 text-white hover:bg-destructive" title="Quitar">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="grid h-full w-full place-items-center border border-dashed border-white/20 text-white/30">
                  <Plus className="h-4 w-4" />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Controles */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-foreground">Página {index + 1}</span>
          <span className="text-[11px] text-muted-foreground">
            {page.assetIds.length}/{cap} foto{cap === 1 ? "" : "s"}
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            <button onClick={(e) => { e.stopPropagation(); onDuplicate() }} className="rounded p-1 text-muted-foreground hover:bg-muted" title="Duplicar página">
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Eliminar página">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Diseño de la página:</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {BOOK_LAYOUTS.map((l) => (
            <button
              key={l.id}
              onClick={(e) => { e.stopPropagation(); onLayout(l.id) }}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                page.layout === l.id
                  ? "bg-brand text-brand-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        {active && (
          <p className="mt-auto pt-2 text-[11px] font-medium text-brand">
            ← Toca fotos del banco para agregarlas a esta página
          </p>
        )}
      </div>
    </Reorder.Item>
  )
}
