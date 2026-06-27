import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireApiToken } from "@/server/middleware/api-auth"
import { completeDesktopAsset } from "@/server/services/gallery.service"
import { apiError } from "@/lib/utils/api-error"

export const dynamic = "force-dynamic"

const schema = z.object({
  assetId: z.string().uuid(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  lqip: z.string().max(20000).nullable().optional(),
  format: z.string().max(20).nullable().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiToken(req, "write")
  if (auth instanceof NextResponse) return auth
  try {
    const body = schema.parse(await req.json())
    const asset = await completeDesktopAsset(auth.studioId, params.id, body.assetId, {
      width: body.width,
      height: body.height,
      lqip: body.lqip ?? null,
      format: body.format ?? null,
    })
    return NextResponse.json({ ok: true, asset: { id: asset.id, status: asset.status } })
  } catch (e) {
    return apiError(e)
  }
}
