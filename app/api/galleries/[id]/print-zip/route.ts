import { NextResponse, type NextRequest } from "next/server"

import { requireStudioAuth } from "@/server/middleware/auth"
import { buildPrintZip, type PrintZipScope } from "@/server/services/print-zip.service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SCOPES: PrintZipScope[] = ["all", "album", "frames", "prints"]
const SCOPE_LABEL: Record<PrintZipScope, string> = {
  all: "Impresion",
  album: "Album",
  frames: "Marcos",
  prints: "Impresiones",
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

  const safeClient = (result.clientName || "Cliente").replace(/[^\w\-]+/g, "_")
  const filename = `${SCOPE_LABEL[scope]}-${safeClient}.zip`

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(result.buffer.length),
      "Cache-Control": "no-store",
    },
  })
}
