import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { completePortalSetup } from "@/server/services/collaborator-portal.service"
import { apiError } from "@/lib/utils/api-error"

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(6).max(200),
  pin: z.string().max(12).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json())
    const r = await completePortalSetup(body.token, body.password, body.pin)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError(e)
  }
}
