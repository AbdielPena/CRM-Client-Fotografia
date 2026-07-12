import { type NextRequest } from "next/server"
import { Readable } from "node:stream"

import { validateGalleryToken } from "@/server/services/gallery.service"
import { buildZipExportStream } from "@/server/services/gallery-collections.service"

/**
 * GET /api/galleries/public/[token]/zip/[exportId]/stream
 *
 * Descarga el ZIP en STREAMING directo (sin subirlo al bucket ni polling). El
 * cliente crea el export con POST /zip { stream:true } y luego navega aquí. Fix
 * del "máxima calidad se queda cargando y nunca descarga": el ZIP de originales
 * era demasiado grande para subirlo al bucket (Request Entity Too Large / OOM).
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function asciiName(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\]/g, "_") || "entrega"
  )
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string; exportId: string } },
) {
  const view = await validateGalleryToken(params.token)
  if (!view) return new Response("token inválido", { status: 404 })
  if (!view.gallery.allow_download) {
    return new Response("Descargas no permitidas", { status: 403 })
  }

  const built = await buildZipExportStream(params.exportId, view.gallery.id)
  if (!built) return new Response("Descarga no disponible", { status: 404 })

  const label = built.resolution === "original" ? "Máxima Calidad" : "Redes Sociales"
  const filename = `${view.gallery.name || "Entrega"} - ${label}.zip`
  const webStream = Readable.toWeb(built.readable) as unknown as ReadableStream

  return new Response(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${asciiName(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
      // nginx: no bufferear la respuesta, transmitir a medida que se genera.
      "X-Accel-Buffering": "no",
    },
  })
}
