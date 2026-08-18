import { NextResponse, type NextRequest } from "next/server"

import { safeEqual } from "@/lib/utils/timing-safe"
import {
  changeClientEmail,
  previewClientEmailChange,
} from "@/server/services/client-email-change.service"

/**
 * POST /api/internal/v1/client-email-change?cliente=<id>&email=<nuevo>[&apply=1][&reenviar=1]
 *
 * El mismo cambio de correo que hace la pantalla del cliente, pero sin sesión.
 * Existe para poder VERIFICARLO de punta a punta contra datos de prueba sin
 * entrar al CRM, y para reparaciones puntuales de soporte.
 *
 * En seco por defecto: sin `apply=1` solo devuelve el resumen, no escribe nada.
 * `reenviar=1` le vuelve a mandar correos a la persona — nunca es el defecto.
 *
 * Auth: header `x-internal-key` == INTERNAL_API_KEY.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const expected = process.env.INTERNAL_API_KEY ?? null
  if (!expected) {
    return NextResponse.json({ error: "INTERNAL_API_KEY no configurada" }, { status: 500 })
  }
  const provided =
    req.headers.get("x-internal-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const studioId = url.searchParams.get("studio")
  const clientId = url.searchParams.get("cliente")
  const email = url.searchParams.get("email")
  const aplicar = url.searchParams.get("apply") === "1"
  const reenviar = url.searchParams.get("reenviar") === "1"
  if (!studioId || !clientId || !email) {
    return NextResponse.json(
      { error: "faltan ?studio=&cliente=&email=" },
      { status: 400 },
    )
  }

  try {
    if (!aplicar) {
      return NextResponse.json({
        ok: true,
        aplicado: false,
        preview: await previewClientEmailChange(studioId, clientId, email),
      })
    }
    // actor null = queda registrado como accion del sistema, no de un usuario.
    const r = await changeClientEmail(studioId, null, clientId, email, { reenviar })
    return NextResponse.json({ aplicado: true, ...r })
  } catch (e) {
    console.error("[client-email-change]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    )
  }
}
