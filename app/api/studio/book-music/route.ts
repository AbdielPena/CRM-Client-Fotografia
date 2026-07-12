import { NextResponse, type NextRequest } from "next/server"

import { requireStudioAuth } from "@/server/middleware/auth"
import { createSupabaseServiceClient } from "@/server/supabase/service"

/**
 * POST /api/studio/book-music
 *
 * Sube una canción DESDE ARCHIVO (no pegar links) para la música de fondo del
 * álbum digital (Luxury Book). Guarda el audio en el bucket PÚBLICO
 * `studio-branding` y devuelve su URL pública + un nombre sugerido (el nombre
 * del archivo sin extensión). El editor persiste esa URL en
 * `book_settings.music.url` y opcionalmente la agrega a la biblioteca del
 * estudio (`studio_branding.book_music_library`) para reusarla.
 *
 * Multipart form-data: { file: File }
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUCKET = "studio-branding"
const MAX_BYTES = 15 * 1024 * 1024 // 15 MB
const ALLOWED: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
}

function suggestName(fileName: string): string {
  const noExt = (fileName || "").replace(/\.[^.]+$/, "")
  return noExt.trim().slice(0, 80) || "Canción"
}

export async function POST(req: NextRequest) {
  let studioId: string
  try {
    const session = await requireStudioAuth()
    studioId = session.studioId
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  let file: File | null = null
  try {
    const form = await req.formData()
    file = form.get("file") as File | null
  } catch {
    return NextResponse.json({ error: "Form inválido" }, { status: 400 })
  }

  if (!file || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 })
  }
  const ext = ALLOWED[file.type]
  if (!ext) {
    return NextResponse.json(
      { error: "Formato no permitido. Usa MP3, M4A, AAC, OGG o WAV." },
      { status: 400 },
    )
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `El archivo supera ${MAX_BYTES / (1024 * 1024)} MB.` },
      { status: 400 },
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const path = `studios/${studioId}/music/${Date.now()}.${ext}`

  const sb = createSupabaseServiceClient()
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: true,
    cacheControl: "31536000",
  })
  if (upErr) {
    console.error("[book-music] upload falló:", upErr.message)
    return NextResponse.json(
      { error: "No se pudo subir la canción. Intenta de nuevo." },
      { status: 500 },
    )
  }

  const { data } = sb.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl, name: suggestName(file.name) })
}
