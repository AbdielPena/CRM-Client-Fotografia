import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import {
  COLAB_COOKIE_NAME,
  buildColabCookieValue,
  colabCookieOptions,
  collaboratorLogin,
} from "@/server/services/collaborator-portal.service"
import { apiError } from "@/lib/utils/api-error"
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/utils/rate-limit"

const schema = z.object({
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().max(200).optional(),
  pin: z.string().max(12).optional(),
})

export async function POST(req: NextRequest) {
  // Anti brute-force: 8 intentos / 5 min por IP.
  const ip = getClientIp(req)
  const limitCheck = rateLimit({ key: `colab-login:${ip}`, max: 8, windowMs: 5 * 60_000 })
  if (limitCheck.blocked) return rateLimitResponse(limitCheck)

  try {
    const body = schema.parse(await req.json())
    const session = await collaboratorLogin({
      email: body.email || undefined,
      password: body.password,
      pin: body.pin,
    })
    if (!session) {
      return NextResponse.json(
        { error: "Datos incorrectos o acceso no activado" },
        { status: 401 },
      )
    }
    const res = NextResponse.json({ ok: true, name: session.name })
    res.cookies.set(
      COLAB_COOKIE_NAME,
      buildColabCookieValue(session.collaboratorId, session.studioId),
      colabCookieOptions(),
    )
    return res
  } catch (e) {
    return apiError(e)
  }
}
