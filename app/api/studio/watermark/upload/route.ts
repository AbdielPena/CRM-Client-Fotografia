import { NextResponse, type NextRequest } from "next/server"
import { randomUUID } from "node:crypto"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { isLocalStorage, localWrite } from "@/lib/storage/local-driver"
import { apiError } from "@/lib/utils/api-error"

/**
 * Sube la imagen de marca de agua del ESTUDIO (la que heredan las galerías de
 * selección). Devuelve `{ imageKey }` para guardarlo con PATCH /api/studio/watermark.
 */

const WATERMARKS_BUCKET = "gallery-watermarks"
const ALLOWED = new Set(["image/png", "image/webp", "image/svg+xml", "image/jpeg"])

export const runtime = "nodejs"
export const maxDuration = 30

function extFromMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png"
    case "image/webp":
      return "webp"
    case "image/svg+xml":
      return "svg"
    case "image/jpeg":
      return "jpg"
    default:
      return "bin"
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireStudioAuth()

    const form = await req.formData()
    const file = form.get("file")
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "file requerido" }, { status: 400 })
    }
    const mime = (file as File).type || "application/octet-stream"
    if (!ALLOWED.has(mime)) {
      return NextResponse.json(
        { error: `Tipo no permitido: ${mime}. Usa PNG, WebP, SVG o JPG.` },
        { status: 400 },
      )
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Imagen máximo 5MB" }, { status: 400 })
    }

    const key = `${ctx.studioId}/studio/${randomUUID()}.${extFromMime(mime)}`
    const buf = Buffer.from(await file.arrayBuffer())

    if (isLocalStorage()) {
      await localWrite(WATERMARKS_BUCKET, key, buf)
    } else {
      const svc = createSupabaseServiceClient()
      const { error } = await svc.storage
        .from(WATERMARKS_BUCKET)
        .upload(key, buf, { contentType: mime, upsert: true })
      if (error) throw error
    }

    return NextResponse.json({ ok: true, imageKey: key })
  } catch (e) {
    return apiError(e)
  }
}
