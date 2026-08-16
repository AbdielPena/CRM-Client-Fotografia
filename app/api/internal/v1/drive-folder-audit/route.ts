import { NextResponse, type NextRequest } from "next/server"

import { untypedService } from "@/server/supabase/untyped"
import * as drive from "@/server/services/google-drive.service"
import { driveFileNameFor } from "@/server/services/gallery-drive.service"
import { safeEqual } from "@/lib/utils/timing-safe"

/**
 * POST /api/internal/v1/drive-folder-audit?carpeta=<root_folder_id>
 *
 * Solo LEE: cuenta qué hay de verdad en una carpeta de Drive y clasifica cada
 * archivo contra la base de datos — de la entrega, de la selección, o de
 * ninguna de las dos.
 *
 * Existe porque el informe de la limpieza solo contaba lo que reconocía: un
 * archivo que no casaba con ninguna galería no se borraba NI se reportaba, así
 * que podía quedarse ahí sin que nadie lo viera. Esto lo saca a la luz.
 *
 * Auth: header `x-internal-key` == INTERNAL_API_KEY.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

async function nombresDe(galleryId: string): Promise<Set<string>> {
  const sb = untypedService()
  const out = new Set<string>()
  for (let desde = 0; ; desde += 1000) {
    const { data } = await sb
      .from("gallery_assets")
      .select("id, original_name")
      .eq("gallery_id", galleryId)
      .eq("status", "completed")
      .range(desde, desde + 999)
    const filas = (data ?? []) as Array<{ id: string; original_name: string | null }>
    for (const a of filas) {
      out.add(driveFileNameFor(a, "high_quality"))
      out.add(driveFileNameFor(a, "social"))
    }
    if (filas.length < 1000) break
  }
  return out
}

export async function POST(req: NextRequest) {
  const expected = process.env.INTERNAL_API_KEY ?? null
  if (!expected) {
    return NextResponse.json({ error: "INTERNAL_API_KEY no configurada" }, { status: 500 })
  }
  const provided =
    req.headers.get("x-internal-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const carpeta = new URL(req.url).searchParams.get("carpeta")
  if (!carpeta) return NextResponse.json({ error: "falta ?carpeta=" }, { status: 400 })

  try {
    const sb = untypedService()
    const { data: raw } = await sb
      .from("gallery_drive_backups")
      .select(
        "studio_id, gallery_id, high_quality_folder_id, social_folder_id, galleries!inner(gallery_type, name)",
      )
      .eq("root_folder_id", carpeta)

    const filas = (raw ?? []) as Array<Record<string, unknown>>
    if (filas.length === 0) {
      return NextResponse.json({ error: "carpeta desconocida" }, { status: 404 })
    }
    const studioId = String(filas[0].studio_id)

    const entrega = new Set<string>()
    const seleccion = new Set<string>()
    const subcarpetas = new Map<string, string>()
    for (const r of filas) {
      const g = (Array.isArray(r.galleries) ? r.galleries[0] : r.galleries) as {
        gallery_type: string
      }
      const nombres = await nombresDe(String(r.gallery_id))
      const destino = g.gallery_type === "final_delivery" ? entrega : seleccion
      for (const n of nombres) destino.add(n)
      if (r.high_quality_folder_id) {
        subcarpetas.set(String(r.high_quality_folder_id), "Máxima calidad (originales)")
      }
      if (r.social_folder_id) {
        subcarpetas.set(String(r.social_folder_id), "Redes (optimizada)")
      }
    }

    const resultado: Array<Record<string, unknown>> = []
    for (const [id, etiqueta] of subcarpetas) {
      const archivos = await drive.listFilesInFolder(studioId, id, 1000)
      const deEntrega: string[] = []
      const deSeleccion: string[] = []
      const desconocidos: string[] = []
      for (const f of archivos) {
        if (entrega.has(f.name)) deEntrega.push(f.name)
        else if (seleccion.has(f.name)) deSeleccion.push(f.name)
        else desconocidos.push(f.name)
      }
      resultado.push({
        subcarpeta: etiqueta,
        totalEnDrive: archivos.length,
        deLaEntrega: deEntrega.length,
        deLaSeleccion: deSeleccion.length,
        sinReconocer: desconocidos.length,
        // Muestras para poder mirarlas a ojo.
        ejemploEntrega: deEntrega.slice(0, 5),
        ejemploSeleccion: deSeleccion.slice(0, 5),
        ejemploSinReconocer: desconocidos.slice(0, 10),
      })
    }

    return NextResponse.json({ ok: true, carpeta, resultado })
  } catch (e) {
    console.error("[drive-folder-audit]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    )
  }
}
