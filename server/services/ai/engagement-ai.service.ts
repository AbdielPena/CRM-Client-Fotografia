import "server-only"

import { geminiGenerate, geminiConfigured } from "./gemini.service"
import { untypedService } from "@/server/supabase/untyped"

/**
 * Redacción de mensajes de fidelización con IA (Gemini, gratis). Reutiliza la
 * "voz" del estudio (chatflow_settings.persona + nombre) para que los mensajes
 * suenen a la marca. Devuelve HTML simple para email o texto plano para WhatsApp;
 * el sistema de plantillas/branding se aplica después igual que los templates.
 */

export interface DraftInput {
  channel: "email" | "whatsapp"
  /** De qué trata el mensaje (intención). Ej: "felicitar cumpleaños", "reactivar cliente inactivo". */
  brief: string
  clientName?: string | null
  tone?: string | null
}

export interface DraftResult {
  subject?: string
  /** email → HTML simple (<p>…); whatsapp → texto plano con emojis. Conserva {{client_name}}/{{studio_name}}. */
  body: string
  error?: string
}

export function engagementAiAvailable(): boolean {
  return geminiConfigured()
}

async function loadVoice(
  studioId: string,
): Promise<{ studioName: string; persona: string | null }> {
  const sb = untypedService()
  const [studioRes, cfgRes] = await Promise.all([
    sb.from("studios").select("name").eq("id", studioId).maybeSingle(),
    sb
      .from("chatflow_settings")
      .select("persona")
      .eq("studio_id", studioId)
      .maybeSingle(),
  ])
  return {
    studioName: (studioRes.data as { name?: string } | null)?.name ?? "el estudio",
    persona: (cfgRes.data as { persona?: string | null } | null)?.persona ?? null,
  }
}

function parseJsonLoose(text: string): Record<string, unknown> | null {
  let t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
  const start = t.indexOf("{")
  const end = t.lastIndexOf("}")
  if (start === -1 || end === -1 || end < start) return null
  try {
    return JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export async function draftMessage(
  studioId: string,
  input: DraftInput,
): Promise<DraftResult> {
  if (!geminiConfigured()) return { body: "", error: "GEMINI_NOT_CONFIGURED" }

  const voice = await loadVoice(studioId)
  const isEmail = input.channel === "email"
  const tone = input.tone?.trim() || "cálido, cercano y humano"

  const system = [
    `Eres el redactor de mensajes de fidelización de "${voice.studioName}", un estudio de fotografía en República Dominicana.`,
    voice.persona ? `Voz/personalidad de la marca: ${voice.persona}` : "",
    `Escribe en español dominicano, tono ${tone}. Sé breve, natural y nada robótico ni spam.`,
    `Usa las variables {{client_name}} y {{studio_name}} TAL CUAL (con las llaves dobles) donde corresponda; el sistema las reemplaza por los datos reales.`,
    `No inventes precios, fechas, descuentos ni promociones concretas salvo que el brief los indique.`,
    isEmail
      ? `Responde SOLO un JSON válido, sin markdown ni explicaciones: {"subject":"...","body":"..."}. "body" es HTML simple (solo <p>, <strong>, <br>, emojis con moderación), 2-4 párrafos cortos.`
      : `Responde SOLO un JSON válido, sin markdown ni explicaciones: {"body":"..."}. "body" es texto plano para WhatsApp (sin HTML), 2-4 líneas, con 1-2 emojis.`,
  ]
    .filter(Boolean)
    .join("\n")

  const userMsg = [
    `Brief del mensaje: ${input.brief}`,
    input.clientName ? `Nombre del cliente de ejemplo: ${input.clientName}` : "",
    "Genera el mensaje ahora. SOLO el JSON.",
  ]
    .filter(Boolean)
    .join("\n")

  const r = await geminiGenerate({
    system,
    contents: [{ role: "user", parts: [{ text: userMsg }] }],
    temperature: 0.85,
  })
  if (r.error || !r.text) return { body: "", error: r.error ?? "EMPTY" }

  const parsed = parseJsonLoose(r.text)
  if (!parsed || typeof parsed.body !== "string" || !parsed.body.trim()) {
    // Fallback: usa el texto crudo como cuerpo.
    return isEmail
      ? { subject: "", body: `<p>${escapeHtml(r.text)}</p>` }
      : { body: r.text.trim() }
  }
  return {
    subject: isEmail ? String(parsed.subject ?? "") : undefined,
    body: String(parsed.body),
  }
}
