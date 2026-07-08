import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { z } from "zod"

import {
  COLAB_COOKIE_NAME,
  parseColabCookieValue,
} from "@/server/services/collaborator-portal.service"
import { respondToOwnAssignment } from "@/server/services/collaborator-portal-data.service"
import { apiError } from "@/lib/utils/api-error"

const schema = z.object({
  assignmentId: z.string().uuid(),
  action: z.enum(["confirm", "reject"]),
  note: z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const session = parseColabCookieValue(cookies().get(COLAB_COOKIE_NAME)?.value)
    if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    const body = schema.parse(await req.json())
    const r = await respondToOwnAssignment(
      session.studioId,
      session.collaboratorId,
      body.assignmentId,
      body.action,
      body.note,
    )
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError(e)
  }
}
