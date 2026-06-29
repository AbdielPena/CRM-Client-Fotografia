import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireApiToken } from "@/server/middleware/api-auth"
import { getGalleryById } from "@/server/services/gallery.service"
import { shareSelectionGallery } from "@/server/services/selection-share.service"
import { apiError } from "@/lib/utils/api-error"

export const dynamic = "force-dynamic"

const schema = z.object({
  sendEmail: z.boolean().optional(),
  sendWhatsapp: z.boolean().optional(),
})

// Publica la galería de selección + comparte el link al cliente (correo +
// WhatsApp). Pensado para el botón "Subir y compartir" del desktop.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiToken(req, "write")
  if (auth instanceof NextResponse) return auth
  try {
    const gallery = await getGalleryById(auth.studioId, params.id, true)
    if (!gallery)
      return NextResponse.json({ error: "Galería no encontrada" }, { status: 404 })
    const body = schema.parse(await req.json().catch(() => ({})))
    const result = await shareSelectionGallery(auth.studioId, params.id, body)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return apiError(e)
  }
}
