import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import {
  deleteReview,
  updateReview,
} from "@/server/services/engagement-feedback.service"
import { apiError } from "@/lib/utils/api-error"

const patchSchema = z.object({
  stars: z.number().int().min(1).max(5).optional(),
  comment: z.string().min(1).max(2000).optional(),
  displayName: z.string().min(1).max(120).optional(),
  photoUrl: z.string().url().nullable().optional(),
  projectTitle: z.string().max(200).nullable().optional(),
  published: z.boolean().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    const body = patchSchema.parse(await req.json())
    await updateReview(ctx.studioId, params.id, body)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError(e)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    await deleteReview(ctx.studioId, params.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError(e)
  }
}
