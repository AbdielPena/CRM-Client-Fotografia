import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireApiToken } from "@/server/middleware/api-auth"
import { getGalleryById } from "@/server/services/gallery.service"
import { getSetsByGallery, createSet } from "@/server/services/gallery-set.service"
import { apiError } from "@/lib/utils/api-error"

export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiToken(req, "read")
  if (auth instanceof NextResponse) return auth
  const sets = await getSetsByGallery(auth.studioId, params.id)
  return NextResponse.json({
    items: sets.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      assetCount: s.asset_count,
      isPrivate: s.is_private,
      sortOrder: s.sort_order,
    })),
  })
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  isPrivate: z.boolean().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiToken(req, "write")
  if (auth instanceof NextResponse) return auth
  try {
    const gallery = await getGalleryById(auth.studioId, params.id)
    if (!gallery) return NextResponse.json({ error: "Galería no encontrada" }, { status: 404 })
    const body = createSchema.parse(await req.json())
    const set = await createSet(auth.studioId, params.id, {
      name: body.name,
      description: body.description ?? null,
      isPrivate: body.isPrivate ?? false,
    })
    return NextResponse.json({ set: { id: set.id, name: set.name } })
  } catch (e) {
    return apiError(e)
  }
}
