"use client"

import { useState } from "react"
import { Star, ZoomIn, Trash2 } from "lucide-react"
import { toast } from "sonner"

interface Asset {
  id: string
  thumbUrl: string | null
  webUrl?: string | null
  originalName: string
  status: string
  isFavorite: boolean
  width?: number
  height?: number
}

interface AssetGridProps {
  assets: Asset[]
  galleryId: string
  readOnly?: boolean
}

export function AssetGrid({ assets, galleryId, readOnly = false }: AssetGridProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [favorites, setFavorites] = useState<Set<string>>(
    new Set(assets.filter((a) => a.isFavorite).map((a) => a.id))
  )
  const [lightbox, setLightbox] = useState<Asset | null>(null)
  // Anchor para selección por rango con shift+click
  const [lastClickedIdx, setLastClickedIdx] = useState<number | null>(null)

  const toggleSelect = (id: string, idx: number, shiftKey: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)

      // Shift+click → seleccionar rango desde lastClickedIdx hasta idx
      if (shiftKey && lastClickedIdx !== null && lastClickedIdx !== idx) {
        const [start, end] =
          lastClickedIdx < idx ? [lastClickedIdx, idx] : [idx, lastClickedIdx]
        // Si el ancla estaba seleccionada, agregamos rango. Si no, quitamos.
        const anchorSelected = prev.has(assets[lastClickedIdx].id)
        for (let i = start; i <= end; i++) {
          if (anchorSelected) next.add(assets[i].id)
          else next.delete(assets[i].id)
        }
        return next
      }

      // Click normal → toggle individual + actualizar ancla
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setLastClickedIdx(idx)
  }

  const selectAll = () => {
    setSelected(new Set(assets.map((a) => a.id)))
  }

  const clearSelection = () => {
    setSelected(new Set())
    setLastClickedIdx(null)
  }

  const toggleFavorite = async (assetId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const isFav = favorites.has(assetId)
    setFavorites((prev) => {
      const next = new Set(prev)
      if (isFav) next.delete(assetId)
      else next.add(assetId)
      return next
    })

    try {
      await fetch(`/api/galleries/${galleryId}/assets/${assetId}/favorite`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: !isFav }),
      })
    } catch {
      // revert
      setFavorites((prev) => {
        const next = new Set(prev)
        if (isFav) next.add(assetId)
        else next.delete(assetId)
        return next
      })
      toast.error("Error actualizando favorito")
    }
  }

  const deleteSelected = async () => {
    if (selected.size === 0) return
    if (!confirm(`¿Eliminar ${selected.size} foto(s)? Esta acción no se puede deshacer.`)) return

    try {
      await fetch(`/api/galleries/${galleryId}/assets/bulk-delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetIds: Array.from(selected) }),
      })
      toast.success(`${selected.size} foto(s) eliminadas`)
      setSelected(new Set())
      window.location.reload()
    } catch {
      toast.error("Error eliminando fotos")
    }
  }

  return (
    <div>
      {/* Selection toolbar */}
      {!readOnly && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
          <span className="text-sm font-medium text-foreground">
            {selected.size === 0
              ? `${assets.length} foto${assets.length === 1 ? "" : "s"}`
              : `${selected.size} seleccionada${selected.size === 1 ? "" : "s"}`}
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            · <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">Shift</kbd>+click para rango
          </span>
          <div className="ml-auto flex items-center gap-2">
            {selected.size === 0 ? (
              <button
                onClick={selectAll}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Seleccionar todas
              </button>
            ) : (
              <>
                <button
                  onClick={clearSelection}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
                <button
                  onClick={deleteSelected}
                  className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar ({selected.size})
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
        {assets.map((asset, idx) => {
          const isSelected = selected.has(asset.id)
          const isFav = favorites.has(asset.id)

          return (
            <div
              key={asset.id}
              onClick={(e) =>
                !readOnly ? toggleSelect(asset.id, idx, e.shiftKey) : setLightbox(asset)
              }
              className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer group transition-all ${
                isSelected ? "ring-2 ring-blue-500 ring-offset-2" : "hover:ring-2 hover:ring-gray-300"
              }`}
            >
              {/* Thumbnail — URL pública resuelta en server (local fs o Supabase CDN) */}
              <div className="w-full h-full bg-muted flex items-center justify-center">
                {asset.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.thumbUrl}
                    alt={asset.originalName}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                    <span className="text-muted-foreground text-xs">Procesando</span>
                  </div>
                )}
              </div>

              {/* Hover overlay */}
              <div className={`absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all ${isSelected ? "bg-black/30" : ""}`} />

              {/* Favorite */}
              {!readOnly && (
                <button
                  onClick={(e) => toggleFavorite(asset.id, e)}
                  className={`absolute top-1.5 right-1.5 p-1 rounded-full transition-all ${
                    isFav
                      ? "bg-amber-400 text-white opacity-100"
                      : "bg-black/30 text-white opacity-0 group-hover:opacity-100"
                  }`}
                >
                  <Star className="h-3.5 w-3.5" fill={isFav ? "currentColor" : "none"} />
                </button>
              )}

              {/* Zoom icon */}
              <button
                onClick={(e) => { e.stopPropagation(); setLightbox(asset) }}
                className="absolute bottom-1.5 right-1.5 p-1 bg-black/30 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>

              {/* Select indicator */}
              {isSelected && (
                <div className="absolute top-1.5 left-1.5 w-5 h-5 bg-brand rounded-full flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Lightbox — tamaño contenido, no full screen */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/90 p-2 hover:bg-white/10 rounded-lg z-10"
            onClick={() => setLightbox(null)}
            aria-label="Cerrar"
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.webUrl ?? lightbox.thumbUrl ?? ""}
            alt={lightbox.originalName}
            className="max-h-[80vh] max-w-[60vw] w-auto h-auto object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />
          <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/70 text-sm font-medium">
            {lightbox.originalName}
          </p>
        </div>
      )}
    </div>
  )
}
