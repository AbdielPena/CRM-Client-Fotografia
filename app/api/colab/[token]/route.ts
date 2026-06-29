import { NextRequest, NextResponse } from "next/server"

import { respondToInvite } from "@/server/services/collaborator-invite.service"

export const dynamic = "force-dynamic"

// Confirmar / rechazar invitación de colaborador (público, auth por token).
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string
      note?: string
    }
    const action =
      body?.action === "confirm"
        ? "confirm"
        : body?.action === "reject"
          ? "reject"
          : null
    if (!action) {
      return NextResponse.json({ error: "acción inválida" }, { status: 400 })
    }
    const note = typeof body?.note === "string" ? body.note : null
    const res = await respondToInvite(params.token, action, note)
    if (!res.ok) {
      return NextResponse.json({ error: "token inválido" }, { status: 404 })
    }
    return NextResponse.json({ ok: true, status: res.status })
  } catch {
    return NextResponse.json({ error: "error" }, { status: 500 })
  }
}
