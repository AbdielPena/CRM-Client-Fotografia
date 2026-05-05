/**
 * Firma reusable del studio.
 * GET    → devuelve la firma actual (data URL o null)
 * POST   → guarda data URL como firma del studio
 * DELETE → borra la firma
 */

import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import { apiError } from "@/lib/utils/api-error"

const schema = z.object({
  signatureImageDataUrl: z.string().min(50).max(200_000), // ~150KB max base64
})

export async function GET() {
  try {
    const ctx = await requireStudioAuth()
    const supabase = createSupabaseServiceClient()
    const { data } = await supabase
      .from("studios")
      .select("signature_image_url")
      .eq("id", ctx.studioId)
      .maybeSingle()
    return NextResponse.json({
      signatureImageUrl:
        (data as { signature_image_url?: string | null } | null)?.signature_image_url ??
        null,
    })
  } catch (e) {
    return apiError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireStudioAuth()
    const body = schema.parse(await req.json())
    const supabase = createSupabaseServiceClient()
    const { error } = await supabase
      .from("studios")
      .update({ signature_image_url: body.signatureImageDataUrl })
      .eq("id", ctx.studioId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError(e)
  }
}

export async function DELETE() {
  try {
    const ctx = await requireStudioAuth()
    const supabase = createSupabaseServiceClient()
    const { error } = await supabase
      .from("studios")
      .update({ signature_image_url: null })
      .eq("id", ctx.studioId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError(e)
  }
}
