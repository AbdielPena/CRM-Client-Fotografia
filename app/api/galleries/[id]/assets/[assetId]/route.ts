import { NextResponse, type NextRequest } from "next/server"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import { deleteAsset, reprocessAsset } from "@/server/services/gallery.service"
import { apiError } from "@/lib/utils/api-error"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; assetId: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    await deleteAsset(ctx.studioId, params.id, params.assetId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError(e)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; assetId: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    const { action } = (await req.json()) as { action?: string }
    if (action === "reprocess") {
      await reprocessAsset(ctx.studioId, params.id, params.assetId)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 })
  } catch (e) {
    return apiError(e)
  }
}
