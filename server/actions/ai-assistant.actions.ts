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
    updated_at: new Date().toISOString(),
  }
  const { error } = await db()
    .from("chatflow_settings")
    .upsert(row, { onConflict: "studio_id" })
  if (error) console.error("[saveAssistantSettings]", error.message)
  revalidatePath("/ai-assistant")
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
