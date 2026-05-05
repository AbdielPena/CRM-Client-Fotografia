import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import {
  createCollection,
  listCollections,
} from "@/server/services/gallery-collections.service"
import { apiError } from "@/lib/utils/api-error"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    const collections = await listCollections(ctx.studioId, params.id)
    return NextResponse.json({ collections })
  } catch (e) {
    return apiError(e)
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(150),
  description: z.string().max(500).optional().or(z.literal("")),
  isClientEditable: z.boolean().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    const body = createSchema.parse(await req.json())
    const collection = await createCollection(ctx.studioId, ctx.userId, {
      galleryId: params.id,
      ...body,
    })
    return NextResponse.json({ collection })
  } catch (e) {
    return apiError(e)
  }
}
