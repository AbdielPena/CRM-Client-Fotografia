import { NextResponse, type NextRequest } from "next/server"

import { requireApiToken } from "@/server/middleware/api-auth"
import {
  getGalleryById,
  getGalleryAssets,
  getFavoriteSelections,
} from "@/server/services/gallery.service"

export const dynamic = "force-dynamic"

/**
 * Selección agregada del cliente (favoritos). Devuelve los `original_name` de
 * las fotos elegidas — esto alimenta el emparejado con los RAW en la PC.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiToken(req, "read")
  if (auth instanceof NextResponse) return auth

  const gallery = await getGalleryById(auth.studioId, params.id, true)
  if (!gallery) return NextResponse.json({ error: "Galería no encontrada" }, { status: 404 })

  const [favs, assets] = await Promise.all([
    getFavoriteSelections(params.id),
    getGalleryAssets(auth.studioId, params.id, true),
  ])
  const nameById = new Map(assets.map((a) => [a.id, a.original_name]))

  const byClient = favs.map((f) => ({
    clientEmail: f.clientEmail,
    count: f.assetIds.length,
    assets: f.assetIds.map((aid) => ({
      assetId: aid,
      originalName: nameById.get(aid) ?? null,
    })),
  }))

  // Unión de todas las fotos elegidas (para crear la carpeta de RAW).
  const union = new Map<string, { assetId: string; originalName: string | null; clientEmails: string[] }>()
  for (const f of favs) {
    for (const aid of f.assetIds) {
      const prev = union.get(aid)
      if (prev) {
        prev.clientEmails.push(f.clientEmail)
      } else {
        union.set(aid, {
          assetId: aid,
          originalName: nameById.get(aid) ?? null,
          clientEmails: [f.clientEmail],
        })
      }
    }
  }

  return NextResponse.json({
    byClient,
    selectedAssets: [...union.values()],
    selectedCount: union.size,
  })
}
