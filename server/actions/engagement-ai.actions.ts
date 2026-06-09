"use server"

import { requireStudioAuth } from "@/server/middleware/auth"
import {
  draftMessage,
  engagementAiAvailable,
  type DraftInput,
} from "@/server/services/ai/engagement-ai.service"

/**
 * Redacta un mensaje (email o WhatsApp) con IA bajo demanda — usado por el
 * Flow Builder (previsualizar) y el composer de campañas por segmento.
 */
export async function draftEngagementMessageAction(input: DraftInput) {
  const session = await requireStudioAuth()
  if (!engagementAiAvailable()) {
    return { ok: false as const, error: "La IA (Gemini) no está configurada en este servidor." }
  }
  if (!input?.brief?.trim()) {
    return { ok: false as const, error: "Describe brevemente de qué trata el mensaje." }
  }
  try {
    const r = await draftMessage(session.studioId, {
      channel: input.channel === "whatsapp" ? "whatsapp" : "email",
      brief: input.brief,
      clientName: input.clientName ?? null,
      tone: input.tone ?? null,
    })
    if (r.error) {
      return {
        ok: false as const,
        error:
          r.error === "GEMINI_NOT_CONFIGURED"
            ? "La IA no está configurada."
            : "No se pudo generar el mensaje. Intenta de nuevo.",
      }
    }
    return { ok: true as const, subject: r.subject ?? "", body: r.body }
  } catch {
    return { ok: false as const, error: "No se pudo generar el mensaje." }
  }
}
