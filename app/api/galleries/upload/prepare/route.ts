import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import { prepareAssetUpload } from "@/server/services/gallery.service"
import { apiError } from "@/lib/utils/api-error"

const schema = z.object({
  galleryId: z.string().min(1),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  fileSize: z.number().int().positive().max(200 * 1024 * 1024),
})

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireStudioAuth()
    const body = schema.parse(await req.json())
    const result = await prepareAssetUpload(ctx.studioId, body.galleryId, body)
    return NextResponse.json(result)
  } catch (e) {
    return apiError(e)
  }
}
