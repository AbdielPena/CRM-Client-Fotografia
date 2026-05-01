"use client"

import { useState } from "react"
import { Star, ZoomIn, Trash2 } from "lucide-react"
import { toast } from "sonner"

interface Asset {
  id: string
  thumbKey: string | null
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

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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
      {!readOnly && selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-gray-900 text-white px-4 py-2.5 rounded-xl">
          <span className="text-sm font-medium">{selected.size} seleccionadas</span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-gray-300 hover:text-white"
            >
              Cancelar
            </button>
            <button
              onClick={deleteSelected}
              className="flex items-center gap-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar
            </button>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
        {assets.map((asset) => {
          const isSelected = selected.has(asset.id)
          const isFav = favorites.has(asset.id)

          return (
            <div
              key={asset.id}
              onClick={() => !readOnly ? toggleSelect(asset.id) : setLightbox(asset)}
              className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer group transition-all ${
                isSelected ? "ring-2 ring-blue-500 ring-offset-2" : "hover:ring-2 hover:ring-gray-300"
              }`}
            >
              {/* Thumbnail */}
              <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                {asset.thumbKey ? (
                  <img
                    src={`/api/galleries/${galleryId}/assets/${asset.id}/thumb`}
                    alt={asset.originalName}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                    <span className="text-gray-400 text-xs">Procesando</span>
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
                <div className="absolute top-1.5 left-1.5 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-lg"
            onClick={() => setLightbox(null)}
          >
            ✕
          </button>
          <img
            src={`/api/galleries/${galleryId}/assets/${lightbox.id}/thumb`}
            alt={lightbox.originalName}
            className="max-h-full max-w-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            {lightbox.originalName}
          </p>
        </div>
      )}
    </div>
  )
}
