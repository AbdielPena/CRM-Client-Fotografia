import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireApiToken } from "@/server/middleware/api-auth"
import { confirmAssetUpload } from "@/server/services/gallery.service"
import { apiError } from "@/lib/utils/api-error"

export const dynamic = "force-dynamic"

// Fallback: si el desktop no pudo generar renditions, sube solo el original y
// llama aquí para que el servidor procese (mismo flujo que la web).
const schema = z.object({ assetId: z.string().uuid() })

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiToken(req, "write")
  if (auth instanceof NextResponse) return auth
  try {
    const body = schema.parse(await req.json())
    await confirmAssetUpload(auth.studioId, body.assetId, params.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError(e)
  }
}
