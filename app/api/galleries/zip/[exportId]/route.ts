import { NextResponse, type NextRequest } from "next/server"

import {
  getZipDownloadUrl,
  getZipExportStatus,
} from "@/server/services/gallery-collections.service"

/**
 * GET sin querystring → status JSON
 * GET ?download=1     → 302 redirect a signed URL del ZIP
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { exportId: string } },
) {
  const wantDownload = req.nextUrl.searchParams.get("download") === "1"

  if (wantDownload) {
    const url = await getZipDownloadUrl(params.exportId)
    if (!url) {
      return NextResponse.json(
        { error: "ZIP no listo o expirado" },
        { status: 425 },
      )
    }
    return NextResponse.redirect(url, 302)
  }

  const exportRow = await getZipExportStatus(params.exportId)
  if (!exportRow) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
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
