import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import {
  PORTAL_COOKIE_NAME,
  buildPortalCookieValue,
  portalCookieOptions,
  validatePortalLogin,
} from "@/server/services/client-portal.service"
import { apiError } from "@/lib/utils/api-error"

const schema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(20),
})

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json())
    const session = await validatePortalLogin(body.email, body.code)
    if (!session) {
      return NextResponse.json(
        { error: "Email o código incorrecto" },
        { status: 401 },
      )
    }

    const res = NextResponse.json({
      ok: true,
      clientName: session.clientName,
    })
    const value = buildPortalCookieValue(session.clientId, session.studioId)
    res.cookies.set(PORTAL_COOKIE_NAME, value, portalCookieOptions())
    return res
  } catch (e) {
    return apiError(e)
  }
}
