"use client"

import { useCallback, useEffect, useState } from "react"
import { X, ChevronLeft, ChevronRight, Download, Heart } from "lucide-react"

import { cn } from "@/lib/utils/cn"

type Asset = {
  id: string
  width: number | null
  height: number | null
  thumbUrl: string | null
  webUrl: string | null
  lqip?: string | null
  aspect?: number | null
}

type Gallery = {
  name: string
  subtitle?: string | null
  eventDate?: string | null
  accentColor?: string | null
  coverWebUrl?: string | null
  allow_download: boolean
}

type Studio = {
  name: string
  logoUrl: string | null
  primaryColor?: string | null
  hideBranding?: boolean
  footerHtml?: string | null
}

function fmtDate(d?: string | null): string | null {
  if (!d) return null
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString("es", {
      day: "numeric", month: "long", year: "numeric",
    })
  } catch {
    return null
  }
}

/**
 * Vista pública de SOLO la selección final del cliente (favoritos), separada de
 * la galería completa. Read-only: ver, ampliar y (si se permite) descargar.
 */
export function PublicSelectionView({
  token,
  gallery,
  assets,
  studio,
}: {
  token: string
  gallery: Gallery
  assets: Asset[]
  studio: Studio
}): JSX.Element {
  const accent = gallery.accentColor || studio.primaryColor || "#b89968"
  const [active, setActive] = useState<number | null>(null)
  const date = fmtDate(gallery.eventDate)

  const close = useCallback(() => setActive(null), [])
  const prev = useCallback(
    () => setActive((i) => (i === null ? i : (i - 1 + assets.length) % assets.length)),
    [assets.length],
  )
  const next = useCallback(
    () => setActive((i) => (i === null ? i : (i + 1) % assets.length)),
    [assets.length],
  )

  useEffect(() => {
    if (active === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
      else if (e.key === "ArrowLeft") prev()
      else if (e.key === "ArrowRight") next()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [active, close, prev, next])

  const cur = active !== null ? assets[active] : null

  // Mosaico en ORDEN DE LECTURA: las columnas CSS llenan por columna (de arriba
  // a abajo) y barajan el orden real. Repartimos round-robin por índice y
  // apilamos cada columna → la fila superior leída de izq. a der. va en orden.
  const [selCols, setSelCols] = useState(3)
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth
      setSelCols(w >= 1024 ? 4 : w >= 640 ? 3 : 2)
    }
    compute()
    window.addEventListener("resize", compute)
    return () => window.removeEventListener("resize", compute)
  }, [])
  const selColumns = Array.from({ length: selCols }, () => [] as { a: Asset; i: number }[])
  assets.forEach((a, i) => selColumns[i % selCols]!.push({ a, i }))

  return (
    <div className="min-h-screen bg-[#fbf9f6] text-[#1a1614]">
      {/* Header */}
      <header className="border-b border-black/5 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            {studio.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={studio.logoUrl} alt={studio.name} className="h-8 w-auto object-contain" />
            )}
            <span className="text-sm font-medium text-black/60">{studio.name}</span>
          </div>
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: `${accent}1a`, color: accent }}
          >
            <Heart className="mr-1 inline h-3.5 w-3.5 fill-current" />
            Tu selección
          </span>
        </div>
      </header>

      {/* Título */}
      <section className="mx-auto max-w-6xl px-5 pt-10 pb-6 text-center">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em]" style={{ color: accent }}>
          Selección final{date ? ` · ${date}` : ""}
        </p>
        <h1 className="text-3xl font-light tracking-tight sm:text-4xl">{gallery.name}</h1>
        <p className="mt-3 text-sm text-black/55">
          {assets.length} {assets.length === 1 ? "foto elegida" : "fotos elegidas"}
          {gallery.subtitle ? ` · ${gallery.subtitle}` : ""}
        </p>
      </section>

      {/* Grid masonry */}
      <main className="mx-auto max-w-6xl px-3 pb-20">
        {assets.length === 0 ? (
          <p className="py-20 text-center text-sm text-black/50">
            Todavía no hay fotos en la selección.
          </p>
        ) : (
          <div className="flex items-start gap-2">
            {selColumns.map((col, ci) => (
              <div key={ci} className="flex min-w-0 flex-1 flex-col gap-2">
                {col.map(({ a, i }) => (
                  <button
                    key={a.id}
                    onClick={() => setActive(i)}
                    className="group relative block w-full overflow-hidden rounded-lg bg-black/5"
                    style={{ aspectRatio: a.width && a.height ? `${a.width}/${a.height}` : undefined }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.thumbUrl ?? a.webUrl ?? ""}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      style={a.lqip ? { backgroundImage: `url(${a.lqip})`, backgroundSize: "cover" } : undefined}
                    />
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-black/5 py-6 text-center text-xs text-black/40">
        {studio.footerHtml ? (
          <div dangerouslySetInnerHTML={{ __html: studio.footerHtml }} />
        ) : (
          <span>{studio.name}</span>
        )}
        {!studio.hideBranding && (
          <p className="mt-1 text-[10px] text-black/30">Hecho con StudioFlow</p>
        )}
      </footer>

      {/* Lightbox */}
      {cur && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={close}
        >
          <button
            onClick={close}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
          {assets.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); prev() }}
                className="absolute left-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                aria-label="Anterior"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); next() }}
                className="absolute right-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                aria-label="Siguiente"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cur.webUrl ?? cur.thumbUrl ?? ""}
            alt=""
            className="max-h-[88vh] max-w-[92vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {gallery.allow_download && (
            <a
              href={`/api/galleries/public/${token}/download/${cur.id}`}
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90"
            >
              <Download className="h-4 w-4" /> Descargar
            </a>
          )}
          <span className="absolute bottom-5 right-5 text-xs text-white/60">
            {(active ?? 0) + 1} / {assets.length}
          </span>
        </div>
      )}
    </div>
  )
}
