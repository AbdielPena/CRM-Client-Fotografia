import { NextResponse, type NextRequest } from "next/server"

import { validateGalleryToken } from "@/server/services/gallery.service"

/**
 * Redirect a la URL pública del thumbnail. Mantenemos esta ruta como
 * indirección por si más adelante necesitamos validar acceso, expiraciones,
 * o servir watermarks.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string; assetId: string } },
) {
  const view = await validateGalleryToken(params.token)
  if (!view) return NextResponse.json({ error: "not found" }, { status: 404 })

  const asset = view.assets.find((a) => a.id === params.assetId)
  if (!asset?.thumbUrl) return NextResponse.json({ error: "not found" }, { status: 404 })

  return NextResponse.redirect(asset.thumbUrl, 302)
}
