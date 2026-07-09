import { NextResponse, type NextRequest } from "next/server"

import { requireStudioAuth } from "@/server/middleware/auth"
import { buildPrintZip, type PrintZipScope } from "@/server/services/print-zip.service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SCOPES: PrintZipScope[] = ["all", "album", "frames", "prints", "digitales"]
const SCOPE_LABEL: Record<PrintZipScope, string> = {
  all: "Impresiones",
  album: "Portada",
  frames: "Marcos",
  prints: "Impresiones",
  digitales: "Entregadas digitales",
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const scopeRaw = new URL(req.url).searchParams.get("scope") ?? "all"
  const scope = (SCOPES.includes(scopeRaw as PrintZipScope) ? scopeRaw : "all") as PrintZipScope

  const result = await buildPrintZip(session.studioId, params.id, scope)
  if (!result) {
    return NextResponse.json({ error: "Galería no encontrada" }, { status: 404 })
  }
  if (result.count === 0) {
    return NextResponse.json(
      { error: "No hay fotos seleccionadas para esta categoría" },
      { status: 404 },
    )
  }

  // Nombre pedido: "Cliente - Impresiones.zip" (con espacios). Se envía un
  // fallback ASCII + filename* UTF-8 para nombres con acentos.
  const client = (result.clientName || "Cliente").trim()
  const rawName =
    scope === "all"
      ? `${client} - Impresiones.zip`
      : `${SCOPE_LABEL[scope]} - ${client}.zip`
  const asciiName =
    rawName
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, "")
      .replace(/[/\\:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim() || "Impresiones.zip"

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(rawName)}`,
      "Content-Length": String(result.buffer.length),
      "Cache-Control": "no-store",
    },
  })
}
