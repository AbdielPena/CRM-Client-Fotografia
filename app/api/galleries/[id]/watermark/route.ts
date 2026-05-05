import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { markGalleryForReprocessing } from "@/server/services/gallery-watermark.service"
import { reprocessAsset } from "@/server/services/gallery.service"
import type { Database } from "@/types/supabase"
import { apiError } from "@/lib/utils/api-error"

const patchSchema = z
  .object({
    enabled: z.boolean().optional(),
    mode: z.enum(["text", "image"]).nullable().optional(),
    text: z.string().max(120).nullable().optional(),
    imageKey: z.string().max(255).nullable().optional(),
    position: z
      .enum(["center", "top-left", "top-right", "bottom-left", "bottom-right", "tile"])
      .optional(),
    opacity: z.number().min(0).max(1).optional(),
    reprocessAll: z.boolean().optional(),
  })
  .strict()

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from("galleries")
      .select(
        "watermark_enabled, watermark_mode, watermark_text, watermark_image_key, watermark_position, watermark_opacity",
      )
      .eq("id", params.id)
      .eq("studio_id", ctx.studioId)
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ watermark: data })
  } catch (e) {
    return apiError(e)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    const body = patchSchema.parse(await req.json())

    type GalleriesUpdate = Database["public"]["Tables"]["galleries"]["Update"]
    const update: GalleriesUpdate = {}
    if (body.enabled !== undefined) update.watermark_enabled = body.enabled
    if (body.mode !== undefined) update.watermark_mode = body.mode
    if (body.text !== undefined) update.watermark_text = body.text
    if (body.imageKey !== undefined) update.watermark_image_key = body.imageKey
    if (body.position !== undefined) update.watermark_position = body.position
    if (body.opacity !== undefined) update.watermark_opacity = body.opacity

    const supabase = createSupabaseServerClient()
    const { error } = await supabase
      .from("galleries")
      .update(update)
      .eq("id", params.id)
      .eq("studio_id", ctx.studioId)
    if (error) throw error

    let reprocessed = 0
    if (body.reprocessAll) {
      const svc = createSupabaseServiceClient()
      const { data: assets } = await svc
        .from("gallery_assets")
        .select("id")
        .eq("studio_id", ctx.studioId)
        .eq("gallery_id", params.id)
        .is("deleted_at", null)
      const ids = (assets ?? []).map((a) => a.id as string)

      // Marcar y disparar processing de cada uno
      await markGalleryForReprocessing(ctx.studioId, params.id)
      for (const assetId of ids) {
        void reprocessAsset(ctx.studioId, params.id, assetId)
      }
      reprocessed = ids.length
    }

    return NextResponse.json({ ok: true, reprocessed })
  } catch (e) {
    return apiError(e)
  }
}
