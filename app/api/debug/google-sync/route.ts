/**
 * Debug endpoint para forzar la sincronización inicial de Google Calendar.
 * Ejecuta importGoogleEvents y devuelve el detalle de qué pasó.
 *
 * Solo accesible para admin/owner. Usado para troubleshooting o para
 * disparar el import inicial cuando el flujo automático no se ejecutó
 * (ej. usuario seleccionó calendario antes del deploy con el auto-import).
 */
import { NextResponse, type NextRequest } from "next/server"

import { requireRole } from "@/server/middleware/auth"
import {
  importGoogleEvents,
  getGoogleCalendarStatus,
} from "@/server/services/google-calendar.service"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const session = await requireRole("admin")

    const status = await getGoogleCalendarStatus(session.studioId)
    if (!status.enabled) {
      return NextResponse.json(
        {
          ok: false,
          step: "check-status",
          error: "Google Calendar no está conectado en este studio",
          status,
        },
        { status: 400 },
      )
    }
    if (!status.calendarId) {
      return NextResponse.json(
        {
          ok: false,
          step: "check-calendar",
          error: "No hay calendario activo seleccionado. Andá a /settings/integrations/google",
          status,
        },
        { status: 400 },
      )
    }

    const fullSync = req.nextUrl.searchParams.get("full") === "1"
    const result = await importGoogleEvents(session.studioId, { fullSync })

    return NextResponse.json({
      ok: true,
      fullSync,
      status,
      result,
      message: `Sincronización completada. Importados: ${result.imported}, Actualizados: ${result.updated}, Eliminados: ${result.deleted}.`,
    })
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        step: "import",
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.split("\n").slice(0, 5) : undefined,
      },
      { status: 500 },
    )
  }
}
