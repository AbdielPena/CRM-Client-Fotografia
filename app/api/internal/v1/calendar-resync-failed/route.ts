import { NextResponse, type NextRequest } from "next/server"

import { syncProjectById, getAccessToken } from "@/server/services/google-calendar.service"
import { untypedService } from "@/server/supabase/untyped"
import { safeEqual } from "@/lib/utils/timing-safe"

const GCAL = "https://www.googleapis.com/calendar/v3"

/**
 * VERIFICACIÓN read-only: consulta Google para CADA sesión futura sincronizada
 * y compara la fecha que tiene el calendario contra la registrada en el CRM.
 * No modifica nada.
 */
async function verifyAll() {
  const sb = untypedService()
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await sb
    .from("projects")
    .select("id, studio_id, name, event_date, event_time, google_event_id, google_calendar_id")
    .is("deleted_at", null)
    .not("google_event_id", "is", null)
    .gte("event_date", today)
    .order("event_date", { ascending: true })
  const rows = (data ?? []) as Array<Record<string, unknown>>
  const tokens = new Map<string, string | null>()
  const items: Array<Record<string, unknown>> = []
  let ok = 0
  let mismatch = 0
  for (const r of rows) {
    const studioId = String(r.studio_id)
    if (!tokens.has(studioId)) tokens.set(studioId, await getAccessToken(studioId))
    const token = tokens.get(studioId)
    const crmDate = String(r.event_date ?? "")
    const item: Record<string, unknown> = { sesion: String(r.name ?? ""), crm: crmDate }
    if (!token) { item.google = "sin token"; items.push(item); continue }
    try {
      const res = await fetch(
        `${GCAL}/calendars/${encodeURIComponent(String(r.google_calendar_id))}/events/${encodeURIComponent(String(r.google_event_id))}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) { item.google = `GET ${res.status}`; items.push(item); continue }
      const ev = (await res.json()) as { start?: { date?: string; dateTime?: string } }
      const gDate = (ev.start?.dateTime ?? ev.start?.date ?? "").slice(0, 10)
      item.google = gDate
      if (gDate === crmDate) { ok++; item.match = true }
      else { mismatch++; item.match = false }
    } catch (e) {
      item.google = `error: ${e instanceof Error ? e.message : "?"}`
    }
    items.push(item)
  }
  return { verificacion: true, revisadas: rows.length, coinciden: ok, no_coinciden: mismatch, items }
}

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

  // Modo verificación: compara Google vs CRM para todas las sesiones futuras.
  if (req.nextUrl.searchParams.get("verify") === "1") {
    return NextResponse.json({ ok: true, ...(await verifyAll()) })
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
