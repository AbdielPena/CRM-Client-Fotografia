"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { Check, Crosshair, ImageIcon, Loader2, Palette, UploadCloud, X } from "lucide-react"
import { toast } from "sonner"

import {
  GALLERY_TEMPLATES,
  resolveGalleryTheme,
  galleryStyleTokens,
  type GalleryMode,
  type GalleryTextAlign,
} from "@/lib/galleries/templates"
import { saveGalleryAppearanceAction, setCoverAssetAction } from "@/server/actions/gallery.actions"

interface AppearanceState {
  templateId: string
  mode: GalleryMode
  accent: string
  columns: number
  coverTitle: string
  coverSubtitle: string
  overlay: "none" | "light" | "dark"
  overlayIntensity: number
  showButton: boolean
  buttonLabel: string
  textAlign: GalleryTextAlign
  welcomeText: string
  focalX: number
  focalY: number
}

interface CoverAsset {
  id: string
  thumbUrl: string | null
  webUrl: string | null
  original_name: string
}

interface Props {
  galleryId: string
  galleryType: "selection" | "final_delivery"
  initial: {
    templateId: string
    theme: Record<string, unknown>
    coverConfig: Record<string, unknown>
    subtitle: string | null
    welcomeText: string | null
    coverImageUrl?: string | null
    coverAssetId?: string | null
  }
  assets?: CoverAsset[]
}

const str = (v: unknown, def = "") => (typeof v === "string" ? v : def)
const numClamp = (v: unknown, def: number, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def

export function GalleryAppearanceTab({ galleryId, galleryType, initial, assets = [] }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [coverBusy, setCoverBusy] = useState(false)
  const [currentCoverId, setCurrentCoverId] = useState(initial.coverAssetId ?? null)
  const [externalCoverUrl, setExternalCoverUrl] = useState<string | null>(null)
  const coverFileRef = useRef<HTMLInputElement>(null)
  const [showAllAssets, setShowAllAssets] = useState(false)

  const t = initial.theme ?? {}
  const c = initial.coverConfig ?? {}
  const currentCover = assets.find((a) => a.id === currentCoverId)
  const coverImageUrl = externalCoverUrl || currentCover?.webUrl || currentCover?.thumbUrl || (initial.coverImageUrl ?? null)
  const [s, setS] = useState<AppearanceState>({
    templateId: initial.templateId || "classic_proofing",
    mode: t.mode === "dark" ? "dark" : (t.mode === "light" ? "light" : "light"),
    accent: /^#[0-9a-fA-F]{3,8}$/.test(str(t.accent)) ? str(t.accent) : "",
    columns: numClamp(t.columns, 0, 0, 6),
    coverTitle: str(c.title),
    coverSubtitle: str(c.subtitle),
    overlay: c.overlay === "light" || c.overlay === "none" ? c.overlay : "dark",
    overlayIntensity: numClamp(c.overlayIntensity, 0.35, 0, 1),
    showButton: c.showButton !== false,
    buttonLabel: str(c.buttonLabel),
    textAlign:
      c.textAlign === "left" || c.textAlign === "right" ? (c.textAlign as GalleryTextAlign) : "center",
    welcomeText: initial.welcomeText ?? "",
    focalX: numClamp(c.focalX, 0.5, 0, 1),
    focalY: numClamp(c.focalY, 0.5, 0, 1),
  })

  // Arrastrar el foco de la portada sobre la imagen real.
  const focusBoxRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  function setFocusFromEvent(e: React.PointerEvent) {
    const box = focusBoxRef.current
    if (!box) return
    const rect = box.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    setS((prev) => ({
      ...prev,
      focalX: Math.round(x * 1000) / 1000,
      focalY: Math.round(y * 1000) / 1000,
    }))
  }

  // Tema efectivo para la previsualización (preset + overrides actuales)
  const effectiveTheme = resolveGalleryTheme(s.templateId, {
    mode: s.mode,
    accent: s.accent || undefined,
    columns: s.columns || undefined,
  })
  const tokens = galleryStyleTokens(effectiveTheme)

  function update<K extends keyof AppearanceState>(key: K, value: AppearanceState[K]) {
    setS((prev) => ({ ...prev, [key]: value }))
  }

  function save() {
    start(async () => {
      try {
        await saveGalleryAppearanceAction(galleryId, {
          templateId: s.templateId,
          theme: {
            mode: s.mode,
            ...(s.accent ? { accent: s.accent } : {}),
            ...(s.columns ? { columns: s.columns } : {}),
          },
          coverConfig: {
            // Preserva claves que este editor no maneja (imagen/textColor),
            // porque updateGallery reemplaza el cover_config completo.
            ...("imageAssetId" in c ? { imageAssetId: c.imageAssetId } : {}),
            ...("imageUrl" in c ? { imageUrl: c.imageUrl } : {}),
            ...("textColor" in c ? { textColor: c.textColor } : {}),
            title: s.coverTitle.trim() || null,
            subtitle: s.coverSubtitle.trim() || null,
            focalX: s.focalX,
            focalY: s.focalY,
            overlay: s.overlay,
            overlayIntensity: s.overlayIntensity,
            showButton: s.showButton,
            buttonLabel: s.buttonLabel.trim() || null,
            textAlign: s.textAlign,
          },
          welcomeText: s.welcomeText.trim() || null,
        })
        toast.success("Apariencia guardada")
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar")
      }
    })
  }

  const labelCls = "mb-1 block text-xs font-medium text-muted-foreground"
  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {/* Templates */}
        <section className="sf-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Palette className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-semibold text-foreground">Estilo (template)</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {GALLERY_TEMPLATES.map((tpl) => {
              const active = s.templateId === tpl.id
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => update("templateId", tpl.id)}
                  className={`group relative overflow-hidden rounded-xl border p-3 text-left transition-all ${
                    active
                      ? "border-brand ring-2 ring-brand/20"
                      : "border-border hover:border-border-strong"
                  }`}
                >
                  <span
                    className="block h-12 w-full rounded-md"
                    style={{
                      background: `linear-gradient(135deg, ${tpl.swatch}, ${tpl.theme.mode === "dark" ? "#0b0b0d" : "#ffffff"})`,
                    }}
                  />
                  <span className="mt-2 block text-xs font-semibold text-foreground">
                    {tpl.label}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] leading-snug text-muted-foreground line-clamp-2">
                    {tpl.description}
                  </span>
                  {active && (
                    <Check className="absolute right-2 top-2 h-4 w-4 rounded-full bg-brand p-0.5 text-brand-foreground" />
                  )}
                </button>
              )
            })}
          </div>
        </section>

        {/* Personalización */}
        <section className="sf-card space-y-4 p-5">
          <h3 className="text-sm font-semibold text-foreground">Personalización</h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Modo</label>
              <div className="flex gap-2">
                {(["light", "dark"] as GalleryMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => update("mode", m)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-colors ${
                      s.mode === m
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {m === "light" ? "Claro" : "Oscuro"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={labelCls}>Color de acento</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={s.accent || tokens.accent}
                  onChange={(e) => update("accent", e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-border bg-background"
                />
                <button
                  type="button"
                  onClick={() => update("accent", "")}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Usar el del template
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls}>
              Columnas (desktop){s.columns ? `: ${s.columns}` : " — del template"}
            </label>
            <input
              type="range"
              min={2}
              max={6}
              value={s.columns || tokens.columns}
              onChange={(e) => update("columns", Number(e.target.value))}
              className="w-full accent-brand"
            />
          </div>

          <div>
            <label className={labelCls}>Texto de bienvenida (opcional)</label>
            <textarea
              rows={2}
              value={s.welcomeText}
              onChange={(e) => update("welcomeText", e.target.value)}
              placeholder="Un mensaje cálido para tu cliente al abrir la galería…"
              className={`${inputCls} resize-none`}
            />
          </div>
        </section>

        {/* Imagen de portada */}
        <section className="sf-card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Imagen de portada</h3>
            {currentCoverId && (
              <button
                type="button"
                disabled={coverBusy}
                onClick={() => {
                  setCoverBusy(true)
                  start(async () => {
                    try {
                      await setCoverAssetAction(galleryId, null)
                      setCurrentCoverId(null)
                      setExternalCoverUrl(null)
                      toast.success("Portada eliminada")
                      router.refresh()
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Error")
                    } finally {
                      setCoverBusy(false)
                    }
                  })
                }}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" /> Quitar portada
              </button>
            )}
          </div>

          {assets.length > 0 ? (
            <>
              <p className="text-[12px] text-muted-foreground">
                Elige una foto de la galería como portada:
              </p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                {(showAllAssets ? assets : assets.slice(0, 16)).map((a) => {
                  const selected = a.id === currentCoverId
                  return (
                    <button
                      key={a.id}
                      type="button"
                      disabled={coverBusy}
                      onClick={() => {
                        setCoverBusy(true)
                        start(async () => {
                          try {
                            await setCoverAssetAction(galleryId, a.id)
                            setCurrentCoverId(a.id)
                            setExternalCoverUrl(null)
                            toast.success("Portada actualizada")
                            router.refresh()
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Error")
                          } finally {
                            setCoverBusy(false)
                          }
                        })
                      }}
                      className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${
                        selected
                          ? "border-brand ring-2 ring-brand/30"
                          : "border-transparent hover:border-brand/40"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={a.thumbUrl || a.webUrl || ""}
                        alt={a.original_name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                      {selected && (
                        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-brand-foreground shadow">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              {!showAllAssets && assets.length > 16 && (
                <button
                  type="button"
                  onClick={() => setShowAllAssets(true)}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Ver las {assets.length} fotos
                </button>
              )}
            </>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              Aún no hay fotos en la galería. Sube fotos para poder elegir una portada.
            </p>
          )}

          <div className="flex items-center gap-3 border-t border-border pt-3">
            <button
              type="button"
              disabled={coverBusy}
              onClick={() => coverFileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
            >
              {coverBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
              Subir imagen externa
            </button>
            <span className="text-[11px] text-muted-foreground">
              JPG, PNG o WebP
            </span>
          </div>
          <input
            ref={coverFileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              e.target.value = ""
              setCoverBusy(true)
              try {
                const fd = new FormData()
                fd.append("file", file)
                fd.append("variant", "gallery-cover")
                const res = await fetch("/api/studio/branding/logo", { method: "POST", body: fd })
                const json = (await res.json()) as { url?: string; error?: string }
                if (!res.ok || !json.url) throw new Error(json.error || "Error al subir")
                setExternalCoverUrl(json.url)
                await setCoverAssetAction(galleryId, null)
                setCurrentCoverId(null)
                await saveGalleryAppearanceAction(galleryId, {
                  templateId: s.templateId,
                  theme: { mode: s.mode, ...(s.accent ? { accent: s.accent } : {}), ...(s.columns ? { columns: s.columns } : {}) },
                  coverConfig: { ...c, imageUrl: json.url, title: s.coverTitle.trim() || null, subtitle: s.coverSubtitle.trim() || null, focalX: s.focalX, focalY: s.focalY, overlay: s.overlay, overlayIntensity: s.overlayIntensity, showButton: s.showButton, buttonLabel: s.buttonLabel.trim() || null, textAlign: s.textAlign },
                  welcomeText: s.welcomeText.trim() || null,
                })
                toast.success("Portada externa subida")
                router.refresh()
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Error al subir")
              } finally {
                setCoverBusy(false)
              }
            }}
          />
        </section>

        {/* Portada — texto y overlay */}
        <section className="sf-card space-y-4 p-5">
          <h3 className="text-sm font-semibold text-foreground">Texto de portada</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Título (sobre la portada)</label>
              <input
                value={s.coverTitle}
                onChange={(e) => update("coverTitle", e.target.value)}
                placeholder="Deja vacío para usar el nombre de la galería"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Subtítulo</label>
              <input
                value={s.coverSubtitle}
                onChange={(e) => update("coverSubtitle", e.target.value)}
                placeholder="ej. 14 de marzo, 2026 · Santo Domingo"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Oscurecer imagen (overlay)</label>
              <select
                value={s.overlay}
                onChange={(e) => update("overlay", e.target.value as AppearanceState["overlay"])}
                className={inputCls}
              >
                <option value="dark">Oscuro</option>
                <option value="light">Claro</option>
                <option value="none">Ninguno</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Alineación del texto</label>
              <select
                value={s.textAlign}
                onChange={(e) => update("textAlign", e.target.value as GalleryTextAlign)}
                className={inputCls}
              >
                <option value="center">Centro</option>
                <option value="left">Izquierda</option>
                <option value="right">Derecha</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={s.showButton}
              onChange={(e) => update("showButton", e.target.checked)}
              className="h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
            />
            Mostrar botón de entrada
          </label>
          {s.showButton && (
            <input
              value={s.buttonLabel}
              onChange={(e) => update("buttonLabel", e.target.value)}
              placeholder={galleryType === "final_delivery" ? "Ver mis fotos" : "Entrar a seleccionar"}
              className={inputCls}
            />
          )}
        </section>

        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Guardar apariencia
        </button>
      </div>

      {/* Portada — editor de foco (arrastrar sobre la imagen real) */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Crosshair className="h-3.5 w-3.5" />
            Portada — foco
          </p>
          {coverImageUrl && (
            <button
              type="button"
              onClick={() => setS((p) => ({ ...p, focalX: 0.5, focalY: 0.5 }))}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Centrar
            </button>
          )}
        </div>

        {coverImageUrl ? (
          <div
            ref={focusBoxRef}
            onPointerDown={(e) => {
              setDragging(true)
              try {
                ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
              } catch {
                /* noop */
              }
              setFocusFromEvent(e)
            }}
            onPointerMove={(e) => {
              if (dragging) setFocusFromEvent(e)
            }}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
            className="relative aspect-[16/10] w-full touch-none select-none overflow-hidden rounded-2xl border border-border cursor-grab active:cursor-grabbing"
            style={{ fontFamily: tokens.fontStack }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverImageUrl}
              alt=""
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: `${s.focalX * 100}% ${s.focalY * 100}%` }}
            />
            {s.overlay !== "none" && (
              <span
                className="pointer-events-none absolute inset-0"
                style={{ background: s.overlay === "dark" ? "#000" : "#fff", opacity: s.overlayIntensity }}
              />
            )}
            {/* Texto de la portada (no bloquea el arrastre) */}
            <div
              className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-center p-5"
              style={{
                textAlign: s.textAlign,
                alignItems:
                  s.textAlign === "left" ? "flex-start" : s.textAlign === "right" ? "flex-end" : "center",
              }}
            >
              <p
                className="text-xl font-semibold leading-tight drop-shadow"
                style={{ color: s.overlay === "light" ? "#1a1a1a" : "#ffffff" }}
              >
                {s.coverTitle || "Nombre de la galería"}
              </p>
              {s.coverSubtitle && (
                <p
                  className="mt-1 text-xs drop-shadow"
                  style={{ color: s.overlay === "light" ? "rgba(0,0,0,.7)" : "rgba(255,255,255,.85)" }}
                >
                  {s.coverSubtitle}
                </p>
              )}
              {s.showButton && (
                <span
                  className="mt-3 inline-block rounded-full px-4 py-1.5 text-xs font-semibold"
                  style={{ background: tokens.accent, color: "#fff" }}
                >
                  {s.buttonLabel || (galleryType === "final_delivery" ? "Ver mis fotos" : "Entrar")}
                </span>
              )}
            </div>
            {/* Manija del foco */}
            <span
              className="pointer-events-none absolute z-20 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-white/20 shadow-[0_0_0_2px_rgba(0,0,0,.4)] backdrop-blur-[1px]"
              style={{ left: `${s.focalX * 100}%`, top: `${s.focalY * 100}%` }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
            </span>
          </div>
        ) : (
          <div
            className="relative flex aspect-[16/10] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border p-5 text-center"
            style={{
              background:
                s.mode === "dark"
                  ? "linear-gradient(160deg,#1b1b22,#0b0b0d)"
                  : "linear-gradient(160deg,#f4f4f5,#e4e4e7)",
            }}
          >
            <p className="text-xs text-muted-foreground">
              Aún no hay foto de portada. Sube fotos (o elige una como portada) para ajustar el foco.
            </p>
          </div>
        )}

        <p className="mt-2 text-[11px] text-muted-foreground">
          {coverImageUrl
            ? "Arrastra el punto para elegir qué parte de la foto queda centrada en la portada. Recuerda Guardar."
            : "La portada usa la foto de cover real en la galería pública."}
        </p>
      </div>
    </div>
  )
}
