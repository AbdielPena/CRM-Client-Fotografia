import { NextResponse, type NextRequest } from "next/server"

import { untypedService } from "@/server/supabase/untyped"
import { rebuildGalleryWatermarks } from "@/server/services/gallery-watermark-rebuild.service"
import { safeEqual } from "@/lib/utils/timing-safe"

/**
 * POST /api/internal/v1/watermark-rebuild?limit=40
 *
 * Reaplica la marca de agua a las fotos YA subidas de TODAS las galerías de
 * SELECCIÓN, por tandas. La pantalla de Configuración lo hace galería por
 * galería; esto existe para reprocesar el catálogo completo de una (son ~10 mil
 * fotos y hacerlo a mano, galería por galería, no es razonable).
 *
 * Cada llamada procesa UNA tanda de la primera galería que tenga pendientes y
 * devuelve cuánto falta, para llamarlo en bucle desde el servidor:
 *
 *   while :; do
 *     r=$(curl -s -X POST -H "x-internal-key: $KEY" ".../watermark-rebuild?limit=40")
 *     echo "$r" | grep -q '"pendingTotal":0' && break
 *   done
 *
 * No toca los ORIGINALES ni los enlaces: reescribe miniatura y foto grande en
 * la MISMA dirección de archivo. Las galerías de ENTREGA nunca se marcan.
 *
 * Auth: header `x-internal-key` == INTERNAL_API_KEY.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

interface GalleryRow {
  id: string
  studio_id: string
  name: string | null
  watermark_version: number | null
}

export async function POST(req: NextRequest) {
  const expected = process.env.INTERNAL_API_KEY ?? null
  if (!expected) {
    return NextResponse.json(
      { error: "INTERNAL_API_KEY no configurada" },
      { status: 500 },
    )
  }
  const provided =
    req.headers.get("x-internal-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? 40) || 40, 1),
    100,
  )

  try {
    // `galleryId` opcional: procesar UNA galería concreta. Sirve para dejar
    // una de prueba lista y mirarla antes de soltar el catálogo entero.
    const onlyGallery = url.searchParams.get("galleryId")

    const sb = untypedService()
    let q = sb
      .from("galleries")
      .select("id, studio_id, name, watermark_version")
      .eq("gallery_type", "selection")
      .is("deleted_at", null)
    if (onlyGallery) q = q.eq("id", onlyGallery)
    const { data: galsRaw } = await q.order("created_at", { ascending: true })
    const galleries = (galsRaw ?? []) as GalleryRow[]

    let pendingTotal = 0
    let target: GalleryRow | null = null

    // Cuántas fotos siguen sin la marca de la versión vigente, por galería.
    for (const g of galleries) {
      const version = Number(g.watermark_version ?? 0)
      const { count } = await sb
        .from("gallery_assets")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", g.studio_id)
        .eq("gallery_id", g.id)
        .is("deleted_at", null)
        .eq("status", "completed")
        .or(`metadata->>wm_v.is.null,metadata->>wm_v.neq.${version}`)
      const pending = count ?? 0
      pendingTotal += pending
      if (pending > 0 && !target) target = g
    }

    if (!target) {
      return NextResponse.json({ ok: true, done: true, pendingTotal: 0 })
    }

    const result = await rebuildGalleryWatermarks({
      studioId: target.studio_id,
      galleryId: target.id,
      limit,
    })

    return NextResponse.json({
      ok: true,
      done: false,
      gallery: target.name,
      galleryId: target.id,
      ...result,
      // Lo que faltaba ANTES de esta tanda, menos lo que se acaba de hacer.
      pendingTotal: Math.max(0, pendingTotal - result.processed),
    })
  } catch (e) {
    console.error("[watermark-rebuild]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    )
  }
}
