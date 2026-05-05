import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import {
  deleteCollection,
  getCollection,
  updateCollection,
} from "@/server/services/gallery-collections.service"
import { apiError } from "@/lib/utils/api-error"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; collectionId: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    const result = await getCollection(ctx.studioId, params.collectionId)
    if (!result) {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }
    return NextResponse.json(result)
  } catch (e) {
    return apiError(e)
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(500).nullable().optional(),
  isClientEditable: z.boolean().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; collectionId: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    const patch = patchSchema.parse(await req.json())
    const collection = await updateCollection(
      ctx.studioId,
      params.collectionId,
      patch,
    )
    return NextResponse.json({ collection })
  } catch (e) {
    return apiError(e)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; collectionId: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    await deleteCollection(ctx.studioId, params.collectionId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError(e)
  }
}
