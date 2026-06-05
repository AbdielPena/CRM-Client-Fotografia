import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import {
  captureGuestLead,
  getClientFavorites,
  toggleFavorite,
  validateGalleryToken,
} from "@/server/services/gallery.service"
import { apiError } from "@/lib/utils/api-error"

const schema = z.object({
  assetId: z.string().min(1),
  clientEmail: z.string().email().optional().or(z.literal("")),
  clientName: z.string().max(120).optional().or(z.literal("")),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const view = await validateGalleryToken(params.token)
    if (!view) return NextResponse.json({ error: "token inválido" }, { status: 404 })

    const body = schema.parse(await req.json())
    const result = await toggleFavorite(
      view.gallery.id,
      body.assetId,
      body.clientEmail || null,
      body.clientName || null,
    )
    // Captura de lead de invitado (no bloquea la respuesta).
    if (body.clientEmail) {
      void captureGuestLead(view.gallery.id, body.clientEmail, body.clientName || null)
    }
    return NextResponse.json(result)
  } catch (e) {
    return apiError(e)
  }
}

// GET — lista favoritos previos del cliente para hidratar UI al cargar
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const view = await validateGalleryToken(params.token)
    if (!view) return NextResponse.json({ error: "token inválido" }, { status: 404 })

    const url = new URL(req.url)
    const email = url.searchParams.get("email") ?? ""
    const favorites = await getClientFavorites(view.gallery.id, email)
    return NextResponse.json({ favorites })
  } catch (e) {
    return apiError(e)
  }
}
