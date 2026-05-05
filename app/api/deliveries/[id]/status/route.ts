import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import { setDeliveryStatus } from "@/server/services/client-delivery.service"
import { apiError } from "@/lib/utils/api-error"

const schema = z.object({
  status: z.enum(["pending", "delivered", "reviewed"]),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    const body = schema.parse(await req.json())
    await setDeliveryStatus(ctx.studioId, params.id, body.status)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError(e)
  }
}
