import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import {
  getClientComments,
  setAssetComment,
  validateGalleryToken,
} from "@/server/services/gallery.service"
import { apiError } from "@/lib/utils/api-error"

/**
 * Comentarios del cliente por foto en la galería de selección. Igual que los
 * favoritos, atados a un correo (identidad del cliente). Cuerpo vacío = borra.
 */
const schema = z.object({
  assetId: z.string().min(1),
  clientEmail: z.string().trim().email(),
  body: z.string().max(1000),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const view = await validateGalleryToken(params.token)
    if (!view) return NextResponse.json({ error: "token inválido" }, { status: 404 })

    const body = schema.parse(await req.json())
    const result = await setAssetComment(
      view.gallery.id,
      body.assetId,
      body.clientEmail,
      body.body,
    )
    return NextResponse.json(result)
  } catch (e) {
    return apiError(e)
  }
}

// GET — comentarios previos del cliente para hidratar la UI al cargar.
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const view = await validateGalleryToken(params.token)
    if (!view) return NextResponse.json({ error: "token inválido" }, { status: 404 })

    const url = new URL(req.url)
    const email = url.searchParams.get("email") ?? ""
    const comments = await getClientComments(view.gallery.id, email)
    return NextResponse.json({ comments })
  } catch (e) {
    return apiError(e)
  }
}
