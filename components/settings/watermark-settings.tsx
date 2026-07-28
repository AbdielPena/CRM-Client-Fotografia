"use client"

import * as React from "react"
import { toast } from "sonner"
import { Loader2, Upload, Trash2, Image as ImageIcon, Type } from "lucide-react"

/**
 * Configuración de la marca de agua del estudio.
 *
 * Es la que usan por DEFECTO todas las galerías de selección. Las galerías de
 * entrega nunca llevan marca — esas fotos ya son del cliente.
 *
 * La vista previa reproduce en el navegador la misma cuenta que hace el
 * servidor (tamaño = % del ancho de la foto, margen = % del ancho, giro en
 * grados), así lo que se ve aquí es lo que sale estampado.
 */

export type WatermarkPosition =
  | "center"
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"
  | "tile"

export type WatermarkConfig = {
  enabled: boolean
  mode: "text" | "image"
  text: string | null
  imageKey: string | null
  position: WatermarkPosition
  opacity: number
  scale: number
  rotation: number
  margin: number
}

const POSITION_GRID: Array<{ value: WatermarkPosition; label: string }> = [
  { value: "top-left", label: "↖" },
  { value: "top-center", label: "↑" },
  { value: "top-right", label: "↗" },
  { value: "middle-left", label: "←" },
  { value: "center", label: "•" },
  { value: "middle-right", label: "→" },
  { value: "bottom-left", label: "↙" },
  { value: "bottom-center", label: "↓" },
  { value: "bottom-right", label: "↘" },
]

const CARD =
  "rounded-2xl border border-border bg-card p-5 sm:p-6"
const LABEL = "text-[12px] font-semibold uppercase tracking-wide text-muted-foreground"

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix: string
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between">
        <span className={LABEL}>{label}</span>
        <span className="text-[12px] tabular-nums text-foreground">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--brand,#111)]"
      />
    </label>
  )
}

export function WatermarkSettings({
  initial,
  /** "studio" = la plantilla general. "gallery" = ajuste de una galería. */
  scope = "studio",
  galleryId,
  initialUseStudioDefault = true,
  photoCount = 0,
}: {
  initial: WatermarkConfig
  scope?: "studio" | "gallery"
  galleryId?: string
  initialUseStudioDefault?: boolean
  photoCount?: number
}) {
  const [cfg, setCfg] = React.useState<WatermarkConfig>(initial)
  const [useStudio, setUseStudio] = React.useState(initialUseStudioDefault)
  const [saving, setSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [applying, setApplying] = React.useState<null | {
    done: number
    total: number
  }>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const isGallery = scope === "gallery"

  const set = <K extends keyof WatermarkConfig>(k: K, v: WatermarkConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }))

  const imageUrl = cfg.imageKey
    ? `/api/studio/watermark/image?key=${encodeURIComponent(cfg.imageKey)}`
    : null

  async function upload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(
        isGallery
          ? `/api/galleries/${galleryId}/watermark/upload`
          : "/api/studio/watermark/upload",
        { method: "POST", body: fd },
      )
      const json = (await res.json()) as { imageKey?: string; error?: string }
      if (!res.ok || !json.imageKey) {
        throw new Error(json.error ?? "No se pudo subir la imagen")
      }
      setCfg((c) => ({ ...c, imageKey: json.imageKey!, mode: "image" }))
      toast.success("Imagen cargada")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir la imagen")
    } finally {
      setUploading(false)
    }
  }

  const customizing = !isGallery || !useStudio

  async function save() {
    if (customizing) {
      if (cfg.enabled && cfg.mode === "image" && !cfg.imageKey) {
        toast.error("Sube la imagen de la marca de agua o cambia a modo texto")
        return
      }
      if (cfg.enabled && cfg.mode === "text" && !cfg.text?.trim()) {
        toast.error("Escribe el texto de la marca de agua")
        return
      }
    }
    setSaving(true)
    try {
      const payload = {
        enabled: cfg.enabled,
        mode: cfg.mode,
        text: cfg.text?.trim() || null,
        imageKey: cfg.imageKey,
        position: cfg.position,
        opacity: cfg.opacity,
        scale: Math.round(cfg.scale),
        rotation: Math.round(cfg.rotation),
        margin: Math.round(cfg.margin),
      }
      const res = await fetch(
        isGallery ? `/api/galleries/${galleryId}/watermark` : "/api/studio/watermark",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isGallery ? { ...payload, useStudioDefault: useStudio } : payload,
          ),
        },
      )
      if (!res.ok) throw new Error("No se pudo guardar")
      toast.success("Marca de agua guardada")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }

  /**
   * Aplica la marca a las fotos que YA estaban subidas de esta galería.
   * Opcional: las nuevas salen marcadas solas. Va por tandas para no cargar el
   * servidor de golpe.
   */
  async function applyToExisting() {
    if (!galleryId) return
    setApplying({ done: 0, total: photoCount })
    try {
      for (let guard = 0; guard < 2000; guard++) {
        const res = await fetch(
          `/api/galleries/${galleryId}/watermark/rebuild?limit=25`,
          { method: "POST" },
        )
        if (!res.ok) throw new Error("Falló al aplicar")
        const r = (await res.json()) as {
          processed: number
          remaining: number
          total: number
        }
        setApplying({ done: Math.max(0, r.total - r.remaining), total: r.total })
        if (r.remaining === 0 || r.processed === 0) break
      }
      toast.success("Marca aplicada a las fotos de esta galería")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo aplicar")
    } finally {
      setApplying(null)
    }
  }

  // ── Vista previa ──────────────────────────────────────────────────────────
  // Misma cuenta que el servidor: el ancho de la marca es un % del ancho de la
  // foto y el margen también, así que basta con porcentajes de CSS.
  const markStyle: React.CSSProperties = {
    width: `${cfg.scale}%`,
    opacity: cfg.opacity,
    transform: `rotate(${cfg.rotation}deg)`,
    transformOrigin: "center",
  }
  const posStyle: React.CSSProperties = (() => {
    const m = `${cfg.margin}%`
    const s: React.CSSProperties = { position: "absolute" }
    if (cfg.position === "tile" || cfg.position === "center") {
      s.left = "50%"
      s.top = "50%"
      s.translate = "-50% -50%"
      return s
    }
    if (cfg.position.startsWith("top-")) s.top = m
    else if (cfg.position.startsWith("bottom-")) s.bottom = m
    else {
      s.top = "50%"
      s.translate = "0 -50%"
    }
    if (cfg.position.endsWith("-left")) s.left = m
    else if (cfg.position.endsWith("-right")) s.right = m
    else {
      s.left = "50%"
      s.translate = s.translate ? "-50% -50%" : "-50% 0"
    }
    return s
  })()

  const MarkContent = cfg.mode === "image" && imageUrl
    ? // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt="" className="block w-full" style={markStyle} />
    : cfg.text?.trim()
      ? (
          <span
            className="block whitespace-nowrap font-semibold text-white"
            style={{
              ...markStyle,
              width: "auto",
              fontSize: `${Math.max(8, cfg.scale * 0.42)}cqw`,
              textShadow: "0 1px 3px rgba(0,0,0,.45)",
            }}
          >
            {cfg.text}
          </span>
        )
      : null

  return (
    <div className="space-y-5">
      {/* Interruptor principal */}
      <div className={CARD}>
        {isGallery && (
          <label className="mb-4 flex items-start gap-3 border-b border-border pb-4">
            <input
              type="checkbox"
              checked={useStudio}
              onChange={(e) => setUseStudio(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--brand,#111)]"
            />
            <span>
              <span className="block text-sm font-semibold text-foreground">
                Usar la marca de agua del estudio
              </span>
              <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                Lo normal. Se configura una sola vez en{" "}
                <a
                  href="/settings/watermark"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Configuración → Marca de agua
                </a>{" "}
                y vale para todas tus galerías de selección. Desmárcalo solo si
                esta galería necesita algo distinto.
              </span>
            </span>
          </label>
        )}

        <label
          className={`flex items-start gap-3 ${customizing ? "" : "opacity-50"}`}
        >
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => set("enabled", e.target.checked)}
            disabled={!customizing}
            className="mt-0.5 h-4 w-4 accent-[var(--brand,#111)]"
          />
          <span>
            <span className="block text-sm font-semibold text-foreground">
              {isGallery
                ? "Marca de agua en esta galería"
                : "Marca de agua en las galerías de selección"}
            </span>
            <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
              Se estampa en todas las fotos que el cliente ve al elegir — foto
              grande y miniaturas. Las galerías de <strong>entrega final</strong>{" "}
              nunca la llevan: esas fotos ya son del cliente.
            </span>
          </span>
        </label>

        {isGallery && photoCount > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={applyToExisting}
              disabled={!!applying}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              {applying && <Loader2 className="h-4 w-4 animate-spin" />}
              {applying
                ? `Aplicando… ${applying.done}/${applying.total}`
                : "Aplicar a las fotos ya subidas"}
            </button>
            <span className="text-[11.5px] text-muted-foreground">
              Opcional. Las fotos nuevas ya salen marcadas solas; esto reescribe
              las {photoCount} que ya están, sin cambiar ningún enlace.
            </span>
          </div>
        )}
      </div>

      <div
        className={`grid gap-5 lg:grid-cols-[1fr_minmax(320px,42%)] ${
          customizing ? "" : "pointer-events-none opacity-50"
        }`}
      >
        {/* Controles */}
        <div className={CARD}>
          <p className={LABEL}>Qué se estampa</p>
          <div className="mt-2 inline-flex rounded-lg border border-border p-0.5">
            {(
              [
                { v: "image" as const, label: "Imagen", Icon: ImageIcon },
                { v: "text" as const, label: "Texto", Icon: Type },
              ]
            ).map(({ v, label, Icon }) => (
              <button
                key={v}
                type="button"
                onClick={() => set("mode", v)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  cfg.mode === v
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {cfg.mode === "image" ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/webp,image/svg+xml,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void upload(f)
                  e.target.value = ""
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {cfg.imageKey ? "Cambiar imagen" : "Subir imagen"}
              </button>
              {cfg.imageKey && (
                <button
                  type="button"
                  onClick={() => set("imageKey", null)}
                  className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Quitar
                </button>
              )}
              <span className="text-[11.5px] text-muted-foreground">
                PNG con fondo transparente da el mejor resultado.
              </span>
            </div>
          ) : (
            <label className="mt-4 block">
              <span className={LABEL}>Texto</span>
              <input
                value={cfg.text ?? ""}
                onChange={(e) => set("text", e.target.value)}
                placeholder="AbbyPixel"
                maxLength={120}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-border-strong"
              />
            </label>
          )}

          <div className="mt-6">
            <p className={LABEL}>Posición</p>
            <div className="mt-2 flex flex-wrap items-start gap-4">
              <div className="grid grid-cols-3 gap-1">
                {POSITION_GRID.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => set("position", p.value)}
                    aria-label={p.value}
                    className={`h-9 w-9 rounded-md border text-[15px] leading-none transition-colors ${
                      cfg.position === p.value
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => set("position", "tile")}
                className={`rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors ${
                  cfg.position === "tile"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                Repetida en mosaico
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Slider
              label="Tamaño"
              value={cfg.scale}
              min={3}
              max={100}
              suffix="% del ancho"
              onChange={(v) => set("scale", v)}
            />
            <Slider
              label="Opacidad"
              value={Math.round(cfg.opacity * 100)}
              min={2}
              max={100}
              suffix="%"
              onChange={(v) => set("opacity", v / 100)}
            />
            <Slider
              label="Orientación"
              value={cfg.rotation}
              min={-180}
              max={180}
              suffix="°"
              onChange={(v) => set("rotation", v)}
            />
            <Slider
              label="Separación del borde"
              value={cfg.margin}
              min={0}
              max={45}
              suffix="%"
              onChange={(v) => set("margin", v)}
            />
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-[13px] font-semibold text-background hover:opacity-90 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </button>
            <span className="text-[11.5px] text-muted-foreground">
              Aplica a las galerías de selección que se creen y a las fotos que
              subas de ahora en adelante.
            </span>
          </div>
        </div>

        {/* Vista previa */}
        <div className={CARD}>
          <p className={LABEL}>Vista previa</p>
          <div
            className="relative mt-2 aspect-[3/2] w-full overflow-hidden rounded-xl"
            style={{
              containerType: "inline-size",
              background:
                "linear-gradient(135deg,#8a97a8 0%,#5f6b7a 38%,#3d4652 70%,#2a3038 100%)",
            }}
          >
            {/* Formas suaves para que se note el contraste de la marca */}
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(60% 55% at 25% 30%, rgba(255,255,255,.30), transparent 70%), radial-gradient(45% 45% at 80% 75%, rgba(0,0,0,.35), transparent 70%)",
              }}
            />
            {!cfg.enabled ? (
              <div className="absolute inset-0 grid place-items-center">
                <span className="rounded-full bg-black/45 px-3 py-1 text-[12px] text-white">
                  Marca de agua apagada
                </span>
              </div>
            ) : cfg.position === "tile" ? (
              <div className="absolute inset-0 flex flex-wrap content-start gap-[6%] p-[3%]">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} style={{ width: `${cfg.scale}%` }}>
                    {MarkContent}
                  </div>
                ))}
              </div>
            ) : (
              <div style={posStyle}>{MarkContent}</div>
            )}
          </div>
          <p className="mt-2 text-[11.5px] text-muted-foreground">
            Referencia: así se verá sobre la foto. El tamaño es proporcional al
            ancho, así que se ve igual en fotos grandes y pequeñas.
          </p>
        </div>
      </div>
    </div>
  )
}
