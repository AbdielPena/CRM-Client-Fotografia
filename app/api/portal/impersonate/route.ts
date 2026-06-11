import { NextResponse, type NextRequest } from "next/server"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import {
  PORTAL_COOKIE_NAME,
  buildPortalCookieValue,
  portalCookieOptions,
} from "@/server/services/client-portal.service"

/**
 * "Ver como el cliente" — magic link para el fotógrafo.
 *
 * GET /api/portal/impersonate?clientId=<uuid>
 *
 * Requiere sesión de studio activa (cookie). Valida que el cliente pertenezca
 * al studio, setea la cookie del portal del cliente y redirige a /portal.
 * El link no funciona para nadie sin sesión de studio — compartirlo no abre nada.
 */
export async function GET(req: NextRequest) {
  let ctx
  try {
    ctx = await requireStudioAuth()
  } catch {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  const clientId = req.nextUrl.searchParams.get("clientId")
  if (!clientId) {
    return NextResponse.json({ error: "clientId requerido" }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()
  const { data: client } = await supabase
    .from("clients")
    .select("id, studio_id, deleted_at")
    .eq("id", clientId)
    .eq("studio_id", ctx.studioId)
    .maybeSingle()

  if (!client || (client as { deleted_at: string | null }).deleted_at) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
  }

  const res = NextResponse.redirect(new URL("/portal", req.url))
  const value = buildPortalCookieValue(clientId, ctx.studioId)
  res.cookies.set(PORTAL_COOKIE_NAME, value, portalCookieOptions())
  return res
}
