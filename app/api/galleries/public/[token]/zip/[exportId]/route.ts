import { NextResponse, type NextRequest } from "next/server"

import { validateGalleryToken } from "@/server/services/gallery.service"
import {
  getZipDownloadUrl,
  getZipExportStatus,
} from "@/server/services/gallery-collections.service"

/**
 * Estado / descarga de un ZIP para clientes públicos (sin login).
 *
 *   GET  …/zip/<exportId>            → status JSON
 *   GET  …/zip/<exportId>?download=1 → 302 a la URL firmada del ZIP
 *
 * Seguridad: valida el token de la galería y que el export pertenezca a ESA
 * galería (evita enumerar exports de otras galerías por id).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string; exportId: string } },
) {
  const view = await validateGalleryToken(params.token)
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const exportRow = await getZipExportStatus(params.exportId)
  if (!exportRow || exportRow.gallery_id !== view.gallery.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const wantDownload = req.nextUrl.searchParams.get("download") === "1"
  if (wantDownload) {
    const url = await getZipDownloadUrl(params.exportId)
    if (!url) {
      return NextResponse.json({ error: "ZIP no listo o expirado" }, { status: 425 })
    }
    return NextResponse.redirect(url, 302)
  }

  return NextResponse.json({
    id: exportRow.id,
    status: exportRow.status,
    assetCount: exportRow.asset_count,
    zipSize: exportRow.zip_size,
    error: exportRow.error_message,
    expiresAt: exportRow.expires_at,
  })
}
