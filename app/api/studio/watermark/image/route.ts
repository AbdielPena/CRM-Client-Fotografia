import { NextResponse, type NextRequest } from "next/server"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { isLocalStorage, localRead } from "@/lib/storage/local-driver"
import { apiError } from "@/lib/utils/api-error"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const WATERMARKS_BUCKET = "gallery-watermarks"

/**
 * Sirve la imagen de marca de agua guardada, para poder verla en la pantalla de
 * configuración. Solo devuelve archivos del propio estudio.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireStudioAuth()
    const key = new URL(req.url).searchParams.get("key") ?? ""
    if (!key || !key.startsWith(`${ctx.studioId}/`)) {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }

    let buf: Buffer | null = null
    if (isLocalStorage()) {
      try {
        buf = await localRead(WATERMARKS_BUCKET, key)
      } catch {
        buf = null
      }
    } else {
      const svc = createSupabaseServiceClient()
      const { data } = await svc.storage.from(WATERMARKS_BUCKET).download(key)
      if (data) buf = Buffer.from(await data.arrayBuffer())
    }
    if (!buf) return NextResponse.json({ error: "not found" }, { status: 404 })

    const type = key.endsWith(".svg")
      ? "image/svg+xml"
      : key.endsWith(".png")
        ? "image/png"
        : key.endsWith(".webp")
          ? "image/webp"
          : "image/jpeg"

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=60",
      },
    })
  } catch (e) {
    return apiError(e)
  }
}
