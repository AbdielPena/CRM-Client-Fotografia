import { NextRequest, NextResponse } from "next/server"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  generateReport607,
  generateReport606,
  format607ToTSV,
  format606ToTSV,
} from "@/server/services/fiscal-reports.service"

/**
 * GET /api/fiscal/reports/[type]?period=YYYY-MM[&format=tsv|json]
 *
 * Genera reportes DGII en formato 606 (compras) o 607 (ventas).
 *
 * - format=tsv (default): devuelve content-type=text/plain con el TSV
 *   listo para descargar y subir a DGII
 * - format=json: devuelve { rows, summary } para preview en UI
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { type: string } },
) {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 })
  }

  const { type } = params
  if (type !== "606" && type !== "607") {
    return NextResponse.json(
      { error: "INVALID_REPORT_TYPE", hint: "Usa 606 o 607" },
      { status: 400 },
    )
  }

  const period = req.nextUrl.searchParams.get("period") ?? ""
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json(
      { error: "INVALID_PERIOD", hint: "Formato YYYY-MM (ej 2026-05)" },
      { status: 400 },
    )
  }

  const format = req.nextUrl.searchParams.get("format") ?? "tsv"

  try {
    if (type === "607") {
      const result = await generateReport607(session.studioId, period)
      if (format === "json") {
        return NextResponse.json(result)
      }
      const tsv = format607ToTSV(result.rows)
      return new NextResponse(tsv, {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "content-disposition": `attachment; filename="607_${period}_${session.studioId.slice(0, 8)}.txt"`,
        },
      })
    } else {
      const result = await generateReport606(session.studioId, period)
      if (format === "json") {
        return NextResponse.json(result)
      }
      const tsv = format606ToTSV(result.rows)
      return new NextResponse(tsv, {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "content-disposition": `attachment; filename="606_${period}_${session.studioId.slice(0, 8)}.txt"`,
        },
      })
    }
  } catch (err) {
    console.error("[fiscal/reports] failed:", err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unknown",
      },
      { status: 500 },
    )
  }
}
