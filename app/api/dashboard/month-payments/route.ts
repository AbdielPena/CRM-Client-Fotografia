import { NextResponse, type NextRequest } from "next/server"

import { requireStudioAuth } from "@/server/middleware/auth"
import { getMonthPayments } from "@/server/services/dashboard.service"

export const dynamic = "force-dynamic"

/**
 * GET /api/dashboard/month-payments?month=YYYY-MM
 *
 * Devuelve TOP 10 pagos del mes con detalles (cliente, factura, proyecto,
 * método). Usado por el revenue chart para mostrar al hover/click los
 * pagos reales del mes seleccionado.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireStudioAuth()
    const monthKey = req.nextUrl.searchParams.get("month")
    if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
      return NextResponse.json(
        { error: 'Parametro "month" inválido. Esperado YYYY-MM.' },
        { status: 400 },
      )
    }
    const limit = Math.min(50, Number(req.nextUrl.searchParams.get("limit") ?? 10))
    const payments = await getMonthPayments(session.studioId, monthKey, limit)
    return NextResponse.json({ ok: true, monthKey, payments })
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Error desconocido",
      },
      { status: 500 },
    )
  }
}
