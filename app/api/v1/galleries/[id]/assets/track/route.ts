import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireApiToken } from "@/server/middleware/api-auth"
import { setAssetsDeliveryTrack } from "@/server/services/gallery.service"
import { apiError } from "@/lib/utils/api-error"

export const dynamic = "force-dynamic"

const schema = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(5000),
  track: z.enum(["social", "high_quality"]).nullable(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiToken(req, "write")
  if (auth instanceof NextResponse) return auth
  try {
    const body = schema.parse(await req.json())
    await setAssetsDeliveryTrack(auth.studioId, params.id, body.assetIds, body.track)
    return NextResponse.json({ ok: true, updated: body.assetIds.length })
  } catch (e) {
    return apiError(e)
  }
}
