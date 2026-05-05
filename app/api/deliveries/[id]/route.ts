import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import {
  deleteDelivery,
  updateDelivery,
} from "@/server/services/client-delivery.service"
import { apiError } from "@/lib/utils/api-error"

const fileSchema = z.object({
  name: z.string().min(1).max(255),
  url: z.string().url(),
  size: z.number().int().nonnegative().optional(),
  mime: z.string().max(120).optional(),
})

const linkSchema = z.object({
  label: z.string().min(1).max(120),
  url: z.string().url(),
})

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  files: z.array(fileSchema).max(200).optional(),
  externalLinks: z.array(linkSchema).max(20).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    const body = patchSchema.parse(await req.json())
    await updateDelivery(ctx.studioId, params.id, body)
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
    await deleteDelivery(ctx.studioId, params.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError(e)
  }
}
