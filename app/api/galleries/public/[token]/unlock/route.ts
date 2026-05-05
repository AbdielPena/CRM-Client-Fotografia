import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { compare } from "bcryptjs"

import { createSupabaseServiceClient } from "@/server/supabase/service"
import { apiError } from "@/lib/utils/api-error"

const schema = z.object({ password: z.string().min(1) })

/**
 * Verifica el password de una galería protegida (visibility='password').
 * Setea cookie httpOnly `gallery_unlock_<token>` para evitar pedirlo otra vez.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const { password } = schema.parse(await req.json())
    const supabase = createSupabaseServiceClient()

    const { data: tk } = await supabase
      .from("gallery_share_tokens")
      .select("gallery_id, revoked_at, expires_at")
      .eq("token", params.token)
      .maybeSingle()
    if (!tk || tk.revoked_at) {
      return NextResponse.json({ error: "token inválido" }, { status: 404 })
    }
    if (tk.expires_at && new Date(tk.expires_at as string).getTime() < Date.now()) {
      return NextResponse.json({ error: "expirado" }, { status: 410 })
    }

    const { data: gallery } = await supabase
      .from("galleries")
      .select("password_hash, visibility")
      .eq("id", tk.gallery_id as string)
      .maybeSingle()
    if (!gallery || gallery.visibility !== "password" || !gallery.password_hash) {
      return NextResponse.json({ error: "no requiere password" }, { status: 400 })
    }

    const ok = await compare(password, gallery.password_hash as string)
    if (!ok) return NextResponse.json({ error: "password incorrecto" }, { status: 401 })

    const res = NextResponse.json({ ok: true })
    res.cookies.set(`gallery_unlock_${params.token}`, "1", {
      httpOnly: true,
      sameSite: "lax",
      path: `/g/${params.token}`,
      maxAge: 60 * 60 * 12,
    })
    return res
  } catch (e) {
    return apiError(e)
  }
}
