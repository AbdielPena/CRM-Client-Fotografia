"use server"

import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"
import { requireRole } from "@/server/middleware/auth"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { sendAssistantMessage } from "@/server/services/ai/assistant.service"

function db(): SupabaseClient {
  return createSupabaseServerClient() as unknown as SupabaseClient
}

export async function sendAssistantMessageAction(
  conversationId: string | null,
  text: string,
) {
  const session = await requireRole("staff")
  const clean = (text ?? "").trim()
  if (!clean) return { error: "Mensaje vacío" }
  const r = await sendAssistantMessage(session.studioId, conversationId, clean)
  return r
}

export async function saveAssistantSettingsAction(formData: FormData): Promise<void> {
  const session = await requireRole("staff")
  const row = {
    studio_id: session.studioId,
    assistant_name: ((formData.get("assistant_name") as string) || "Asistente").trim(),
    persona: ((formData.get("persona") as string) || "").trim() || null,
    greeting: ((formData.get("greeting") as string) || "").trim() || null,
    enabled: formData.get("enabled") !== "false",
    handoff_enabled: formData.get("handoff_enabled") !== "false",
    handoff_tag:
      ((formData.get("handoff_tag") as string) || "Transferido a un agente").trim(),
    auto_learn: formData.get("auto_learn") === "true",
    handoff_notify_whatsapp: formData.get("handoff_notify_whatsapp") === "true",
    mirror_emails: formData.get("mirror_emails") === "true",
    updated_at: new Date().toISOString(),
  }
  const { error } = await db()
    .from("chatflow_settings")
    .upsert(row, { onConflict: "studio_id" })
  if (error) console.error("[saveAssistantSettings]", error.message)
  revalidatePath("/ai-assistant")
}

/**
 * Guarda/actualiza la conexión del NÚMERO DEL BOT en WhatsApp
 * (chatflow_connections). Genera un verify_token si no se mandó uno.
 */
export async function saveWhatsAppBotConnectionAction(formData: FormData) {
  const session = await requireRole("admin")
  const phoneNumberId = ((formData.get("phone_number_id") as string) || "").trim()
  const accessToken = ((formData.get("access_token") as string) || "").trim()
  const businessAccountId = ((formData.get("business_account_id") as string) || "").trim()
  if (!phoneNumberId || !accessToken) {
    return { error: "Faltan el Phone Number ID o el Access Token" }
  }

  const sb = db()
  // Conservar el verify_token existente o generar uno nuevo.
  const { data: existing } = await sb
    .from("chatflow_connections")
    .select("id, config")
    .eq("studio_id", session.studioId)
    .eq("channel", "whatsapp")
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prevCfg = (existing as any)?.config ?? {}
  const verifyToken: string =
    ((formData.get("verify_token") as string) || "").trim() ||
    (prevCfg.verify_token as string | undefined) ||
    `pixelos_${randomToken()}`

  const config = {
    phone_number_id: phoneNumberId,
    access_token: accessToken,
    business_account_id: businessAccountId || null,
    verify_token: verifyToken,
  }

  const { error } = await sb.from("chatflow_connections").upsert(
    {
      studio_id: session.studioId,
      channel: "whatsapp",
      status: "connected",
      config,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "studio_id,channel" },
  )
  if (error) return { error: error.message }
  revalidatePath("/ai-assistant")
  return { success: true, verifyToken }
}

/** Activa/desactiva el canal WhatsApp del bot. */
export async function toggleWhatsAppBotAction(enable: boolean) {
  const session = await requireRole("admin")
  const { error } = await db()
    .from("chatflow_connections")
    .update({ status: enable ? "connected" : "disabled", updated_at: new Date().toISOString() })
    .eq("studio_id", session.studioId)
    .eq("channel", "whatsapp")
  if (error) return { error: error.message }
  revalidatePath("/ai-assistant")
  return { success: true }
}

function randomToken(): string {
  // 16 bytes hex sin depender de crypto del navegador.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("crypto").randomBytes(16).toString("hex")
}

export async function addKnowledgeAction(formData: FormData) {
  const session = await requireRole("staff")
  const answer = ((formData.get("answer") as string) || "").trim()
  if (!answer) return { error: "La respuesta es requerida" }
  const { error } = await db().from("chatflow_knowledge").insert({
    studio_id: session.studioId,
    kind: ((formData.get("kind") as string) || "faq").trim(),
    question: ((formData.get("question") as string) || "").trim() || null,
    answer,
  })
  if (error) return { error: error.message }
  revalidatePath("/ai-assistant")
  return { success: true }
}

export async function deleteKnowledgeAction(id: string) {
  const session = await requireRole("staff")
  const { error } = await db()
    .from("chatflow_knowledge")
    .delete()
    .eq("id", id)
    .eq("studio_id", session.studioId)
  if (error) return { error: error.message }
  revalidatePath("/ai-assistant")
  return { success: true }
}

// Aprendizaje: el dueño contesta una pregunta que la IA no supo → se vuelve
// conocimiento y la IA la usará desde ahora.
export async function resolveLearningAction(id: string, question: string, answer: string) {
  const session = await requireRole("staff")
  const clean = (answer ?? "").trim()
  if (!clean) return { error: "Escribe la respuesta" }
  const sb = db()
  const { error: kErr } = await sb.from("chatflow_knowledge").insert({
    studio_id: session.studioId,
    kind: "faq",
    question: (question ?? "").trim() || null,
    answer: clean,
  })
  if (kErr) return { error: kErr.message }
  await sb
    .from("chatflow_learning")
    .update({ status: "resuelta", resolved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("studio_id", session.studioId)
  revalidatePath("/ai-assistant")
  return { success: true }
}

export async function ignoreLearningAction(id: string) {
  const session = await requireRole("staff")
  await db()
    .from("chatflow_learning")
    .update({ status: "ignorada" })
    .eq("id", id)
    .eq("studio_id", session.studioId)
  revalidatePath("/ai-assistant")
  return { success: true }
}
