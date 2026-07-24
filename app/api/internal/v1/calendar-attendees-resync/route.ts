import { NextResponse, type NextRequest } from "next/server"

import { resyncUpcomingEventAttendees } from "@/server/services/google-calendar.service"
import { untypedService } from "@/server/supabase/untyped"
import { safeEqual } from "@/lib/utils/timing-safe"

/**
 * POST /api/internal/v1/calendar-attendees-resync
 *
 * Completa el ROSTER de los eventos de Google ya creados: agrega al cliente y a
 * los colaboradores asignados como invitados del MISMO evento (antes solo se
 * invitaba al cliente). Manda un PATCH con ÚNICAMENTE `attendees`, así Google
 * NO toca fecha, hora, título ni descripción de los eventos ya registrados.
 *
 * Auth: header `x-internal-key` == INTERNAL_API_KEY.
 * Por defecto DRY-RUN (reporta qué haría). Para aplicar: `?confirm=1`.
 * Opcional: `?studio=<uuid>` para limitarlo a un estudio.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const expected = process.env.INTERNAL_API_KEY ?? null
  if (!expected) {
    return NextResponse.json({ error: "INTERNAL_API_KEY no configurada" }, { status: 500 })
  }
  const provided =
    req.headers.get("x-internal-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const confirm = req.nextUrl.searchParams.get("confirm") === "1"
  const onlyStudio = req.nextUrl.searchParams.get("studio")

  try {
    const sb = untypedService()
    let studioIds: string[] = []
    if (onlyStudio) {
      studioIds = [onlyStudio]
    } else {
      const { data } = await sb.from("studios").select("id").is("deleted_at", null)
      studioIds = ((data ?? []) as Array<{ id: string }>).map((s) => String(s.id))
    }

    const results: Record<string, unknown> = {}
    let totalScanned = 0
    let totalUpdated = 0
    let totalWould = 0
    for (const studioId of studioIds) {
      const r = await resyncUpcomingEventAttendees(studioId, { dryRun: !confirm })
      if (r.scanned > 0) {
        results[studioId] = r
        totalScanned += r.scanned
        totalUpdated += r.updated
        totalWould += r.wouldUpdate
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun: !confirm,
      totalScanned,
      totalWouldUpdate: totalWould,
      totalUpdated,
      results,
    })
  } catch (err) {
    console.error("[calendar-attendees-resync] failed", err)
    return NextResponse.json({ error: "Resync falló" }, { status: 500 })
  }
}
