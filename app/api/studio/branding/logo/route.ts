import { NextResponse, type NextRequest } from "next/server"

import { requireStudioAuth } from "@/server/middleware/auth"
import { createSupabaseServiceClient } from "@/server/supabase/service"

/**
 * POST /api/studio/branding/logo
 *
 * Sube un logo desde la pantalla "Marca y personalización" (sin pegar links).
 * Guarda el archivo en el bucket PÚBLICO `studio-branding` y devuelve su URL
 * pública, que el form persiste en studio_branding.logo_url / logo_dark_url y
 * se espeja a studios.logo_url (campo canónico que lee todo el ecosistema).
 *
 * Multipart form-data: { file: File, variant?: "light" | "dark" | "favicon" }
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUCKET = "studio-branding"
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB
const MAX_BYTES_COVER = 5 * 1024 * 1024 // 5 MB para portada de galería
const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
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
  let variant = "light"
  try {
    const form = await req.formData()
    file = form.get("file") as File | null
    variant = (form.get("variant") as string) || "light"
  } catch {
    return NextResponse.json({ error: "Form inválido" }, { status: 400 })
  }

  if (!file || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 })
  }
  const ext = ALLOWED[file.type]
  if (!ext) {
    return NextResponse.json(
      { error: "Formato no permitido. Usa PNG, JPG, WEBP o SVG." },
      { status: 400 },
    )
  }
  const safeVariant = [
    "light",
    "dark",
    "favicon",
    "banner",
    "package-cover",
    "book-cover",
    "gallery-cover",
    "dress",
  ].includes(variant)
    ? variant
    : "light"

  const maxSize = safeVariant === "gallery-cover" ? MAX_BYTES_COVER : MAX_BYTES
  if (file.size > maxSize) {
    return NextResponse.json(
      { error: `El archivo supera ${maxSize / (1024 * 1024)} MB.` },
      { status: 400 },
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const path = `studios/${studioId}/${safeVariant}-${Date.now()}.${ext}`

  const sb = createSupabaseServiceClient()
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: true,
    cacheControl: "31536000",
  })
  if (upErr) {
    console.error("[branding/logo] upload falló:", upErr.message)
    return NextResponse.json(
      { error: "No se pudo subir el logo. Intenta de nuevo." },
      { status: 500 },
    )
  }

  const { data } = sb.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
