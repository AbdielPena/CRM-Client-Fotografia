import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import { bulkDeleteAssets } from "@/server/services/gallery.service"
import { apiError } from "@/lib/utils/api-error"

const schema = z.object({
  assetIds: z.array(z.string().min(1)).min(1).max(500),
})

async function handle(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    const { assetIds } = schema.parse(await req.json())
    const result = await bulkDeleteAssets(ctx.studioId, params.id, assetIds)
    return NextResponse.json(result)
  } catch (e) {
    return apiError(e)
  }
}

// El cliente llama con DELETE; mantenemos POST como alias para compatibilidad.
export const DELETE = handle
export const POST = handle
