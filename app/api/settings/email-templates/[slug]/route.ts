import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import {
  getStudioTemplate,
  TEMPLATE_CATALOG,
  upsertStudioTemplate,
  type TemplateSlug,
} from "@/server/services/email-template.service"
import { apiError } from "@/lib/utils/api-error"

const patchSchema = z.object({
  subject: z.string().min(1).max(300),
  body_html: z.string().min(1).max(50_000),
  from_name: z.string().max(120).nullable().optional(),
  reply_to: z.string().email().max(120).nullable().optional(),
  is_active: z.boolean().optional(),
})

function validSlug(s: string): s is TemplateSlug {
  return s in TEMPLATE_CATALOG
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    if (!validSlug(params.slug)) {
      return NextResponse.json({ error: "slug inválido" }, { status: 404 })
    }
    const tpl = await getStudioTemplate(ctx.studioId, params.slug)
    const def = TEMPLATE_CATALOG[params.slug]
    return NextResponse.json({
      slug: params.slug,
      catalog: def,
      template: tpl,
    })
  } catch (e) {
    return apiError(e)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    if (!validSlug(params.slug)) {
      return NextResponse.json({ error: "slug inválido" }, { status: 404 })
    }
    const body = patchSchema.parse(await req.json())
    await upsertStudioTemplate(ctx.studioId, {
      slug: params.slug,
      subject: body.subject,
      body_html: body.body_html,
      from_name: body.from_name ?? null,
      reply_to: body.reply_to ?? null,
      is_active: body.is_active ?? true,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError(e)
  }
}
