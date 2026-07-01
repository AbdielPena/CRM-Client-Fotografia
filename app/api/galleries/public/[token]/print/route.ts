import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { validateGalleryToken } from "@/server/services/gallery.service"
import {
  addPrintSelection,
  removePrintSelection,
  getGalleryPrintState,
  PrintSelectionError,
} from "@/server/services/print-selection.service"
import { apiError } from "@/lib/utils/api-error"
import { optionalClientEmail } from "@/lib/validations/gallery.schema"

const schema = z.object({
  action: z.enum(["add", "remove"]),
  assetId: z.string().uuid(),
  type: z.enum(["album_cover", "frame", "print"]),
  spec: z.string().max(40).nullable().optional(),
  clientEmail: optionalClientEmail,
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
    const spec = body.spec ?? null

    try {
      if (body.action === "add") {
        await addPrintSelection({
          galleryId: view.gallery.id,
          assetId: body.assetId,
          type: body.type,
          spec,
          clientEmail: body.clientEmail || null,
          clientName: body.clientName || null,
        })
      } else {
        await removePrintSelection({
          galleryId: view.gallery.id,
          assetId: body.assetId,
          type: body.type,
          spec,
        })
      }
    } catch (err) {
      if (err instanceof PrintSelectionError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: 409 })
      }
      throw err
    }

    const state = await getGalleryPrintState(view.gallery.id)
    return NextResponse.json({ ok: true, state })
  } catch (e) {
    return apiError(e)
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const view = await validateGalleryToken(params.token)
    if (!view) return NextResponse.json({ error: "token inválido" }, { status: 404 })
    const state = await getGalleryPrintState(view.gallery.id)
    return NextResponse.json({ state })
  } catch (e) {
    return apiError(e)
  }
}
