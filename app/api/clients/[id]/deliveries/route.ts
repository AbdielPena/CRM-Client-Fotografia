import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import {
  createDelivery,
  listDeliveriesByClient,
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

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  projectId: z.string().uuid().optional(),
  galleryId: z.string().uuid().optional(),
  files: z.array(fileSchema).max(200).optional(),
  externalLinks: z.array(linkSchema).max(20).optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    const items = await listDeliveriesByClient(ctx.studioId, params.id)
    return NextResponse.json({ deliveries: items })
  } catch (e) {
    return apiError(e)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    const body = createSchema.parse(await req.json())
    const created = await createDelivery(ctx.studioId, ctx.userId, {
      clientId: params.id,
      title: body.title,
      description: body.description,
      projectId: body.projectId,
      galleryId: body.galleryId,
      files: body.files,
      externalLinks: body.externalLinks,
    })
    return NextResponse.json({ delivery: created })
  } catch (e) {
    return apiError(e)
  }
}
