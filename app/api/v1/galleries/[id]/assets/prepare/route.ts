import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireApiToken } from "@/server/middleware/api-auth"
import { prepareDesktopAssetUpload } from "@/server/services/gallery.service"
import { apiError } from "@/lib/utils/api-error"

export const dynamic = "force-dynamic"

const schema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  fileSize: z.number().int().positive().max(200 * 1024 * 1024),
  setId: z.string().uuid().nullable().optional(),
  deliveryTrack: z.enum(["social", "high_quality"]).nullable().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiToken(req, "write")
  if (auth instanceof NextResponse) return auth
  try {
    const body = schema.parse(await req.json())
    const result = await prepareDesktopAssetUpload(auth.studioId, {
      galleryId: params.id,
      ...body,
    })
    return NextResponse.json(result)
  } catch (e) {
    return apiError(e)
  }
}
