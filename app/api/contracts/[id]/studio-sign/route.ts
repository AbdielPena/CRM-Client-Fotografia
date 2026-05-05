import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import { signContractByStudio } from "@/server/services/contract.service"
import { apiError } from "@/lib/utils/api-error"

const schema = z.object({
  signatureImageDataUrl: z.string().optional(),
  signedName: z.string().max(120).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    const body = schema.parse(await req.json().catch(() => ({})))
    await signContractByStudio(ctx.studioId, ctx.userId, params.id, body)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError(e)
  }
}
