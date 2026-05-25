import { NextResponse, type NextRequest } from "next/server"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  untypedServer,
  untypedService,
} from "@/server/supabase/untyped"

/**
 * Endpoint: signed URL para descarga de adjunto de email.
 *
 * GET /api/mail/attachments/:id
 *   → 302 redirect a signed URL Supabase Storage (válido 60 segundos)
 *
 * GET /api/mail/attachments/:id?inline=1
 *   → mismo flujo pero con Content-Disposition: inline (para imágenes en HTML)
 *
 * Auth: studio session (requireStudioAuth). El attachment debe pertenecer
 * a un mail_message del studio.
 *
 * Seguridad: signed URL es de corta duración (60s) — el browser hace
 * follow del 302 inmediatamente. No exponemos el storage_key.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }

  const url = new URL(req.url)
  const inline = url.searchParams.get("inline") === "1"

  const sb = untypedServer()
  const { data: attachment, error } = await sb
    .from("mail_attachments")
    .select(
      `id, studio_id, message_id, filename, content_type, storage_bucket, storage_key,
       message:mail_messages(id, studio_id)`,
    )
    .eq("id", params.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { error: "ATTACHMENT_QUERY_FAILED" },
      { status: 500 },
    )
  }

  if (!attachment) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }

  type AttachmentRow = {
    studio_id: string
    storage_bucket: string
    storage_key: string
    filename: string
    content_type: string
    message?: { studio_id: string } | { studio_id: string }[] | null
  }
  const a = attachment as AttachmentRow

  // Tenant check explícito (RLS también lo cubre, pero queremos 403 claro)
  const messageStudioId = Array.isArray(a.message)
    ? a.message[0]?.studio_id
    : a.message?.studio_id
  if (a.studio_id !== session.studioId || messageStudioId !== session.studioId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
  }

  // Crear signed URL con service role
  const svc = untypedService()
  const { data: signed, error: signErr } = await svc.storage
    .from(a.storage_bucket)
    .createSignedUrl(a.storage_key, 60, {
      download: !inline ? a.filename : false,
    })

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      {
        error: "SIGNED_URL_FAILED",
        details: signErr?.message ?? "Unknown",
      },
      { status: 500 },
    )
  }

  // 302 redirect — browser auto-follow
  return NextResponse.redirect(signed.signedUrl, 302)
}
