"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
  BookImage,
  ArrowDownAZ,
} from "lucide-react"
import { toast } from "sonner"

import { updateGalleryBookConfigAction } from "@/server/actions/gallery.actions"
import {
  saveBookTemplateAction,
  deleteBookTemplateAction,
} from "@/server/actions/book-template.actions"
import {
  BOOK_LAYOUTS,
  layoutCapacity,
  layoutGridStyle,
  layoutItemStyle,
  type BookPage,
  type BookPageLayout,
} from "@/lib/book/layouts"
import { BookCoverView } from "@/components/galleries/book-cover-view"
import {
  COVER_MODELS,
  COVER_FONTS,
  NAME_STYLES,
  COVER_FONTS_HREF,
  applyModel,
  coverFontFamily,
  type CoverConfig,
  type CoverModel,
  type CoverFont,
  type NameStyle,
  type TextPosition,
} from "@/lib/book/cover"

type DAsset = { id: string; thumbUrl: string | null }

const uid = () => `pg_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`
const str = (v: unknown) => (typeof v === "string" ? v : "")

export function BookDesigner({
  galleryId,
  assets,
  initialPages,
  initialSettings,
  publicToken,
  coverImg,
  logoUrl,
  templates,
}: {
  galleryId: string
  assets: DAsset[]
  initialPages: BookPage[]
  initialSettings: Record<string, unknown>
  publicToken: string | null
  coverImg: string | null
  logoUrl: string | null
  templates: { id: string; name: string; config: Record<string, unknown> }[]
}) {
  const router = useRouter()
  const seed = useMemo<BookPage[]>(
    () =>
      initialPages.length
        ? initialPages
        : assets.map((a) => ({ id: uid(), layout: "single" as BookPageLayout, assetIds: [a.id] })),
    [initialPages, assets],
  )
  const [tab, setTab] = useState<"pages" | "cover">("pages")
  const [pages, setPages] = useState<BookPage[]>(seed)
  const [activeId, setActiveId] = useState<string | null>(seed[0]?.id ?? null)

  // Portada
  const [cover, setCover] = useState<CoverConfig>((initialSettings.cover as CoverConfig) ?? {})
  const [name, setName] = useState(str(initialSettings.quinceaneraName) || str(initialSettings.title))
  const [subtitle, setSubtitle] = useState(str(initialSettings.subtitle))
  const [date, setDate] = useState(str(initialSettings.eventDate))
  const [accent, setAccent] = useState(str(initialSettings.accent) || "#b89968")
  const [showLogo, setShowLogo] = useState(initialSettings.showLogo !== false)
  const [music, setMusic] = useState<{ url?: string; autoplay?: boolean; volume?: number }>(
    (initialSettings.music as { url?: string; autoplay?: boolean; volume?: number } | undefined) ?? {},
  )

  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle")

  const assetsById = useMemo(() => {
    const m = new Map<string, DAsset>()
    for (const a of assets) m.set(a.id, a)
    return m
  }, [assets])
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
        settings: {
          ...initialSettings,
          pages,
          cover,
          quinceaneraName: name,
          subtitle,
          eventDate: date,
          accent,
          showLogo,
          music,
        },
      })
      if (res?.error) {
        setSave("error")
        toast.error(Object.values(res.error).flat().filter(Boolean).join(" — ") || "No se pudo guardar")
      } else {
        setSave("saved")
      }
    }, 700)
    return () => clearTimeout(t)
  }, [pages, cover, name, subtitle, date, accent, showLogo, music, galleryId, initialSettings])

  const activePage = pages.find((p) => p.id === activeId) ?? null

  function patchPage(id: string, fn: (p: BookPage) => BookPage) {
    setPages((prev) => prev.map((p) => (p.id === id ? fn(p) : p)))
  }
  function addPhotoToActive(assetId: string) {
    if (!activePage) return toast.error("Elige una página primero")
    if (activePage.assetIds.length >= layoutCapacity(activePage.layout))
      return toast.error("Esta página ya está llena. Cambia el layout o crea otra.")
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
  // Ordena las páginas por ORDEN DE CREACIÓN de sus fotos (el banco `assets` ya
  // viene en orden de captura). Las páginas vacías van al final.
  function sortPagesByCreation() {
    const idx = new Map(assets.map((a, i) => [a.id, i]))
    const rank = (p: BookPage) =>
      p.assetIds.length
        ? Math.min(...p.assetIds.map((id) => idx.get(id) ?? Number.POSITIVE_INFINITY))
        : Number.POSITIVE_INFINITY
    setPages((prev) =>
      [...prev].sort((a, b) => rank(a) - rank(b)),
    )
    toast.success("Páginas ordenadas por creación")
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
  const patchCover = (p: Partial<CoverConfig>) => setCover((c) => ({ ...c, ...p }))

  // ── Plantillas (Fase 3) ──
  async function saveTemplate() {
    const nm = window.prompt("Nombre de la plantilla:", name ? `Estilo ${name}` : "Mi plantilla premium")
    if (!nm) return
    const res = await saveBookTemplateAction(galleryId, nm, {
      accent,
      showLogo,
      cover,
      pagePattern: pages.map((p) => p.layout),
    })
    if (res.error) toast.error(res.error)
    else {
      toast.success("Plantilla guardada")
      router.refresh()
    }
  }
  function applyTemplate(cfg: Record<string, unknown>) {
    const c = cfg as {
      accent?: string
      showLogo?: boolean
      cover?: CoverConfig
      pagePattern?: BookPageLayout[]
    }
    if (c.cover) setCover(c.cover)
    if (typeof c.accent === "string") setAccent(c.accent)
    if (typeof c.showLogo === "boolean") setShowLogo(c.showLogo)
    if (c.pagePattern?.length) {
      const flat = pages.flatMap((p) => p.assetIds)
      const np: BookPage[] = []
      let i = 0
      let k = 0
      while (i < flat.length && np.length < 400) {
        const layout = c.pagePattern[k % c.pagePattern.length]!
        const cap = layoutCapacity(layout)
        np.push({ id: uid(), layout, assetIds: flat.slice(i, i + cap) })
        i += cap
        k++
      }
      if (np.length) setPages(np)
    }
    toast.success("Plantilla aplicada")
  }
  async function deleteTemplate(id: string) {
    const res = await deleteBookTemplateAction(galleryId, id)
    if (res.error) toast.error(res.error)
    else {
      toast.success("Plantilla eliminada")
      router.refresh()
    }
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <link rel="stylesheet" href={COVER_FONTS_HREF} />

      {/* Barra superior */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/galleries/${galleryId}`} className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Volver
          </Link>
          <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
            {([["pages", "Páginas", LayoutGrid], ["cover", "Portada", BookImage]] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  tab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SaveBadge state={save} />
          {publicToken && (
            <a href={`/g/${publicToken}?libro=1`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-medium text-brand-foreground hover:bg-brand/90">
              <ExternalLink className="h-3.5 w-3.5" /> Ver el libro
            </a>
          )}
        </div>
      </header>

      {tab === "pages" ? (
        <div className="flex min-h-0 flex-1">
          {/* Páginas */}
          <main className="min-w-0 flex-1 overflow-y-auto p-5">
            <div className="mx-auto max-w-3xl">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-[12.5px] text-muted-foreground">
                  {pages.length} página{pages.length === 1 ? "" : "s"}
                </p>
                <button
                  onClick={sortPagesByCreation}
                  disabled={pages.length < 2}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
                  title="Ordena las páginas por el orden de creación (captura) de sus fotos"
                >
                  <ArrowDownAZ className="h-3.5 w-3.5" /> Ordenar por creación
                </button>
              </div>
              <Reorder.Group as="div" axis="y" values={pages} onReorder={setPages} className="flex flex-col gap-3">
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
              <button onClick={addPage} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card/40 py-4 text-[12.5px] font-medium text-muted-foreground transition-colors hover:border-brand hover:text-brand">
                <Plus className="h-4 w-4" /> Nueva página
              </button>
            </div>
          </main>
          {/* Banco de fotos */}
          <aside className="flex w-64 shrink-0 flex-col border-l border-border">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Images className="h-4 w-4 text-muted-foreground" />
              <span className="text-[13px] font-semibold text-foreground">Fotos</span>
              <span className="ml-auto text-[11px] text-muted-foreground">{assets.length}</span>
            </div>
            <p className="px-4 pt-2.5 text-[11px] leading-snug text-muted-foreground">
              Toca una foto para agregarla a la página seleccionada.
            </p>
            <div className="grid grid-cols-3 gap-1.5 overflow-y-auto p-3">
              {assets.map((a) => {
                const n = usage.get(a.id) ?? 0
                return (
                  <button key={a.id} onClick={() => addPhotoToActive(a.id)} className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted" title="Agregar a la página seleccionada">
                    {a.thumbUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    )}
                    {n > 0 && <span className="absolute right-1 top-1 rounded-full bg-brand px-1.5 text-[9px] font-bold text-brand-foreground">{n}</span>}
                    <span className="absolute inset-0 hidden place-items-center bg-black/40 group-hover:grid"><Plus className="h-5 w-5 text-white" /></span>
                  </button>
                )
              })}
            </div>
          </aside>
        </div>
      ) : (
        <CoverTab
          coverImg={coverImg}
          logoUrl={logoUrl}
          cover={cover}
          patchCover={patchCover}
          onModel={(m) => setCover((c) => ({ ...applyModel(m), phrase: c.phrase }))}
          name={name}
          setName={setName}
          subtitle={subtitle}
          setSubtitle={setSubtitle}
          date={date}
          setDate={setDate}
          accent={accent}
          setAccent={setAccent}
          showLogo={showLogo}
          setShowLogo={setShowLogo}
          templates={templates}
          onSaveTemplate={saveTemplate}
          onApplyTemplate={applyTemplate}
          onDeleteTemplate={deleteTemplate}
        />
      )}

      {tab === "cover" && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-amber-100 text-lg text-amber-700">🎵</span>
            <div>
              <p className="text-sm font-semibold text-foreground">Música de fondo</p>
              <p className="text-xs text-muted-foreground">
                Suena en el álbum digital. El cliente puede pausarla con el botón flotante.
              </p>
            </div>
          </div>
          <label className="mb-1 block text-xs font-medium text-foreground">URL del audio (MP3)</label>
          <input
            type="url"
            value={music.url ?? ""}
            onChange={(e) => setMusic((m) => ({ ...m, url: e.target.value }))}
            placeholder="https://…/cancion.mp3"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={music.autoplay !== false}
                onChange={(e) => setMusic((m) => ({ ...m, autoplay: e.target.checked }))}
                className="size-4"
              />
              Arrancar sola (tras el primer toque del cliente)
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Volumen
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={music.volume ?? 0.5}
                onChange={(e) => setMusic((m) => ({ ...m, volume: Number(e.target.value) }))}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

function SaveBadge({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "saving")
    return <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…</span>
  if (state === "saved")
    return <span className="inline-flex items-center gap-1.5 text-[12px] text-emerald-600"><Check className="h-3.5 w-3.5" /> Guardado</span>
  if (state === "error") return <span className="text-[12px] text-destructive">Error al guardar</span>
  return <span className="text-[12px] text-muted-foreground">Auto-guardado</span>
}

// ─── Pestaña PORTADA ─────────────────────────────────────────────────────────
function CoverTab({
  coverImg, logoUrl, cover, patchCover, onModel,
  name, setName, subtitle, setSubtitle, date, setDate, accent, setAccent, showLogo, setShowLogo,
  templates, onSaveTemplate, onApplyTemplate, onDeleteTemplate,
}: {
  coverImg: string | null
  logoUrl: string | null
  cover: CoverConfig
  patchCover: (p: Partial<CoverConfig>) => void
  onModel: (m: CoverModel) => void
  name: string; setName: (v: string) => void
  subtitle: string; setSubtitle: (v: string) => void
  date: string; setDate: (v: string) => void
  accent: string; setAccent: (v: string) => void
  showLogo: boolean; setShowLogo: (v: boolean) => void
  templates: { id: string; name: string; config: Record<string, unknown> }[]
  onSaveTemplate: () => void
  onApplyTemplate: (config: Record<string, unknown>) => void
  onDeleteTemplate: (id: string) => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* Vista previa */}
      <div className="flex shrink-0 items-start justify-center border-b border-border p-6 lg:w-[42%] lg:border-b-0 lg:border-r">
        <div className="w-full max-w-[360px]">
          <div className="relative w-full overflow-hidden rounded-xl bg-[#14110f] shadow-xl ring-1 ring-black/20" style={{ aspectRatio: "3 / 4" }}>
            <BookCoverView
              coverRaw={cover}
              coverImg={coverImg}
              name={name || "Nombre"}
              subtitle={subtitle || "Álbum de entrega"}
              eventDate={date}
              logoUrl={logoUrl}
              showLogo={showLogo}
              accent={accent}
            />
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">Vista previa en vivo de la portada</p>
        </div>
      </div>

      {/* Controles */}
      <div className="min-w-0 flex-1 space-y-6 overflow-y-auto p-6">
        <Group label="Biblioteca de plantillas">
          <div className="flex flex-wrap items-center gap-1.5">
            {templates.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-[12px]">
                <button onClick={() => onApplyTemplate(t.config)} className="font-medium text-foreground hover:text-brand" title="Aplicar plantilla">
                  {t.name}
                </button>
                <button onClick={() => onDeleteTemplate(t.id)} className="text-muted-foreground hover:text-destructive" title="Eliminar">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button onClick={onSaveTemplate} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:border-brand hover:text-brand">
              <Plus className="h-3 w-3" /> Guardar diseño actual
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Guarda este diseño (portada + colores + patrón de páginas) para reutilizarlo en futuras galerías.
          </p>
        </Group>

        <Group label="Modelo de portada">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {COVER_MODELS.map((m) => (
              <button key={m.id} onClick={() => onModel(m.id)} className={`rounded-lg border px-2.5 py-2 text-left text-[12px] font-medium transition-colors ${cover.model === m.id ? "border-brand bg-brand-soft text-brand" : "border-border bg-card hover:bg-muted"}`}>
                {m.label}
              </button>
            ))}
          </div>
        </Group>

        <Group label="Tipografía">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {COVER_FONTS.map((f) => (
              <button key={f.id} onClick={() => patchCover({ font: f.id })} style={{ fontFamily: f.family }} className={`rounded-lg border px-2.5 py-2 text-[15px] transition-colors ${cover.font === f.id ? "border-brand bg-brand-soft text-brand" : "border-border bg-card hover:bg-muted"}`}>
                {f.label}
              </button>
            ))}
          </div>
        </Group>

        <Group label="Estilo del nombre">
          <div className="flex flex-wrap gap-1.5">
            {NAME_STYLES.map((n) => (
              <button key={n.id} onClick={() => patchCover({ nameStyle: n.id })} className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${cover.nameStyle === n.id ? "border-brand bg-brand-soft text-brand" : "border-border bg-card hover:bg-muted"}`}>
                {n.label}
              </button>
            ))}
          </div>
        </Group>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Group label="Posición del texto">
            <div className="flex gap-1.5">
              {(["top", "center", "bottom"] as TextPosition[]).map((p) => (
                <button key={p} onClick={() => patchCover({ textPosition: p })} className={`flex-1 rounded-lg border px-2 py-1.5 text-[12px] font-medium capitalize transition-colors ${(cover.textPosition ?? "center") === p ? "border-brand bg-brand-soft text-brand" : "border-border bg-card hover:bg-muted"}`}>
                  {p === "top" ? "Arriba" : p === "bottom" ? "Abajo" : "Centro"}
                </button>
              ))}
            </div>
          </Group>
          <Group label="Color de acento">
            <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background p-1" />
          </Group>
        </div>

        <Slider label="Tamaño del nombre" value={cover.textScale ?? 1} min={0.7} max={1.6} step={0.05} onChange={(v) => patchCover({ textScale: v })} />
        <Slider label="Espaciado de letras" value={cover.letterSpacing ?? 0.03} min={0} max={0.4} step={0.01} onChange={(v) => patchCover({ letterSpacing: v })} />
        <Slider label="Márgenes" value={cover.margin ?? 10} min={3} max={20} step={1} onChange={(v) => patchCover({ margin: v })} suffix="%" />
        <Slider label="Oscurecido de la foto" value={cover.overlay ?? 0.45} min={0} max={0.85} step={0.05} onChange={(v) => patchCover({ overlay: v })} />

        <div className="flex items-center gap-4">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={cover.shadow ?? true} onChange={(e) => patchCover({ shadow: e.target.checked })} className="size-4" />
            Sombra del texto
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={showLogo} onChange={(e) => setShowLogo(e.target.checked)} className="size-4" />
            Mostrar logo del estudio
          </label>
        </div>

        <Group label="Textos">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Txt label="Nombre" value={name} onChange={setName} placeholder="Valentina" />
            <Txt label="Subtítulo" value={subtitle} onChange={setSubtitle} placeholder="Álbum de entrega" />
            <Txt label="Fecha" value={date} onChange={setDate} placeholder="15 de Agosto 2026" />
            <Txt label="Frase personalizada" value={cover.phrase ?? ""} onChange={(v) => patchCover({ phrase: v })} placeholder="Un día inolvidable" />
          </div>
        </Group>
      </div>
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}
function Txt({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
    </label>
  )
}
function Slider({ label, value, min, max, step, onChange, suffix }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">{value}{suffix ?? ""}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-brand" />
    </div>
  )
}

// ─── Tarjeta de página (pestaña Páginas) ─────────────────────────────────────
function PageCard({
  page, index, active, assetsById, onActivate, onLayout, onRemovePhoto, onMovePhoto, onDuplicate, onDelete,
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
    <Reorder.Item as="div" value={page} dragListener={false} dragControls={controls} onPointerDown={onActivate} className={`flex items-stretch gap-3 rounded-xl border bg-card p-3 ${active ? "border-brand ring-2 ring-brand/20" : "border-border"}`}>
      <div className="flex flex-col items-center gap-1">
        <button onPointerDown={(e) => controls.start(e)} className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing" title="Arrastrar para reordenar">
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="text-[11px] font-bold tabular-nums text-muted-foreground">{index + 1}</span>
      </div>

      <div onClick={onActivate} className="grid w-28 shrink-0 gap-1 self-start overflow-hidden rounded-lg bg-[#1a1512] p-1" style={{ aspectRatio: "3 / 4", ...layoutGridStyle(page.layout) }}>
        {cells.map((assetId, idx) => {
          const a = assetId ? assetsById.get(assetId) : null
          return (
            <div key={idx} className="group relative overflow-hidden rounded" style={layoutItemStyle(page.layout, idx)}>
              {a?.thumbUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.thumbUrl} alt="" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 hidden items-start justify-between p-0.5 group-hover:flex">
                    <div className="flex flex-col gap-0.5">
                      {idx > 0 && <button onClick={(e) => { e.stopPropagation(); onMovePhoto(idx, -1) }} className="rounded bg-black/60 p-0.5 text-white" title="Mover antes"><ChevronLeft className="h-3 w-3" /></button>}
                      {idx < page.assetIds.length - 1 && <button onClick={(e) => { e.stopPropagation(); onMovePhoto(idx, 1) }} className="rounded bg-black/60 p-0.5 text-white" title="Mover después"><ChevronRight className="h-3 w-3" /></button>}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); onRemovePhoto(idx) }} className="rounded bg-black/60 p-0.5 text-white hover:bg-destructive" title="Quitar"><X className="h-3 w-3" /></button>
                  </div>
                </>
              ) : (
                <div className="grid h-full w-full place-items-center border border-dashed border-white/20 text-white/30"><Plus className="h-4 w-4" /></div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-foreground">Página {index + 1}</span>
          <span className="text-[11px] text-muted-foreground">{page.assetIds.length}/{cap} foto{cap === 1 ? "" : "s"}</span>
          <div className="ml-auto flex items-center gap-0.5">
            <button onClick={(e) => { e.stopPropagation(); onDuplicate() }} className="rounded p-1 text-muted-foreground hover:bg-muted" title="Duplicar página"><Copy className="h-3.5 w-3.5" /></button>
            <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Eliminar página"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Diseño de la página:</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {BOOK_LAYOUTS.map((l) => (
            <button key={l.id} onClick={(e) => { e.stopPropagation(); onLayout(l.id) }} className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${page.layout === l.id ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
              {l.label}
            </button>
          ))}
        </div>
        {active && <p className="mt-auto pt-2 text-[11px] font-medium text-brand">← Toca fotos del banco para agregarlas a esta página</p>}
      </div>
    </Reorder.Item>
  )
}
