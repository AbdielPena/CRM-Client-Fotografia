import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { untypedService } from "@/server/supabase/untyped"
import {
  markGalleryForReprocessing,
  getWatermarkConfig,
  getStudioWatermarkDefaults,
} from "@/server/services/gallery-watermark.service"
import { reprocessAsset } from "@/server/services/gallery.service"
import { apiError } from "@/lib/utils/api-error"

const patchSchema = z
  .object({
    /** true = hereda la configuración del estudio (lo normal). */
    useStudioDefault: z.boolean().optional(),
    enabled: z.boolean().optional(),
    mode: z.enum(["text", "image"]).nullable().optional(),
    text: z.string().max(120).nullable().optional(),
    imageKey: z.string().max(255).nullable().optional(),
    position: z
      .enum([
        "center",
        "top-left",
        "top-center",
        "top-right",
        "middle-left",
        "middle-right",
        "bottom-left",
        "bottom-center",
        "bottom-right",
        "tile",
      ])
      .optional(),
    opacity: z.number().min(0.02).max(1).optional(),
    scale: z.number().int().min(3).max(100).optional(),
    rotation: z.number().int().min(-180).max(180).optional(),
    margin: z.number().int().min(0).max(45).optional(),
    reprocessAll: z.boolean().optional(),
  })
  .strict()

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    const supabase = untypedService()
    const { data, error } = await supabase
      .from("galleries")
      .select(
        "gallery_type, watermark_use_studio_default, watermark_enabled, watermark_mode, " +
          "watermark_text, watermark_image_key, watermark_position, watermark_opacity, " +
          "watermark_scale, watermark_rotation, watermark_margin",
      )
      .eq("id", params.id)
      .eq("studio_id", ctx.studioId)
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 })

    // Lo que realmente se va a estampar (ya resuelta la herencia del estudio).
    const effective = await getWatermarkConfig(params.id)
    const studioDefaults = await getStudioWatermarkDefaults(ctx.studioId)
    return NextResponse.json({ watermark: data, effective, studioDefaults })
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

    // untyped: las columnas de tamaño/rotación/herencia son nuevas y no están
    // en los tipos generados de Supabase.
    const update: Record<string, unknown> = {}
    if (body.useStudioDefault !== undefined)
      update.watermark_use_studio_default = body.useStudioDefault
    if (body.enabled !== undefined) update.watermark_enabled = body.enabled
    if (body.mode !== undefined) update.watermark_mode = body.mode
    if (body.text !== undefined) update.watermark_text = body.text
    if (body.imageKey !== undefined) update.watermark_image_key = body.imageKey
    if (body.position !== undefined) update.watermark_position = body.position
    if (body.opacity !== undefined) update.watermark_opacity = body.opacity
    if (body.scale !== undefined) update.watermark_scale = body.scale
    if (body.rotation !== undefined) update.watermark_rotation = body.rotation
    if (body.margin !== undefined) update.watermark_margin = body.margin
    // Sube la versión: si luego se aplica a fotos ya subidas, el navegador no
    // muestra la copia vieja en caché (las direcciones no cambian).
    update.watermark_version = Math.floor(Date.now() / 1000)

    const supabase = untypedService()
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
