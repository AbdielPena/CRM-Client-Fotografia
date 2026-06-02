import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/server/supabase/server"
import {
  geminiGenerate,
  geminiConfigured,
  type GeminiContent,
  type GeminiFunctionDecl,
} from "./gemini.service"

function db(): SupabaseClient {
  return createSupabaseServerClient() as unknown as SupabaseClient
}

// ─────────────────────────── Contexto / conocimiento ───────────────────────────

async function loadContext(studioId: string) {
  const sb = db()
  const [studioRes, settingsRes, pkgRes, faqRes] = await Promise.all([
    sb.from("studios").select("name").eq("id", studioId).maybeSingle(),
    sb.from("chatflow_settings").select("*").eq("studio_id", studioId).maybeSingle(),
    sb
      .from("packages")
      .select("name, price, currency, includes, deposit_percent, delivery_days, event_type")
      .eq("studio_id", studioId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("price", { ascending: true }),
    sb
      .from("chatflow_knowledge")
      .select("kind, question, answer")
      .eq("studio_id", studioId)
      .eq("is_active", true),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = settingsRes.data as any
  return {
    studioName: (studioRes.data as { name?: string } | null)?.name ?? "el estudio",
    assistantName: s?.assistant_name ?? "Asistente",
    persona: (s?.persona as string | null) ?? null,
    greeting: (s?.greeting as string | null) ?? null,
    enabled: s ? !!s.enabled : true,
    handoffEnabled: s ? !!s.handoff_enabled : true,
    handoffTag: (s?.handoff_tag as string | null) ?? "Transferido a un agente",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    packages: (pkgRes.data as any[]) ?? [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    faqs: (faqRes.data as any[]) ?? [],
  }
}

function buildSystemPrompt(ctx: Awaited<ReturnType<typeof loadContext>>): string {
  const money = (n: unknown, c: unknown) =>
    `${(c as string) || "DOP"} ${Number(n ?? 0).toLocaleString("es-DO")}`
  const pkgLines = ctx.packages.length
    ? ctx.packages
        .map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p: any) =>
            `- ${p.name}: ${money(p.price, p.currency)}.` +
            (Array.isArray(p.includes) && p.includes.length
              ? ` Incluye: ${p.includes.join(", ")}.`
              : "") +
            (p.deposit_percent ? ` Reserva ${p.deposit_percent}%.` : "") +
            (p.delivery_days ? ` Entrega ~${p.delivery_days} días.` : ""),
        )
        .join("\n")
    : "(No hay paquetes cargados. No inventes precios; ofrece pasar a un humano.)"

  const faqLines = ctx.faqs.length
    ? ctx.faqs
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((f: any) => `- P: ${f.question ?? ""}\n  R: ${f.answer}`)
        .join("\n")
    : "(Sin FAQ cargadas.)"

  return `Eres ${ctx.assistantName}, el asistente virtual de ${ctx.studioName}, un estudio de fotografía en República Dominicana.
${ctx.persona ? `\nPersonalidad e instrucciones del negocio:\n${ctx.persona}\n` : ""}
REGLAS IMPORTANTES:
- Responde en español dominicano: cálido, cercano, humano y profesional. Mensajes cortos y claros, con algún emoji ocasional.
- NUNCA inventes precios, fechas, ni políticas. Usa SOLO la información de abajo.
- Si preguntan por precios o paquetes, responde con los PAQUETES de abajo.
- Si la persona muestra interés real (quiere reservar, pide info para agendar, deja sus datos), usa la herramienta "capturar_lead".
- No prometas nada que no esté en la información provista.

CUÁNDO TRANSFERIR A UN HUMANO — usa SIEMPRE la herramienta "pasar_a_humano" en estos casos (es mejor transferir que adivinar):
- No tienes la respuesta, o la información no está en lo de abajo.
- Te piden algo fuera de tus paquetes/datos, o un caso especial/puntual.
- Quieren negociar precio, descuento o un trato especial.
- Hay molestia, queja, reclamo o enojo.
- Es una solicitud compleja: cambios de contrato, reprogramar, urgencias, temas legales o de pago.
- Piden explícitamente hablar con una persona o agente.
Cuando transfieras, hazlo con calidez (ej: "Te paso con un agente del equipo para ayudarte mejor 🙌") y NO sigas intentando resolverlo por tu cuenta.

PAQUETES DISPONIBLES:
${pkgLines}

PREGUNTAS FRECUENTES:
${faqLines}`
}

// ─────────────────────────── Herramientas (acciones reales) ───────────────────────────

const TOOLS: GeminiFunctionDecl[] = [
  {
    name: "capturar_lead",
    description:
      "Guarda a la persona como lead cuando muestra interés real (quiere reservar, pide info para agendar, deja sus datos). Notifica al estudio.",
    parameters: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre de la persona" },
        interes: { type: "string", description: "Qué le interesa (ej. quinceañera, boda)" },
        telefono: { type: "string", description: "Teléfono o WhatsApp si lo dio" },
      },
      required: ["nombre"],
    },
  },
  {
    name: "pasar_a_humano",
    description:
      "Escala la conversación a una persona del estudio cuando hay molestia, reclamo, o algo que no puedes resolver. Detiene el bot y notifica al admin.",
    parameters: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "Motivo breve de la escalación" },
      },
      required: ["motivo"],
    },
  },
]

async function notifyStudio(
  studioId: string,
  title: string,
  body: string,
  entityId?: string | null,
) {
  await db()
    .from("notifications")
    .insert({
      studio_id: studioId,
      type: "system",
      title,
      body,
      related_entity_type: "chatflow",
      related_entity_id: entityId ?? null,
    })
}

async function executeTool(
  studioId: string,
  conversationId: string,
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: Record<string, any>,
  handoffTag: string,
): Promise<{ result: Record<string, unknown>; handoff: boolean }> {
  const sb = db()
  if (name === "capturar_lead") {
    const phone = String(args.telefono ?? "").replace(/\D/g, "")
    const externalId = phone || `lead-${Date.now()}`
    const { data: contact } = await sb
      .from("chatflow_contacts")
      .upsert(
        {
          studio_id: studioId,
          channel: "web",
          external_id: externalId,
          name: args.nombre ?? null,
          tags: ["lead"],
          last_in_at: new Date().toISOString(),
        },
        { onConflict: "studio_id,channel,external_id" },
      )
      .select("id")
      .maybeSingle()
    await notifyStudio(
      studioId,
      "🎯 Nuevo lead del asistente",
      `${args.nombre ?? "Alguien"}${args.interes ? ` — interesado en ${args.interes}` : ""}${phone ? ` · ${phone}` : ""}.`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (contact as any)?.id ?? null,
    )
    return { result: { ok: true, mensaje: "Lead guardado y estudio notificado." }, handoff: false }
  }
  if (name === "pasar_a_humano") {
    // Marcar la conversación y recuperar el contacto
    const { data: conv } = await sb
      .from("chatflow_conversations")
      .update({ status: "needs_human" })
      .eq("id", conversationId)
      .eq("studio_id", studioId)
      .select("contact_id")
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contactId = (conv as any)?.contact_id as string | undefined

    // Etiquetar el contacto (estilo ManyChat): "Transferido a un agente"
    if (contactId && handoffTag) {
      const { data: c } = await sb
        .from("chatflow_contacts")
        .select("tags")
        .eq("id", contactId)
        .maybeSingle()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tags: string[] = ((c as any)?.tags as string[]) ?? []
      if (!tags.includes(handoffTag)) {
        await sb
          .from("chatflow_contacts")
          .update({ tags: [...tags, handoffTag] })
          .eq("id", contactId)
          .eq("studio_id", studioId)
      }
    }

    await notifyStudio(
      studioId,
      "🙋 Chat transferido a un agente",
      String(args.motivo ?? "Conversación que requiere atención.") +
        (handoffTag ? ` · etiqueta: ${handoffTag}` : ""),
      conversationId,
    )
    return {
      result: {
        ok: true,
        mensaje: `Conversación transferida a un agente y etiquetada como "${handoffTag}".`,
      },
      handoff: true,
    }
  }
  return { result: { ok: false, error: "tool_desconocida" }, handoff: false }
}

// ─────────────────────────── Conversación ───────────────────────────

async function ensureConversation(
  studioId: string,
  conversationId: string | null,
): Promise<string> {
  const sb = db()
  if (conversationId) return conversationId
  // Contacto + conversación de prueba (canal web)
  const { data: contact } = await sb
    .from("chatflow_contacts")
    .upsert(
      {
        studio_id: studioId,
        channel: "web",
        external_id: `test-${Date.now()}`,
        name: "Prueba (web)",
      },
      { onConflict: "studio_id,channel,external_id" },
    )
    .select("id")
    .single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contactId = (contact as any).id as string
  const { data: conv } = await sb
    .from("chatflow_conversations")
    .insert({ studio_id: studioId, contact_id: contactId, channel: "web", status: "open" })
    .select("id")
    .single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (conv as any).id as string
}

async function loadHistory(studioId: string, conversationId: string): Promise<GeminiContent[]> {
  const { data } = await db()
    .from("chatflow_messages")
    .select("direction, text")
    .eq("studio_id", studioId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(20)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as any[]) ?? [])
    .filter((m) => m.text)
    .map((m) => ({
      role: m.direction === "in" ? "user" : "model",
      parts: [{ text: m.text as string }],
    }))
}

export interface AssistantReply {
  reply: string
  conversationId: string
  handoff: boolean
  error?: string
}

export async function sendAssistantMessage(
  studioId: string,
  conversationId: string | null,
  userText: string,
): Promise<AssistantReply> {
  if (!geminiConfigured()) {
    return { reply: "", conversationId: conversationId ?? "", handoff: false, error: "IA no configurada" }
  }
  const sb = db()
  const ctx = await loadContext(studioId)
  const convId = await ensureConversation(studioId, conversationId)

  // Guardar mensaje del usuario
  await sb.from("chatflow_messages").insert({
    studio_id: studioId,
    conversation_id: convId,
    channel: "web",
    direction: "in",
    type: "text",
    text: userText,
  })

  const system = buildSystemPrompt(ctx)
  const history = await loadHistory(studioId, convId)
  const contents: GeminiContent[] = [...history, { role: "user", parts: [{ text: userText }] }]

  let handoff = false
  let finalText = ""
  for (let i = 0; i < 4; i++) {
    const r = await geminiGenerate({ system, contents, tools: TOOLS })
    if (r.error) {
      finalText = "Disculpa, tuve un problemita técnico 🙈. ¿Puedes repetirme?"
      break
    }
    if (r.functionCall) {
      const exec = await executeTool(
        studioId,
        convId,
        r.functionCall.name,
        r.functionCall.args,
        ctx.handoffTag,
      )
      if (exec.handoff) handoff = true
      contents.push({ role: "model", parts: [{ functionCall: r.functionCall }] })
      contents.push({
        role: "function",
        parts: [{ functionResponse: { name: r.functionCall.name, response: exec.result } }],
      })
      continue
    }
    finalText = r.text
    break
  }
  if (!finalText) finalText = "¿En qué más te puedo ayudar? 😊"

  // Guardar respuesta del asistente
  await sb.from("chatflow_messages").insert({
    studio_id: studioId,
    conversation_id: convId,
    channel: "web",
    direction: "out",
    type: "text",
    text: finalText,
  })
  await sb
    .from("chatflow_conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", convId)

  return { reply: finalText, conversationId: convId, handoff }
}
