/**
 * Upload de archivo asociado a una entrega.
 * Igual que el flujo de galería: en STORAGE_DRIVER=local va al fs,
 * sino a Supabase Storage bucket `client-deliveries`.
 *
 * El cliente envía FormData { file } y recibe { name, url, size, mime }
 * que se persistirá en `client_deliveries.files` cuando se cree/actualice.
 */

import { NextResponse, type NextRequest } from "next/server"
import { randomUUID } from "node:crypto"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import {
  isLocalStorage,
  localPublicUrl,
  localWrite,
} from "@/lib/storage/local-driver"
import { apiError } from "@/lib/utils/api-error"

const BUCKET = "client-deliveries"
const MAX_FILE_SIZE = 200 * 1024 * 1024 // 200MB

export const runtime = "nodejs"
export const maxDuration = 60

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 200) || "file"
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireStudioAuth()

    const form = await req.formData()
    const file = form.get("file")
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "file requerido" }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Archivo excede 200MB" },
        { status: 400 },
      )
    }

    const originalName = (file as File).name ?? "file"
    const mime = (file as File).type ?? "application/octet-stream"
    const id = randomUUID()
    const key = `${ctx.studioId}/${id}/${safeName(originalName)}`
    const buf = Buffer.from(await file.arrayBuffer())

    let publicUrl: string | null

    if (isLocalStorage()) {
      await localWrite(BUCKET, key, buf)
      publicUrl = localPublicUrl(BUCKET, key)
    } else {
      const supabase = createSupabaseServiceClient()
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(key, buf, { contentType: mime, upsert: true })
      if (error) throw error
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(key)
      publicUrl = pub?.publicUrl ?? null
    }

    if (!publicUrl) {
      return NextResponse.json(
        { error: "no se pudo resolver URL pública" },
        { status: 500 },
      )
    }

    return NextResponse.json({
      name: originalName,
      url: publicUrl,
      size: file.size,
      mime,
    })
  } catch (e) {
    return apiError(e)
  }
}
