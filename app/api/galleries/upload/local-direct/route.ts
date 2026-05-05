/**
 * Endpoint local-only — recibe el binario del archivo y lo guarda en
 * `public/dev-uploads/gallery-originals/<key>`. Solo activo cuando
 * `STORAGE_DRIVER=local`. Reemplaza el flujo de presigned URL de Supabase
 * en modo desarrollo.
 *
 * El `prepareAssetUpload` devuelve la URL de este endpoint cuando driver=local,
 * así que el cliente hace un PUT directo con el body binario — exactamente
 * como lo haría con Supabase Storage.
 */

import { NextResponse, type NextRequest } from "next/server"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import { isLocalStorage, localWrite } from "@/lib/storage/local-driver"
import { createSupabaseServiceClient } from "@/server/supabase/service"

const ORIGINALS_BUCKET = "gallery-originals"

export const runtime = "nodejs"
// Permitimos uploads grandes (hasta el max definido en prepare = 200MB)
export const maxDuration = 60

export async function PUT(req: NextRequest) {
  if (!isLocalStorage()) {
    return NextResponse.json(
      { error: "local-direct upload deshabilitado (STORAGE_DRIVER != local)" },
      { status: 404 },
    )
  }

  try {
    const ctx = await requireStudioAuth()
    const url = new URL(req.url)
    const assetId = url.searchParams.get("assetId")
    const key = url.searchParams.get("key")

    if (!assetId || !key) {
      return NextResponse.json(
        { error: "assetId y key son requeridos" },
        { status: 400 },
      )
    }

    // Validar que el asset existe, está pending y pertenece al studio
    const supabase = createSupabaseServiceClient()
    const { data: asset } = await supabase
      .from("gallery_assets")
      .select("id, studio_id, status, original_key")
      .eq("id", assetId)
      .eq("studio_id", ctx.studioId)
      .maybeSingle()

    const a = asset as
      | { id: string; studio_id: string; status: string; original_key: string }
      | null
    if (!a) return NextResponse.json({ error: "asset no encontrado" }, { status: 404 })
    if (a.status !== "pending") {
      return NextResponse.json(
        { error: `asset en estado ${a.status}, esperado 'pending'` },
        { status: 409 },
      )
    }
    if (a.original_key !== key) {
      return NextResponse.json({ error: "key no coincide" }, { status: 400 })
    }

    // Leer body como buffer y persistir
    const buf = Buffer.from(await req.arrayBuffer())
    if (buf.byteLength === 0) {
      return NextResponse.json({ error: "archivo vacío" }, { status: 400 })
    }
    await localWrite(ORIGINALS_BUCKET, key, buf)

    return NextResponse.json({ ok: true, bytes: buf.byteLength })
  } catch (e) {
    console.error("[local-direct upload] error", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 },
    )
  }
}
