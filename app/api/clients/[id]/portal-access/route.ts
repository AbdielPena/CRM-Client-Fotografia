/**
 * Endpoint para que el studio gestione el acceso al portal de un cliente.
 *
 *   POST   → genera código si no existe (idempotente) y devuelve el código actual
 *   PATCH  → regenera código nuevo (invalida anterior)
 *   POST { send: true }       → envía email con el código actual
 *   PATCH { send: true }      → regenera + envía
 */

import { NextResponse, type NextRequest } from "next/server"

import { requireStudioAuth } from "@/server/supabase/auth-context"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import {
  ensureClientAccessCode,
  regenerateClientAccessCode,
} from "@/server/services/client-portal.service"
import { sendClientPortalAccessEmail } from "@/server/services/client-portal-email.service"
import { apiError } from "@/lib/utils/api-error"

async function fetchClient(studioId: string, clientId: string) {
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from("clients")
    .select("id, name, email")
    .eq("studio_id", studioId)
    .eq("id", clientId)
    .maybeSingle()
  return data as { id: string; name: string; email: string | null } | null
}

async function handle(
  req: NextRequest,
  { params }: { params: { id: string } },
  regenerate: boolean,
) {
  try {
    const ctx = await requireStudioAuth()

    // Solo admin/owner pueden regenerar codes (puerta de entrada al portal)
    if (regenerate && ctx.studioRole !== "admin" && ctx.studioRole !== "owner") {
      return NextResponse.json(
        { error: "Tu rol no permite regenerar códigos de acceso." },
        { status: 403 },
      )
    }

    // Validar que el cliente pertenece al studio antes de cualquier mutation
    const clientCheck = await fetchClient(ctx.studioId, params.id)
    if (!clientCheck) {
      return NextResponse.json(
        { error: "Cliente no encontrado en este studio." },
        { status: 404 },
      )
    }

    const body = (await req.json().catch(() => ({}))) as { send?: boolean }
    const send = body.send === true

    const code = regenerate
      ? await regenerateClientAccessCode(ctx.studioId, params.id)
      : await ensureClientAccessCode(ctx.studioId, params.id)

    if (send) {
      const c = await fetchClient(ctx.studioId, params.id)
      if (!c?.email) {
        return NextResponse.json(
          { error: "El cliente no tiene email — agregalo antes de enviar." },
          { status: 422 },
        )
      }
      await sendClientPortalAccessEmail({
        studioId: ctx.studioId,
        clientId: c.id,
        clientName: c.name,
        clientEmail: c.email,
        accessCode: code,
      })
    }

    return NextResponse.json({ ok: true, code, sent: send })
  } catch (e) {
    return apiError(e)
  }
}

export const POST = (req: NextRequest, ctx: { params: { id: string } }) =>
  handle(req, ctx, false)

export const PATCH = (req: NextRequest, ctx: { params: { id: string } }) =>
  handle(req, ctx, true)
