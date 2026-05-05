import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import { confirmAssetUpload } from "@/server/services/gallery.service"
import { apiError } from "@/lib/utils/api-error"

const schema = z.object({
  galleryId: z.string().min(1),
  assetId: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireStudioAuth()
    const body = schema.parse(await req.json())
    const asset = await confirmAssetUpload(ctx.studioId, body.assetId, body.galleryId)
    return NextResponse.json({ asset })
  } catch (e) {
    return apiError(e)
  }
}
