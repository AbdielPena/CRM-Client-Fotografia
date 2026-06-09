import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { submitFeedback } from "@/server/services/engagement-feedback.service"

const schema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional().nullable(),
})

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const body = schema.parse(await req.json())
    const r = await submitFeedback(params.token, body.stars, body.comment ?? null)
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 },
    )
  }
}
