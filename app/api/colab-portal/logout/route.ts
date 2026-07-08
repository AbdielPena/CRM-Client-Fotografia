import { NextResponse } from "next/server"

import { COLAB_COOKIE_NAME } from "@/server/services/collaborator-portal.service"

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COLAB_COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 })
  return res
}
