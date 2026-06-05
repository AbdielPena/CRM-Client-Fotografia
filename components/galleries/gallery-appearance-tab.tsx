"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Check, Loader2, Palette } from "lucide-react"
import { toast } from "sonner"

import {
  GALLERY_TEMPLATES,
  resolveGalleryTheme,
  galleryStyleTokens,
  type GalleryMode,
  type GalleryTextAlign,
} from "@/lib/galleries/templates"
import { saveGalleryAppearanceAction } from "@/server/actions/gallery.actions"

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
  }
}

const str = (v: unknown, def = "") => (typeof v === "string" ? v : def)
const numClamp = (v: unknown, def: number, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def

export function GalleryAppearanceTab({ galleryId, galleryType, initial }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const t = initial.theme ?? {}
  const c = initial.coverConfig ?? {}
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
  })

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
            title: s.coverTitle.trim() || null,
            subtitle: s.coverSubtitle.trim() || null,
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

        {/* Portada */}
        <section className="sf-card space-y-4 p-5">
          <h3 className="text-sm font-semibold text-foreground">Portada</h3>
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

      {/* Previsualización de portada */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Vista previa de portada</p>
        <div
          className="relative flex aspect-[3/4] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-border p-5"
          style={{
            background:
              s.mode === "dark"
                ? "linear-gradient(160deg,#1b1b22,#0b0b0d)"
                : "linear-gradient(160deg,#f4f4f5,#e4e4e7)",
            fontFamily: tokens.fontStack,
            textAlign: s.textAlign,
            alignItems: s.textAlign === "left" ? "flex-start" : s.textAlign === "right" ? "flex-end" : "center",
          }}
        >
          {s.overlay !== "none" && (
            <span
              className="pointer-events-none absolute inset-0"
              style={{
                background: s.overlay === "dark" ? "#000" : "#fff",
                opacity: s.overlayIntensity,
              }}
            />
          )}
          <div className="relative z-10">
            <p
              className="text-2xl font-semibold leading-tight"
              style={{ color: tokens.fg }}
            >
              {s.coverTitle || "Nombre de la galería"}
            </p>
            {s.coverSubtitle && (
              <p className="mt-1 text-sm" style={{ color: tokens.muted }}>
                {s.coverSubtitle}
              </p>
            )}
            {s.showButton && (
              <span
                className="mt-4 inline-block rounded-full px-4 py-1.5 text-xs font-semibold"
                style={{ background: tokens.accent, color: "#fff" }}
              >
                {s.buttonLabel || (galleryType === "final_delivery" ? "Ver mis fotos" : "Entrar")}
              </span>
            )}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          La portada usa la imagen de cover real en la galería pública; aquí ves el estilo.
        </p>
      </div>
    </div>
  )
}
