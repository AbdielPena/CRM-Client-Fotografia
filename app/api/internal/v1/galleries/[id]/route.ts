// API interna por ID para una web LOCAL co-alojada (no externa).
// Auth: ?key=<embed_token de la galería> o header X-Internal-Key=<INTERNAL_API_KEY>.
// Requiere galería publicada + embed habilitado. Soporta ETag/If-None-Match (304).
import { NextResponse, type NextRequest } from "next/server"

import { getEmbeddableGallery } from "@/server/services/gallery.service"

export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const url = new URL(req.url)
  const key = url.searchParams.get("key") || req.headers.get("x-internal-key")
  const page = Number(url.searchParams.get("page") || "1") || 1
  const pageSize = Number(url.searchParams.get("page_size") || "60") || 60
  const scope = url.searchParams.get("scope") === "full" ? "full" : "summary"

  const result = await getEmbeddableGallery(params.id, key, { page, pageSize, scope })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === "forbidden" ? 403 : 404 },
    )
  }

  // Cache same-server por ETag.
  const ifNoneMatch = req.headers.get("if-none-match")
  if (ifNoneMatch && ifNoneMatch === result.etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: result.etag } })
  }

  return NextResponse.json(result.data, {
    headers: {
      ETag: result.etag,
      "Cache-Control": "private, max-age=30",
      "X-Robots-Tag": "noindex",
    },
  })
}
