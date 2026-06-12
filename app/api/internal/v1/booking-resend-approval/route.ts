import { NextResponse, type NextRequest } from "next/server"

import { resendBookingApproval } from "@/server/services/booking-request.service"
import { untypedService } from "@/server/supabase/untyped"

/**
 * POST /api/internal/v1/booking-resend-approval?id=<bookingRequestId>
 *
 * Recupera una solicitud aprobada-pero-no-convertida: la convierte y reenvía el
 * correo de aprobación CON el botón. Auth: Bearer DRIVE_CRON_TOKEN.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const expected = process.env.DRIVE_CRON_TOKEN || process.env.TASK_REMINDERS_CRON_TOKEN
  if (!expected) return NextResponse.json({ error: "token no configurado" }, { status: 500 })
  if (token !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const id = new URL(req.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "falta ?id" }, { status: 400 })

  const { data: br } = await untypedService()
    .from("booking_requests")
    .select("studio_id")
    .eq("id", id)
    .maybeSingle()
  const studioId = (br as { studio_id: string } | null)?.studio_id
  if (!studioId) return NextResponse.json({ error: "solicitud no existe" }, { status: 404 })

  try {
    const result = await resendBookingApproval({ studioId, requestId: id })
    return NextResponse.json(result)
  } catch (e) {
    console.error("[booking-resend-approval]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 },
    )
  }
}
