import { NextResponse, type NextRequest } from "next/server"

import { untypedService } from "@/server/supabase/untyped"
import { handleInbound } from "@/server/services/ai/whatsapp-bot.service"

/**
 * Webhook de WhatsApp (Meta Cloud API) para el chatbot.
 *
 *   GET  → verificación de Meta (hub.challenge contra el verify_token guardado
 *          en alguna chatflow_connections del bot).
 *   POST → mensajes entrantes → handleInbound() (asistente Gemini responde).
 *
 * Público (sin login): Meta llama esta URL. La autenticidad se valida por el
 * verify_token en GET; los POST se procesan solo si el phone_number_id matchea
 * una conexión registrada.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const mode = params.get("hub.mode")
  const token = params.get("hub.verify_token")
  const challenge = params.get("hub.challenge")

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("Bad Request", { status: 400 })
  }

  // El verify_token debe coincidir con el de alguna conexión WhatsApp registrada.
  const sb = untypedService()
  const { data } = await sb
    .from("chatflow_connections")
    .select("id")
    .eq("channel", "whatsapp")
    .eq("config->>verify_token", token)
    .limit(1)
    .maybeSingle()

  if (!data) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  // Meta espera el challenge en texto plano.
  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  })
}

export async function POST(req: NextRequest) {
  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return new NextResponse("OK", { status: 200 })
  }

  // Respondemos 200 inmediatamente (Meta reintenta si no) y procesamos.
  // El procesamiento es best-effort; los errores se loggean adentro.
  try {
    await handleInbound(payload)
  } catch (e) {
    console.error("[webhook/whatsapp] error", e)
  }
  return new NextResponse("OK", { status: 200 })
}
