import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import {
  submitClientSelection,
  validateGalleryToken,
} from "@/server/services/gallery.service"
import { apiError } from "@/lib/utils/api-error"
import { optionalClientEmail } from "@/lib/validations/gallery.schema"

const schema = z.object({
  clientEmail: optionalClientEmail,
})

/**
 * Cliente envía su selección final al fotógrafo.
 * Body: { clientEmail }
 * Toma todos los favoritos del cliente en esta galería como su selección,
 * marca la galería con selection_submitted y crea notificación al studio.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const view = await validateGalleryToken(params.token)
    if (!view) return NextResponse.json({ error: "token inválido" }, { status: 404 })

    const body = schema.parse(await req.json())
    const result = await submitClientSelection(view.gallery.id, body.clientEmail || null)
    return NextResponse.json(result)
  } catch (e) {
    return apiError(e)
  }
}
