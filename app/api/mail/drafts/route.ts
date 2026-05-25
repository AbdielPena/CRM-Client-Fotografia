import { NextResponse, type NextRequest } from "next/server"

import { requireStudioAuth } from "@/server/middleware/auth"
import { upsertMailDraft } from "@/server/services/mail-draft.service"

/**
 * Endpoint para auto-save de borradores desde el ComposeForm.
 *
 * POST /api/mail/drafts
 * Body: { draftId?, accountId, to[], cc[]?, bcc[]?, subject?, bodyText?, bodyHtml?, ... }
 *
 * Devuelve { id, isNew } para que el cliente actualice su state.
 */
export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }

  let payload: {
    draftId?: string
    accountId?: string
    to?: Array<{ email: string; name?: string }>
    cc?: Array<{ email: string; name?: string }>
    bcc?: Array<{ email: string; name?: string }>
    subject?: string
    bodyText?: string
    bodyHtml?: string
    inReplyTo?: string
    references?: string[]
    threadId?: string
    clientId?: string
    projectId?: string
    invoiceId?: string
  }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }

  if (!payload.accountId) {
    return NextResponse.json(
      { error: "accountId required" },
      { status: 400 },
    )
  }
  if (!payload.to || payload.to.length === 0) {
    // Permitir draft sin recipients aún — auto-save temprano
    payload.to = []
  }

  try {
    const result = await upsertMailDraft(session.studioId, session.userId, {
      draftId: payload.draftId,
      accountId: payload.accountId,
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      subject: payload.subject,
      bodyText: payload.bodyText,
      bodyHtml: payload.bodyHtml,
      inReplyTo: payload.inReplyTo,
      references: payload.references,
      threadId: payload.threadId,
      clientId: payload.clientId,
      projectId: payload.projectId,
      invoiceId: payload.invoiceId,
    })
    return NextResponse.json({
      id: result.id,
      isNew: result.isNew,
      savedAt: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unknown",
      },
      { status: 400 },
    )
  }
}

export async function DELETE(req: NextRequest) {
  let session
  try {
    session = await requireStudioAuth()
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }

  const url = new URL(req.url)
  const draftId = url.searchParams.get("id")
  if (!draftId) {
    return NextResponse.json({ error: "id required" }, { status: 400 })
  }

  const { deleteMailDraft } = await import(
    "@/server/services/mail-draft.service"
  )
  try {
    await deleteMailDraft(session.studioId, session.userId, draftId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 400 },
    )
  }
}
