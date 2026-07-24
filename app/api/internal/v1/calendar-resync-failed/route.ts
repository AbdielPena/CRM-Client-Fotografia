import { NextResponse, type NextRequest } from "next/server"

import { syncProjectById } from "@/server/services/google-calendar.service"
import { untypedService } from "@/server/supabase/untyped"
import { safeEqual } from "@/lib/utils/timing-safe"

/**
 * POST /api/internal/v1/calendar-resync-failed
 *
 * Repara las sesiones cuyo evento de Google quedó DESACTUALIZADO porque el
 * sync falló (`google_sync_error`), típicamente por el bug de fecha en formato
 * datetime-local que Google rechazaba con 400 "Invalid start time".
 *
 * Empuja SIEMPRE del CRM hacia Google: la fecha/hora registrada en el CRM es
 * la fuente de verdad y NO se modifica. Solo se corrige el calendario.
 *
 * Auth: `x-internal-key`. DRY-RUN por defecto; aplica con `?confirm=1`.
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
  const sb = untypedService()

  const { data } = await sb
    .from("projects")
    .select("id, studio_id, name, event_date, event_time, google_sync_error")
    .is("deleted_at", null)
    .not("google_event_id", "is", null)
    .not("google_sync_error", "is", null)
    .order("event_date", { ascending: true })

  const rows = (data ?? []) as Array<Record<string, unknown>>
  const details: Array<Record<string, unknown>> = []
  let repaired = 0
  let stillFailing = 0

  for (const r of rows) {
    const item: Record<string, unknown> = {
      sesion: String(r.name ?? ""),
      fecha_crm: String(r.event_date ?? ""),
      hora_crm: r.event_time ? String(r.event_time).slice(0, 5) : null,
    }
    if (!confirm) {
      item.accion = "se re-sincronizaria (dry-run)"
      details.push(item)
      continue
    }
    try {
      await syncProjectById(String(r.studio_id), String(r.id))
    } catch {
      /* syncProjectById ya guarda el error en google_sync_error */
    }
    // Releer para confirmar que Google aceptó (error en null = OK).
    const { data: after } = await sb
      .from("projects")
      .select("google_sync_error, google_synced_at")
      .eq("id", String(r.id))
      .maybeSingle()
    const err = (after as { google_sync_error?: string | null } | null)?.google_sync_error
    if (!err) {
      repaired++
      item.resultado = "OK — Google actualizado con la fecha del CRM"
    } else {
      stillFailing++
      item.resultado = `SIGUE FALLANDO: ${String(err).slice(0, 120)}`
    }
    details.push(item)
  }

  return NextResponse.json({
    ok: true,
    dryRun: !confirm,
    encontradas: rows.length,
    reparadas: repaired,
    siguenFallando: stillFailing,
    details,
  })
}
