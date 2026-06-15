"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { BookOpen, ExternalLink, UploadCloud, Loader2, ImageIcon } from "lucide-react"

import { updateGalleryBookConfigAction } from "@/server/actions/gallery.actions"

type BookSettings = {
  title?: string
  subtitle?: string
  quinceaneraName?: string
  eventDate?: string
  accent?: string
  showLogo?: boolean
}

export function LuxuryBookPanel({
  galleryId,
  publicToken,
  initial,
}: {
  galleryId: string
  publicToken: string | null
  initial: {
    enabled: boolean
    displayMode: "classic" | "book" | "both"
    templateId: string | null
    coverImage: string | null
    settings: BookSettings
  }
}) {
  const [isPending, startTransition] = useTransition()
  const [enabled, setEnabled] = useState(initial.enabled)
  const [displayMode, setDisplayMode] = useState(initial.displayMode)
  const [templateId, setTemplateId] = useState(initial.templateId ?? "luxury_xv")
  const [coverImage, setCoverImage] = useState(initial.coverImage ?? "")
  const [s, setS] = useState<BookSettings>(initial.settings ?? {})

  function patch(p: Partial<BookSettings>) {
    setS((cur) => ({ ...cur, ...p }))
  }

  function save() {
    startTransition(async () => {
      const res = await updateGalleryBookConfigAction(galleryId, {
        enabled,
        displayMode,
        templateId: templateId as "luxury_xv" | "luxury_wedding",
        coverImage: coverImage || null,
        settings: s,
      })
      if (res?.error) {
        const msg =
          Object.values(res.error).flat().filter(Boolean).join(" — ") ||
          "No se pudo guardar"
        toast.error(msg)
        return
      }
      toast.success("Luxury Book actualizado")
    })
  }

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-amber-100 text-amber-700">
            <BookOpen className="size-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Luxury Book Experience</h3>
            <p className="text-xs text-muted-foreground">
              Álbum digital interactivo de la entrega final (Abby XV Gallery)
            </p>
          </div>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="size-4"
          />
          Habilitar
        </label>
      </div>

      {enabled && (
        <div className="mt-5 space-y-5">
          {/* Modo de visualización */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Modo de visualización</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["classic", "Galería clásica"],
                  ["book", "Libro digital"],
                  ["both", "Ambos"],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setDisplayMode(val)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    displayMode === val
                      ? "border-brand bg-brand text-brand-foreground"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              &quot;Ambos&quot; muestra la galería clásica con un botón para abrir el libro.
            </p>
          </div>

          {/* Template */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Template">
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className={inp}
              >
                <option value="luxury_xv">Luxury XV (dorado)</option>
                <option value="luxury_wedding">Luxury Wedding (crema)</option>
              </select>
            </Field>
            <Field label="Color de acento">
              <input
                type="text"
                value={s.accent ?? ""}
                onChange={(e) => patch({ accent: e.target.value })}
                placeholder="#b89968"
                className={inp}
              />
            </Field>
          </div>

          {/* Portada */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nombre de la quinceañera / pareja">
              <input
                value={s.quinceaneraName ?? ""}
                onChange={(e) => patch({ quinceaneraName: e.target.value })}
                placeholder="Valentina"
                className={inp}
              />
            </Field>
            <Field label="Fecha del evento">
              <input
                value={s.eventDate ?? ""}
                onChange={(e) => patch({ eventDate: e.target.value })}
                placeholder="15 de Agosto 2026"
                className={inp}
              />
            </Field>
            <Field label="Título (opcional)">
              <input
                value={s.title ?? ""}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="Valentina XV"
                className={inp}
              />
            </Field>
            <Field label="Subtítulo (opcional)">
              <input
                value={s.subtitle ?? ""}
                onChange={(e) => patch({ subtitle: e.target.value })}
                placeholder="Álbum de entrega"
                className={inp}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <CoverField value={coverImage} onChange={setCoverImage} />
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={s.showLogo !== false}
                onChange={(e) => patch({ showLogo: e.target.checked })}
                className="size-4"
              />
              Mostrar logo del estudio
            </label>
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        {publicToken && enabled && displayMode !== "classic" ? (
          <a
            href={`/g/${publicToken}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3.5" /> Ver libro
          </a>
        ) : (
          <span />
        )}
        <button
          onClick={save}
          disabled={isPending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
        >
          {isPending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-foreground">{label}</label>
      {children}
    </div>
  )
}

const inp =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"

function CoverField({
  value,
  onChange,
}: {
  value: string
  onChange: (url: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("variant", "book-cover")
      const res = await fetch("/api/studio/branding/logo", { method: "POST", body: fd })
      const json = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !json.url) throw new Error(json.error || "Error al subir")
      onChange(json.url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al subir")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-muted/30">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Portada" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <UploadCloud className="size-3.5" />}
          {value ? "Cambiar portada" : "Subir portada"}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Quitar
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={onPick}
      />
    </div>
  )
}
