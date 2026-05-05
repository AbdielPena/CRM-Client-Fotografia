import { NextResponse, type NextRequest } from "next/server"

import {
  PORTAL_COOKIE_NAME,
  parsePortalCookieValue,
} from "@/server/services/client-portal.service"
import { markDeliveryReviewedByClient } from "@/server/services/client-delivery.service"

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const raw = req.cookies.get(PORTAL_COOKIE_NAME)?.value
  const session = parsePortalCookieValue(raw)
  if (!session) {
    return NextResponse.json({ error: "no_session" }, { status: 401 })
  }
  await markDeliveryReviewedByClient(session.clientId, params.id)
  return NextResponse.json({ ok: true })
}
