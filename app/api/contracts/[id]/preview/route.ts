/**
 * Vista previa del contrato con datos reales — para que el admin valide
 * que los placeholders están bien antes de enviar al cliente.
 */

import { NextResponse, type NextRequest } from "next/server"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import {
  buildContractPlaceholders,
  injectSignatures,
  renderPlaceholders,
} from "@/server/services/contract-placeholders.service"
import { apiError } from "@/lib/utils/api-error"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requireStudioAuth()
    const supabase = createSupabaseServiceClient()
    const { data: contract } = await supabase
      .from("contracts")
      .select(
        "id, studio_id, title, body_html, signed_name, signed_at, signature_image_url, studio_signed_name, studio_signed_at, studio_signature_image_url",
      )
      .eq("id", params.id)
      .eq("studio_id", ctx.studioId)
      .is("deleted_at", null)
      .maybeSingle()
    if (!contract) {
      return NextResponse.json(
        { error: "Contrato no encontrado" },
        { status: 404 },
      )
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = contract as any

    const { vars, context } = await buildContractPlaceholders(c.id as string)
    const rendered = renderPlaceholders((c.body_html as string) ?? "", vars)
    const final = injectSignatures(
      rendered,
      {
        imageUrl: c.signature_image_url as string | null,
        name: c.signed_name as string | null,
        signedAt: c.signed_at as string | null,
      },
      {
        imageUrl: c.studio_signature_image_url as string | null,
        name: c.studio_signed_name as string | null,
        signedAt: c.studio_signed_at as string | null,
      },
    )

    return NextResponse.json({
      title: c.title,
      html: final,
      vars,
      context,
    })
  } catch (e) {
    return apiError(e)
  }
}
