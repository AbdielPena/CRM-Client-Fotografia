import { NextResponse, type NextRequest } from "next/server"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { apiError } from "@/lib/utils/api-error"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/galleries/<id>/asset-names
 *
 * Devuelve los nombres de archivo que ya están en la galería. El subidor lo
 * consulta al soltar fotos para SALTAR las repetidas: así, si una subida se
 * corta a la mitad, se puede volver a soltar la carpeta completa y solo entran
 * las que faltan, sin duplicar nada.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    const svc = createSupabaseServiceClient()

    // Paginado obligatorio: PostgREST corta en 1.000 filas y estas galerías
    // pasan de 2.000 fotos.
    const PAGE = 1000
    const names: string[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await svc
        .from("gallery_assets")
        .select("original_name")
        .eq("studio_id", ctx.studioId)
        .eq("gallery_id", params.id)
        .is("deleted_at", null)
        .range(from, from + PAGE - 1)
      if (error) throw error
      const rows = (data ?? []) as Array<{ original_name: string | null }>
      for (const r of rows) if (r.original_name) names.push(r.original_name)
      if (rows.length < PAGE) break
    }

    return NextResponse.json({ names })
  } catch (e) {
    return apiError(e)
  }
}
