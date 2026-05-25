import { NextResponse, type NextRequest } from "next/server"

import { untypedService } from "@/server/supabase/untyped"

/**
 * Webhook para procesar Delivery Status Notifications (DSN / bounces) de
 * Mailcow.
 *
 * Auth: Header `X-Mailcow-Bounce-Token` debe matchear env `MAILCOW_BOUNCE_TOKEN`.
 *
 * Payload esperado (Mailcow puede configurarse para enviarlo via
 * Sieve filter o postfix hook). Si Mailcow no soporta directo, el
 * IMAP-sync detecta bounces parseando los DSN emails en INBOX.
 *
 * Body:
 *   {
 *     studio_id: string (UUID),
 *     recipient_email: string,
 *     bounce_type: "hard" | "soft",
 *     dsn_status: string (e.g. "5.1.1"),
 *     diagnostic_code: string,
 *     original_message_id?: string (RFC Message-ID del email original),
 *     original_subject?: string,
 *     raw_dsn?: string
 *   }
 *
 * Acción:
 *   1. INSERT en mail_bounce_events
 *   2. Si original_message_id matchea un mail_messages.message_id del studio,
 *      UPDATE mail_messages SET status='bounced'
 *   3. Crear notification al user para que vea el bounce
 */
export async function POST(req: NextRequest) {
  // Auth via header token
  const token = req.headers.get("x-mailcow-bounce-token")
  const expected = process.env.MAILCOW_BOUNCE_TOKEN
  if (!expected) {
    return NextResponse.json(
      { error: "MAILCOW_BOUNCE_TOKEN no configurado" },
      { status: 500 },
    )
  }
  if (token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let payload: {
    studio_id?: string
    recipient_email?: string
    bounce_type?: "hard" | "soft" | "unknown"
    dsn_status?: string
    diagnostic_code?: string
    original_message_id?: string
    original_subject?: string
    raw_dsn?: string
  }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }

  if (!payload.studio_id || !payload.recipient_email) {
    return NextResponse.json(
      { error: "studio_id + recipient_email required" },
      { status: 400 },
    )
  }

  const sb = untypedService()

  // 1) Buscar el mail_messages original por message_id (RFC) si lo tenemos
  let originalMessageId: string | null = null
  let accountId: string | null = null
  if (payload.original_message_id) {
    const { data: original } = await sb
      .from("mail_messages")
      .select("id, account_id")
      .eq("studio_id", payload.studio_id)
      .eq("message_id", payload.original_message_id)
      .eq("direction", "outbound")
      .maybeSingle()
    if (original) {
      originalMessageId = (original as { id: string }).id
      accountId = (original as { account_id: string }).account_id
    }
  }

  // 2) Insert bounce event
  const { data: bounceRow, error: bounceErr } = await sb
    .from("mail_bounce_events")
    .insert({
      studio_id: payload.studio_id,
      account_id: accountId,
      message_id: originalMessageId,
      recipient_email: payload.recipient_email,
      bounce_type: payload.bounce_type ?? "unknown",
      dsn_status: payload.dsn_status ?? null,
      diagnostic_code: payload.diagnostic_code ?? null,
      original_subject: payload.original_subject ?? null,
      raw_dsn: payload.raw_dsn ?? null,
      processed_at: null,
    })
    .select("id")
    .maybeSingle()

  if (bounceErr) {
    return NextResponse.json(
      {
        error: "BOUNCE_INSERT_FAILED",
        details: bounceErr.message,
      },
      { status: 500 },
    )
  }

  // 3) Update original message status si lo encontramos
  if (originalMessageId) {
    await sb
      .from("mail_messages")
      .update({
        status: "bounced",
        delivery_error: `${payload.dsn_status ?? "?"}: ${payload.diagnostic_code ?? "Bounced"}`,
      })
      .eq("id", originalMessageId)

    // Mark processed
    await sb
      .from("mail_bounce_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", bounceRow?.id ?? "")
  }

  // 4) Crear notification
  await sb.from("notifications").insert({
    studio_id: payload.studio_id,
    type: "mail.bounce",
    title: `Email rebotado a ${payload.recipient_email}`,
    body: payload.diagnostic_code ?? "Sin más detalles del bounce.",
    entity_type: "mail_message",
    entity_id: originalMessageId,
    severity: payload.bounce_type === "hard" ? "warning" : "info",
  })

  return NextResponse.json({
    ok: true,
    bounceId: bounceRow?.id ?? null,
    matchedOriginal: !!originalMessageId,
  })
}
