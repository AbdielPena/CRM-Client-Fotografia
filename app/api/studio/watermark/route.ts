import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import { untypedService } from "@/server/supabase/untyped"
import { getStudioWatermarkDefaults } from "@/server/services/gallery-watermark.service"
import { apiError } from "@/lib/utils/api-error"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Marca de agua del estudio: la configuración que usan por defecto TODAS las
 * galerías de selección. Las de entrega nunca llevan marca.
 */

const schema = z
  .object({
    enabled: z.boolean(),
    mode: z.enum(["text", "image"]),
    text: z.string().max(120).nullable(),
    imageKey: z.string().max(255).nullable(),
    position: z.enum([
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
    ]),
    opacity: z.number().min(0.02).max(1),
    scale: z.number().int().min(3).max(100),
    rotation: z.number().int().min(-180).max(180),
    margin: z.number().int().min(0).max(45),
  })
  .strict()

export async function GET() {
  try {
    const ctx = await requireStudioAuth()
    const watermark = await getStudioWatermarkDefaults(ctx.studioId)
    return NextResponse.json({ watermark })
  } catch (e) {
    return apiError(e)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireStudioAuth()
    const body = schema.parse(await req.json())

    const svc = untypedService()
    // upsert: el estudio puede no tener fila de branding todavía.
    const { error } = await svc
      .from("studio_branding")
      .upsert(
        { studio_id: ctx.studioId, watermark_defaults: body },
        { onConflict: "studio_id" },
      )
    if (error) throw error

    // Las galerías que heredan del estudio suben de versión: así, si luego se
    // aplica la marca a fotos ya subidas, el navegador no muestra la copia
    // vieja en caché (los archivos conservan la misma dirección).
    const version = Math.floor(Date.now() / 1000)
    await svc
      .from("galleries")
      .update({ watermark_version: version })
      .eq("studio_id", ctx.studioId)
      .eq("watermark_use_studio_default", true)
      .eq("gallery_type", "selection")

    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError(e)
  }
}
