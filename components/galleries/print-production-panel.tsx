import { Printer, Download, Package, Frame, BookOpen, Check } from "lucide-react"

import type { GalleryPrintState } from "@/server/services/print-selection.service"

export function PrintProductionPanel({
  galleryId,
  state,
}: {
  galleryId: string
  state: GalleryPrintState | null
}) {
  if (!state) return null
  const hasAny = state.categories.some((c) => c.used > 0)
  // Mostrar el panel si la selección está habilitada o si ya hay selecciones.
  if (!state.enabled && !hasAny) return null

  const hasAlbum = state.categories.some((c) => c.type === "album_cover" && c.used > 0)
  const hasFrames = state.categories.some((c) => c.type === "frame" && c.used > 0)
  const hasPrints = state.categories.some((c) => c.type === "print" && c.used > 0)

  const base = `/api/galleries/${galleryId}/print-zip`
  const btnCls =
    "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12.5px] font-medium text-foreground transition-colors hover:border-border-strong"

  return (
    <div className="mt-5 rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Printer className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-foreground">
            Producción de impresión
          </h2>
        </div>
        {state.submitted ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
            <Check className="h-3 w-3" /> Cliente envió su selección
          </span>
        ) : state.enabled ? (
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            Selección abierta
          </span>
        ) : null}
      </div>

      {/* Resumen por categoría */}
      <div className="mb-4 flex flex-wrap gap-2">
        {state.categories.map((c) => {
          const full = c.used >= c.allowed
          return (
            <span
              key={c.key}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-[12px] text-muted-foreground"
            >
              {c.label}
              <span
                className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
                  full
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {c.used}/{c.allowed}
              </span>
            </span>
          )
        })}
      </div>

      {/* Descargas organizadas */}
      {hasAny ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <a href={`${base}?scope=all`} download className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-brand-foreground transition-colors hover:bg-brand/90">
              <Download className="h-3.5 w-3.5" />
              Descargar todo (ZIP)
            </a>
            {hasAlbum && (
              <a href={`${base}?scope=album`} download className={btnCls}>
                <BookOpen className="h-3.5 w-3.5" /> Solo álbum
              </a>
            )}
            {hasFrames && (
              <a href={`${base}?scope=frames`} download className={btnCls}>
                <Frame className="h-3.5 w-3.5" /> Solo marcos
              </a>
            )}
            {hasPrints && (
              <a href={`${base}?scope=prints`} download className={btnCls}>
                <Package className="h-3.5 w-3.5" /> Solo impresiones
              </a>
            )}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Carpetas: <code>Portada de Album/</code> · <code>Marcos/&lt;tamaño&gt;/</code> ·{" "}
            <code>Impresiones/&lt;tamaño&gt;/</code> — fotos originales (máxima
            calidad), organizadas por la selección del cliente.
          </p>
        </>
      ) : (
        <p className="text-[12.5px] text-muted-foreground">
          El cliente aún no ha seleccionado fotos para impresión.
        </p>
      )}
    </div>
  )
}
