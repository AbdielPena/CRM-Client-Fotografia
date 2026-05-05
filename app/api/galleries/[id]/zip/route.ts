import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import { createZipExport } from "@/server/services/gallery-collections.service"
import { apiError } from "@/lib/utils/api-error"

const schema = z.object({
  scope: z.enum(["gallery", "collection", "selection"]),
  collectionId: z.string().uuid().optional(),
  assetIds: z.array(z.string().uuid()).max(2000).optional(),
  resolution: z.enum(["web", "original"]).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    const body = schema.parse(await req.json())
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
    const exportRow = await createZipExport(ctx.studioId, ctx.userId, {
      galleryId: params.id,
      ...body,
      clientIp: ip,
    })
    return NextResponse.json({
      exportId: exportRow.id,
      status: exportRow.status,
    })
  } catch (e) {
    return apiError(e)
  }
}
