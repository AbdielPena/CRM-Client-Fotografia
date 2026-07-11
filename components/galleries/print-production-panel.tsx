import {
  Printer,
  Download,
  Package,
  Frame,
  BookOpen,
  Check,
  CalendarDays,
  Sparkles,
} from "lucide-react"

import type { PrintAdminView } from "@/server/services/print-selection.service"
import { PrintLockToggle } from "@/components/galleries/print-lock-toggle"
import { PrintWhatsAppShare } from "@/components/galleries/print-whatsapp-share"
import { PrintReadyButton } from "@/components/galleries/print-ready-button"

function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString("es-DO", {
      timeZone: "America/Santo_Domingo",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return null
  }
}

function ThumbRow({
  ids,
  thumbByAsset,
  empty,
}: {
  ids: string[]
  thumbByAsset: Record<string, string | null>
  empty: string
}) {
  if (!ids.length) {
    return <p className="text-[12px] italic text-muted-foreground">{empty}</p>
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {ids.map((id) => {
        const t = thumbByAsset[id]
        return (
          <div
            key={id}
            className="h-16 w-16 overflow-hidden rounded-lg border border-border bg-muted"
          >
            {t ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function PrintProductionPanel({
  view,
  title = "Producción de impresión",
  waPrintTemplate,
  printsReadyTemplate,
}: {
  view: PrintAdminView | null
  title?: string
  waPrintTemplate?: string
  printsReadyTemplate?: string
}) {
  if (!view) return null
  const { galleryId, galleryName, state, thumbByAsset } = view

  const hasAuto = state.categories.some((c) => c.mode === "auto")
  const anySelected = state.categories.some((c) => c.used > 0)
  // Solo ENTREGA FINAL: `state.enabled` ya exige entrega. NO mostrar en galerías
  // de selección aunque el plan tenga una impresión "automática" (hasAuto).
  if (!state.enabled && !anySelected) return null

  const coverCat = state.categories.find((c) => c.type === "album_cover")
  const frameCats = state.categories.filter((c) => c.type === "frame")
  const manualPrintCats = state.categories.filter(
    (c) => c.type === "print" && c.mode === "manual",
  )
  const autoPrintCats = state.categories.filter(
    (c) => c.type === "print" && c.mode === "auto",
  )

  const base = `/api/galleries/${galleryId}/print-zip`
  const btnCls =
    "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12.5px] font-medium text-foreground transition-colors hover:border-border-strong"

  const submittedAt = fmtDate(state.submittedAt)
  const hasAlbumSel = !!coverCat && coverCat.used > 0
  const hasFrameSel = frameCats.some((c) => c.used > 0)
  const hasManualPrintSel = manualPrintCats.some((c) => c.used > 0)
  const canDownloadPrints = hasManualPrintSel || hasAuto
  const canDownloadAll = state.deliveredCount > 0 || anySelected

  const statusLabel = state.submitted
    ? "Completado"
    : state.locked
      ? "Selección cerrada"
      : state.enabled
        ? "En proceso"
        : "—"

  return (
    <div className="mt-5 rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Printer className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {state.submitted ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
              <Check className="h-3 w-3" /> Completado
            </span>
          ) : state.locked ? (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              Selección cerrada
            </span>
          ) : state.enabled ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              Selección abierta
            </span>
          ) : null}
          <PrintLockToggle galleryId={galleryId} locked={state.locked} />
        </div>
      </div>

      {/* Estado + fecha */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
        <span>
          Estado:{" "}
          <span className="font-medium text-foreground">{statusLabel}</span>
        </span>
        {submittedAt && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" /> {submittedAt}
          </span>
        )}
        <span>{galleryName}</span>
      </div>

      {/* Portada del álbum */}
      {coverCat && (
        <div className="mb-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5" /> {coverCat.label}
          </p>
          <ThumbRow
            ids={coverCat.assetIds}
            thumbByAsset={thumbByAsset}
            empty="El cliente aún no eligió la portada."
          />
        </div>
      )}

      {/* Marcos: foto elegida por cada marco */}
      {frameCats.length > 0 && (
        <div className="mb-4 space-y-3">
          {frameCats.map((c) => (
            <div key={c.key}>
              <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Frame className="h-3.5 w-3.5" /> {c.label}
                <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {c.used}/{c.allowed}
                </span>
              </p>
              <ThumbRow
                ids={c.assetIds}
                thumbByAsset={thumbByAsset}
                empty="El cliente aún no eligió la foto."
              />
            </div>
          ))}
        </div>
      )}

      {/* Impresiones (cantidad seleccionada + modo automático) */}
      {(manualPrintCats.length > 0 || autoPrintCats.length > 0) && (
        <div className="mb-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Package className="h-3.5 w-3.5" /> Impresiones
          </p>
          <div className="flex flex-wrap gap-2">
            {manualPrintCats.map((c) => {
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
            {autoPrintCats.map((c) => (
              <span
                key={c.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand-soft px-2.5 py-1 text-[12px] text-brand"
              >
                <Sparkles className="h-3 w-3" />
                {c.label} · Automático
                <span className="rounded-full bg-brand/15 px-1.5 text-[10px] font-semibold tabular-nums">
                  {c.allowed}
                </span>
              </span>
            ))}
          </div>
          {autoPrintCats.length > 0 && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Modo automático: se imprimen todas las fotos entregadas. No requiere
              selección del cliente.
            </p>
          )}
        </div>
      )}

      {/* Descargas organizadas */}
      {canDownloadAll ? (
        <>
          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
            <a
              href={`${base}?scope=all`}
              download
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
            >
              <Download className="h-3.5 w-3.5" />
              Descargar todo (ZIP)
            </a>
            {state.deliveredCount > 0 && (
              <a href={`${base}?scope=digitales`} download className={btnCls}>
                <Download className="h-3.5 w-3.5" /> Solo entregadas digitales
              </a>
            )}
            {hasAlbumSel && (
              <a href={`${base}?scope=album`} download className={btnCls}>
                <BookOpen className="h-3.5 w-3.5" /> Solo portada
              </a>
            )}
            {hasFrameSel && (
              <a href={`${base}?scope=frames`} download className={btnCls}>
                <Frame className="h-3.5 w-3.5" /> Solo marcos
              </a>
            )}
            {canDownloadPrints && (
              <a href={`${base}?scope=prints`} download className={btnCls}>
                <Package className="h-3.5 w-3.5" /> Solo impresiones
              </a>
            )}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Carpetas: <code>TODAS LAS ENTREGADAS DIGITALES/</code> ·{" "}
            <code>PORTADA - Álbum &lt;tamaño&gt;/</code> ·{" "}
            <code>Marco &lt;tamaño&gt;/</code> · <code>&lt;tamaño&gt;/</code> (ej.
            5x7) — fotos originales (máxima calidad).
          </p>
        </>
      ) : (
        <p className="border-t border-border/60 pt-4 text-[12.5px] text-muted-foreground">
          El cliente aún no ha seleccionado fotos para impresión.
        </p>
      )}

      {/* Enviar al cliente el link para elegir sus impresiones (WhatsApp) */}
      {state.enabled && (
        <PrintWhatsAppShare
          token={view.publicToken}
          galleryName={galleryName}
          clientName={view.clientName}
          clientPhone={view.clientPhone}
          template={waPrintTemplate}
        />
      )}

      {/* Avisar que las impresiones están listas para retirar (correo + WhatsApp) */}
      <PrintReadyButton
        galleryId={galleryId}
        galleryName={galleryName}
        clientName={view.clientName}
        clientPhone={view.clientPhone}
        printReadyAt={view.printReadyAt}
        template={printsReadyTemplate}
      />
    </div>
  )
}
