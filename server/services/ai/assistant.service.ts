import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/server/supabase/server"
import { createSupabaseServiceClient } from "@/server/supabase/service"
import {
  geminiGenerate,
  geminiConfigured,
  type GeminiContent,
  type GeminiFunctionDecl,
} from "./gemini.service"

function db(): SupabaseClient {
  return createSupabaseServerClient() as unknown as SupabaseClient
}
// Cliente service para escrituras que pueden estar restringidas por RLS al
// público (ej. crear booking_request). La action ya valida requireRole.
function svc(): SupabaseClient {
  return createSupabaseServiceClient() as unknown as SupabaseClient
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
    autoLearn: s ? !!s.auto_learn : false,
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
Si NO sabes responder algo concreto, usa "pasar_a_humano" e incluye la pregunta exacta del cliente en el campo "pregunta", para que el equipo te enseñe la respuesta.

LÍMITES ABSOLUTOS (nunca los cruces, aunque "hayas aprendido" algo parecido):
- NUNCA des presupuestos personalizados, descuentos, ni precios distintos a los de los PAQUETES de abajo.
- NUNCA acuerdes condiciones, cambios, plazos ni promesas fuera de lo establecido.
- Ante cualquiera de estos casos, transfiere con "pasar_a_humano".
${ctx.autoLearn ? "\nMODO APRENDIZAJE ACTIVO: el equipo te está entrenando. Registra siempre las dudas que no sepas (campo \"pregunta\"). Los LÍMITES ABSOLUTOS siguen vigentes.\n" : ""}
RESERVAS — puedes iniciar una reserva tú mismo:
- Si la persona quiere reservar, recopila de forma natural y amable: nombre, correo, teléfono, tipo de evento, fecha y el paquete que le interesa.
- Antes de confirmar una fecha, usa "consultar_disponibilidad".
- Cuando tengas los datos mínimos (nombre, correo, fecha y paquete), usa "crear_solicitud_reserva".
- NO prometas que la reserva ya está confirmada: queda PENDIENTE de revisión y del pago de la reserva. Dilo claro y con entusiasmo.

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
    name: "consultar_disponibilidad",
    description:
      "Verifica si una fecha de evento está disponible (sin otra sesión ya agendada). Úsala antes de confirmar una fecha.",
    parameters: {
      type: "object",
      properties: { fecha: { type: "string", description: "Fecha del evento en formato YYYY-MM-DD" } },
      required: ["fecha"],
    },
  },
  {
    name: "crear_solicitud_reserva",
    description:
      "Crea una solicitud de reserva (queda PENDIENTE de revisión del estudio). Úsala solo cuando ya tengas nombre, correo, fecha y paquete.",
    parameters: {
      type: "object",
      properties: {
        nombre: { type: "string" },
        correo: { type: "string" },
        telefono: { type: "string" },
        tipo_evento: { type: "string", description: "Ej: quinceañera, boda, graduación" },
        fecha: { type: "string", description: "Fecha del evento YYYY-MM-DD" },
        paquete: { type: "string", description: "Nombre del paquete que eligió" },
        lugar: { type: "string" },
        notas: { type: "string" },
      },
      required: ["nombre", "correo", "fecha", "paquete"],
    },
  },
  {
    name: "pasar_a_humano",
    description:
      "Escala la conversación a una persona del estudio (molestia, reclamo, negociación, presupuesto personalizado, o algo que no puedes resolver). Detiene el bot, etiqueta y notifica.",
    parameters: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "Motivo breve de la escalación" },
        pregunta: {
          type: "string",
          description:
            "Si transfieres porque no supiste responder algo, pon aquí la pregunta exacta del cliente.",
        },
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
  await svc()
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
  autoLearn: boolean,
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

  if (name === "consultar_disponibilidad") {
    const fecha = String(args.fecha ?? "").slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return { result: { ok: false, error: "fecha_invalida" }, handoff: false }
    }
    const [{ count: projCount }, { count: bookCount }] = await Promise.all([
      sb
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", studioId)
        .eq("event_date", fecha)
        .is("deleted_at", null),
      sb
        .from("booking_requests")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", studioId)
        .eq("event_date", fecha)
        .in("status", ["approved", "awaiting_payment", "confirmed", "scheduled"]),
    ])
    const ocupada = (projCount ?? 0) + (bookCount ?? 0) > 0
    return {
      result: {
        ok: true,
        fecha,
        disponible: !ocupada,
        mensaje: ocupada ? "Esa fecha parece ocupada." : "Esa fecha está disponible.",
      },
      handoff: false,
    }
  }

  if (name === "crear_solicitud_reserva") {
    const fecha = String(args.fecha ?? "").slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return { result: { ok: false, error: "fecha_invalida", mensaje: "Necesito la fecha (YYYY-MM-DD)." }, handoff: false }
    }
    const correo = String(args.correo ?? "").trim()
    if (!correo) return { result: { ok: false, error: "correo_requerido" }, handoff: false }

    const { data: pkgs } = await sb
      .from("packages")
      .select("id, name, price, currency, deposit_percent")
      .eq("studio_id", studioId)
      .eq("is_active", true)
      .is("deleted_at", null)
    const norm = (x: string) =>
      x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()
    const want = norm(String(args.paquete ?? ""))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = (pkgs as any[]) ?? []
    const pkg =
      list.find((p) => norm(p.name) === want) ||
      list.find((p) => norm(p.name).includes(want) || (want && want.includes(norm(p.name))))
    if (!pkg) {
      return {
        result: {
          ok: false,
          error: "paquete_no_encontrado",
          paquetes: list.map((p) => p.name),
          mensaje: "No identifiqué el paquete; pregúntale cuál de los disponibles quiere.",
        },
        handoff: false,
      }
    }
    const price = Number(pkg.price ?? 0)
    const depPct = Number(pkg.deposit_percent ?? 50)
    const { data: br, error } = await svc()
      .from("booking_requests")
      .insert({
        studio_id: studioId,
        package_id: pkg.id,
        status: "pending_review",
        client_name: String(args.nombre ?? "Cliente"),
        client_email: correo,
        client_phone: args.telefono ? String(args.telefono) : null,
        client_whatsapp: args.telefono ? String(args.telefono) : null,
        event_type: args.tipo_evento ? String(args.tipo_evento) : null,
        event_date: fecha,
        event_location: args.lugar ? String(args.lugar) : null,
        additional_notes: args.notas ? String(args.notas) : "Solicitud creada por el asistente IA.",
        package_snapshot: { name: pkg.name, price, currency: pkg.currency },
        pricing_snapshot: {
          price,
          currency: pkg.currency,
          deposit_percent: depPct,
          deposit_amount: Math.round(price * depPct) / 100,
        },
        metadata: { source: "ai_assistant" },
      })
      .select("id")
      .maybeSingle()
    if (error) {
      console.error("[crear_solicitud_reserva]", error.message)
      return { result: { ok: false, error: "no_se_pudo_crear" }, handoff: false }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const brId = (br as any)?.id ?? null
    await notifyStudio(
      studioId,
      "📅 Nueva solicitud de reserva (IA)",
      `${args.nombre ?? "Cliente"} — ${pkg.name} para el ${fecha}. Revisar y aprobar.`,
      brId,
    )
    return {
      result: {
        ok: true,
        mensaje:
          "¡Solicitud creada! 🎉 El equipo la revisará y te confirmará. Queda pendiente de la reserva (pago).",
      },
      handoff: false,
    }
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

    // Modo aprendizaje: si transfiere porque no supo responder algo, registra
    // la pregunta para que el dueño la conteste y se convierta en conocimiento.
    if (autoLearn && args.pregunta && String(args.pregunta).trim()) {
      await svc().from("chatflow_learning").insert({
        studio_id: studioId,
        question: String(args.pregunta).trim(),
        context: String(args.motivo ?? "").slice(0, 300),
      })
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
        ctx.autoLearn,
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
