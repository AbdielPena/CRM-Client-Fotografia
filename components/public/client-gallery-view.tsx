"use client"

import { useState } from "react"
import { Download, Heart, ZoomIn, Lock, Image as ImageIcon, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"

interface GalleryAsset {
  id: string
  thumbKey: string | null
  webKey: string | null
  highKey: string | null
  watermarkedKey: string | null
  originalKey: string | null
  originalName: string
  width?: number
  height?: number
  isFavorite: boolean
}

interface ClientGalleryViewProps {
  token: string
  gallery: {
    id: string
    name: string
    description?: string
    studioName: string
    studioLogoUrl?: string
    allowDownload: boolean
    allowProofing: boolean
    downloadResolution: string
    watermarkEnabled: boolean
    expiresAt?: string
    requiresPassword: boolean
    assets: GalleryAsset[]
  }
}

export function ClientGalleryView({ token, gallery }: ClientGalleryViewProps) {
  const [password, setPassword] = useState("")
  const [unlocked, setUnlocked] = useState(!gallery.requiresPassword)
  const [passwordError, setPasswordError] = useState("")
  const [assets, setAssets] = useState<GalleryAsset[]>(gallery.assets)
  const [favorites, setFavorites] = useState<Set<string>>(
    new Set(gallery.assets.filter((a) => a.isFavorite).map((a) => a.id))
  )
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [filter, setFilter] = useState<"all" | "favorites">("all")

  const handleUnlock = async () => {
    const res = await fetch(`/api/galleries/public/${token}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      const data = await res.json()
      setAssets(data.assets)
      setUnlocked(true)
      setPasswordError("")
    } else {
      setPasswordError("Contraseña incorrecta")
    }
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

    await fetch(`/api/galleries/public/${token}/favorite`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId, isFavorite: !isFav }),
    })
  }

  const downloadAsset = async (asset: GalleryAsset, e: React.MouseEvent) => {
    e.stopPropagation()
    const res = await fetch(
      `/api/galleries/public/${token}/download/${asset.id}`
    )
    if (!res.ok) { toast.error("No se pudo descargar la foto"); return }

    const { url } = await res.json()
    const a = document.createElement("a")
    a.href = url
    a.download = asset.originalName
    a.click()
  }

  const displayAssets = filter === "favorites"
    ? assets.filter((a) => favorites.has(a.id))
    : assets

  const getThumbUrl = (asset: GalleryAsset) => {
    const key = gallery.watermarkEnabled
      ? (asset.watermarkedKey ?? asset.thumbKey)
      : asset.thumbKey
    return key
      ? `/api/galleries/public/${token}/asset/${asset.id}/thumb`
      : null
  }

  // Password gate
  if (!unlocked) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-10 max-w-sm w-full text-center">
          {gallery.studioLogoUrl ? (
            <img src={gallery.studioLogoUrl} alt={gallery.studioName} className="h-10 mx-auto mb-6" />
          ) : (
            <p className="text-white font-semibold text-lg mb-6">{gallery.studioName}</p>
          )}

          <div className="w-14 h-14 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="h-6 w-6 text-gray-400" />
          </div>
          <h1 className="text-white font-bold text-xl mb-1">{gallery.name}</h1>
          <p className="text-gray-400 text-sm mb-6">Esta galería está protegida con contraseña</p>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
            placeholder="Contraseña"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-gray-500 mb-3"
          />
          {passwordError && <p className="text-red-400 text-sm mb-3">{passwordError}</p>}
          <button
            onClick={handleUnlock}
            className="w-full py-3 bg-white text-gray-900 font-semibold rounded-xl hover:bg-gray-100 transition-colors"
          >
            Acceder
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-5">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            {gallery.studioLogoUrl ? (
              <img src={gallery.studioLogoUrl} alt={gallery.studioName} className="h-8" />
            ) : (
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                <span className="text-gray-900 text-xs font-bold">
                  {gallery.studioName.charAt(0)}
                </span>
              </div>
            )}
            <div>
              <h1 className="text-white font-bold text-lg leading-none">{gallery.name}</h1>
              <p className="text-gray-400 text-sm mt-0.5">{gallery.studioName}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {gallery.allowProofing && (
              <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
                <button
                  onClick={() => setFilter("all")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    filter === "all" ? "bg-gray-600 text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  Todas ({assets.length})
                </button>
                <button
                  onClick={() => setFilter("favorites")}
                  className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    filter === "favorites" ? "bg-gray-600 text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  <Heart className="h-3 w-3" fill={filter === "favorites" ? "currentColor" : "none"} />
                  Seleccionadas ({favorites.size})
                </button>
              </div>
            )}
          </div>
        </div>

        {gallery.description && (
          <div className="max-w-screen-2xl mx-auto mt-3">
            <p className="text-gray-400 text-sm">{gallery.description}</p>
          </div>
        )}
      </div>

      {/* Gallery grid */}
      <div className="max-w-screen-2xl mx-auto p-6">
        {displayAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <ImageIcon className="h-14 w-14 text-gray-700 mb-4" />
            <p className="text-gray-400 font-medium">
              {filter === "favorites" ? "No has seleccionado fotos aún" : "Sin fotos"}
            </p>
          </div>
        ) : (
          <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 gap-2 space-y-2">
            {displayAssets.map((asset, idx) => {
              const isFav = favorites.has(asset.id)
              const thumbUrl = getThumbUrl(asset)

              return (
                <div
                  key={asset.id}
                  onClick={() => setLightboxIdx(idx)}
                  className="relative break-inside-avoid group cursor-pointer overflow-hidden rounded-lg bg-gray-900"
                >
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={asset.originalName}
                      className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="w-full bg-gray-800 flex items-center justify-center"
                      style={{ aspectRatio: `${asset.width ?? 4}/${asset.height ?? 3}` }}
                    >
                      <ImageIcon className="h-8 w-8 text-gray-600" />
                    </div>
                  )}

                  {/* Overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all" />

                  {/* Actions */}
                  <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {gallery.allowProofing && (
                      <button
                        onClick={(e) => toggleFavorite(asset.id, e)}
                        className={`p-1.5 rounded-full backdrop-blur-sm transition-colors ${
                          isFav
                            ? "bg-red-500/80 text-white"
                            : "bg-black/40 text-white hover:bg-black/60"
                        }`}
                      >
                        <Heart className="h-4 w-4" fill={isFav ? "currentColor" : "none"} />
                      </button>
                    )}
                    {gallery.allowDownload && (
                      <button
                        onClick={(e) => downloadAsset(asset, e)}
                        className="p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm transition-colors"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setLightboxIdx(null)}
        >
          {/* Prev */}
          {lightboxIdx > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => (i ?? 0) - 1) }}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* Next */}
          {lightboxIdx < displayAssets.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => (i ?? 0) + 1) }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          <img
            src={getThumbUrl(displayAssets[lightboxIdx]) ?? ""}
            alt={displayAssets[lightboxIdx].originalName}
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Bottom bar */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 backdrop-blur-sm px-5 py-2.5 rounded-full">
            <span className="text-white/60 text-sm">
              {lightboxIdx + 1} / {displayAssets.length}
            </span>
            {gallery.allowProofing && (
              <button
                onClick={(e) => toggleFavorite(displayAssets[lightboxIdx].id, e)}
                className={`text-white transition-colors ${
                  favorites.has(displayAssets[lightboxIdx].id) ? "text-red-400" : "text-white/60 hover:text-white"
                }`}
              >
                <Heart className="h-5 w-5" fill={favorites.has(displayAssets[lightboxIdx].id) ? "currentColor" : "none"} />
              </button>
            )}
            {gallery.allowDownload && (
              <button
                onClick={(e) => downloadAsset(displayAssets[lightboxIdx], e)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <Download className="h-5 w-5" />
              </button>
            )}
            <button
              onClick={() => setLightboxIdx(null)}
              className="text-white/60 hover:text-white transition-colors text-lg"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
