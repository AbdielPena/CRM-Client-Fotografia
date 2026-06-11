import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import {
  createManualReview,
  listAllReviews,
} from "@/server/services/engagement-feedback.service"
import { apiError } from "@/lib/utils/api-error"

const createSchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().min(1).max(2000),
  displayName: z.string().min(1).max(120),
  photoUrl: z.string().url().nullable().optional(),
  projectTitle: z.string().max(200).nullable().optional(),
  published: z.boolean().optional(),
})

export async function GET() {
  try {
    const ctx = await requireStudioAuth()
    const reviews = await listAllReviews(ctx.studioId)
    return NextResponse.json({ reviews })
  } catch (e) {
    return apiError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireStudioAuth()
    const body = createSchema.parse(await req.json())
    const id = await createManualReview(ctx.studioId, body)
    return NextResponse.json({ id })
  } catch (e) {
    return apiError(e)
  }
}
