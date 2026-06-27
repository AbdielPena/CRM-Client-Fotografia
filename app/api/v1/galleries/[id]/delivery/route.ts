import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireApiToken } from "@/server/middleware/api-auth"
import { getGalleryById } from "@/server/services/gallery.service"
import { getSetsByGallery, createSet } from "@/server/services/gallery-set.service"
import { untypedService } from "@/server/supabase/untyped"
import { apiError } from "@/lib/utils/api-error"

export const dynamic = "force-dynamic"

const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim()

const schema = z.object({ action: z.enum(["enable", "cancel"]) })

// Entrega final desde el desktop. `enable` crea los 2 sets estándar
// (Máxima Calidad / Redes Sociales) si faltan. `cancel` revierte la entrega.
// La notificación al cliente (email/WhatsApp/Drive) se hace por ahora desde la
// web embebida (botón "Enviar al cliente"); se expondrá `notify` en un follow-up.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiToken(req, "write")
  if (auth instanceof NextResponse) return auth
  try {
    const gallery = await getGalleryById(auth.studioId, params.id)
    if (!gallery) return NextResponse.json({ error: "Galería no encontrada" }, { status: 404 })
    const { action } = schema.parse(await req.json())

    if (action === "enable") {
      const existing = await getSetsByGallery(auth.studioId, params.id)
      const names = new Set(existing.map((s) => norm(s.name)))
      const toCreate = [
        { name: "Máxima Calidad", description: "JPG full quality — para imprimir y archivar", isPrivate: false },
        { name: "Redes Sociales", description: "Versiones comprimidas listas para Instagram/Facebook", isPrivate: false },
      ].filter((s) => !names.has(norm(s.name)))
      for (const s of toCreate) await createSet(auth.studioId, params.id, s)
      return NextResponse.json({ ok: true, created: toCreate.length })
    }

    // cancel
    const sb = untypedService()
    await sb
      .from("galleries")
      .update({ delivery_ready_at: null, gallery_type: "selection" })
      .eq("id", params.id)
      .eq("studio_id", auth.studioId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError(e)
  }
}
