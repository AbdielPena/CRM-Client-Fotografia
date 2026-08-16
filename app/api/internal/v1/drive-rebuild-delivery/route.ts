import { NextResponse, type NextRequest } from "next/server"

import { untypedService } from "@/server/supabase/untyped"
import * as drive from "@/server/services/google-drive.service"
import { runGalleryDriveBackup } from "@/server/services/gallery-drive.service"
import { safeEqual } from "@/lib/utils/timing-safe"

/**
 * POST /api/internal/v1/drive-rebuild-delivery?carpeta=<root_folder_id>&apply=1
 *
 * VACÍA la carpeta del cliente en Drive y vuelve a subir su ENTREGA desde cero.
 *
 * Hace falta porque la entrega y la selección de un mismo proyecto compartían
 * carpeta, y los archivos se llaman igual: la misma toma, una sin editar y otra
 * retocada. La selección subió primero; cuando le tocó a la entrega, el
 * "saltar lo que ya está subido" comparó por NOMBRE, las dio por hechas y no
 * subió ninguna. Resultado: en la carpeta del cliente quedaron los archivos
 * CRUDOS con el nombre de los editados (uploaded_assets = 0 lo delata).
 *
 * Por eso no basta con borrar: hay que vaciar y reconstruir, porque los que
 * quedan son los equivocados.
 *
 * No se le vuelve a escribir al cliente: `email_sent_at` ya está puesto y el
 * envío está protegido contra repetición.
 *
 * Auth: header `x-internal-key` == INTERNAL_API_KEY.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

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

  const url = new URL(req.url)
  const carpeta = url.searchParams.get("carpeta")
  const aplicar = url.searchParams.get("apply") === "1"
  if (!carpeta) return NextResponse.json({ error: "falta ?carpeta=" }, { status: 400 })

  try {
    const sb = untypedService()
    const { data: raw } = await sb
      .from("gallery_drive_backups")
      .select(
        "id, studio_id, gallery_id, high_quality_folder_id, social_folder_id, galleries!inner(gallery_type, name)",
      )
      .eq("root_folder_id", carpeta)

    const filas = (raw ?? []) as Array<Record<string, unknown>>
    if (filas.length === 0) {
      return NextResponse.json({ error: "carpeta desconocida" }, { status: 404 })
    }
    const studioId = String(filas[0].studio_id)

    const tipoDe = (r: Record<string, unknown>) =>
      ((Array.isArray(r.galleries) ? r.galleries[0] : r.galleries) as { gallery_type: string })
        .gallery_type

    const entregas = filas.filter((r) => tipoDe(r) === "final_delivery")
    if (entregas.length === 0) {
      return NextResponse.json(
        { error: "esta carpeta no tiene ninguna entrega final que reconstruir" },
        { status: 400 },
      )
    }

    // 1) Vaciar las subcarpetas. Lo que hay dentro está mal.
    const subcarpetas = new Set<string>()
    for (const r of filas) {
      if (r.high_quality_folder_id) subcarpetas.add(String(r.high_quality_folder_id))
      if (r.social_folder_id) subcarpetas.add(String(r.social_folder_id))
    }
    let borrados = 0
    for (const sub of subcarpetas) {
      const archivos = await drive.listFilesInFolder(studioId, sub, 1000)
      for (const f of archivos) {
        if (aplicar) await drive.deleteFile(studioId, f.id)
        borrados += 1
      }
    }

    // 2) Los respaldos de SELECCIÓN de esta carpeta no deben volver nunca.
    const idsSeleccion = filas
      .filter((r) => tipoDe(r) !== "final_delivery")
      .map((r) => String(r.id))
    if (aplicar && idsSeleccion.length > 0) {
      await sb
        .from("gallery_drive_backups")
        .update({
          status: "cancelled",
          last_error: "a Drive solo sube la entrega final",
          updated_at: new Date().toISOString(),
        })
        .in("id", idsSeleccion)
    }

    // 3) Reconstruir la entrega desde cero, con la carpeta ya vacía.
    let subidas = 0
    if (aplicar) {
      for (const e of entregas) {
        await sb
          .from("gallery_drive_backups")
          .update({
            status: "pending",
            uploaded_assets: 0,
            bytes_uploaded: 0,
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", String(e.id))
        await runGalleryDriveBackup(String(e.id))
        const { data: fresca } = await sb
          .from("gallery_drive_backups")
          .select("uploaded_assets")
          .eq("id", String(e.id))
          .maybeSingle()
        subidas += Number((fresca as { uploaded_assets: number } | null)?.uploaded_assets ?? 0)
      }
    }

    return NextResponse.json({
      ok: true,
      aplicado: aplicar,
      archivosBorrados: borrados,
      entregasReconstruidas: entregas.length,
      fotosSubidas: subidas,
      seleccionesCanceladas: idsSeleccion.length,
    })
  } catch (e) {
    console.error("[drive-rebuild-delivery]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    )
  }
}
