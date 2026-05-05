import { NextResponse } from "next/server"

import { PORTAL_COOKIE_NAME } from "@/server/services/client-portal.service"

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(PORTAL_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  return res
}
