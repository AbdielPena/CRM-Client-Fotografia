import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { normalizeWhatsAppPhone } from "@/server/services/whatsapp/cloud-api.service"

/**
 * Canal WhatsApp del chatbot (separado del WhatsApp transaccional de
 * studio_integrations). Las credenciales del NÚMERO DEL BOT viven en
 * chatflow_connections (channel='whatsapp', config jsonb):
 *   { phone_number_id, access_token, verify_token, business_account_id }
 *
 * Flujo: Meta → POST /api/webhooks/whatsapp → handleInbound() → resuelve el
 * studio por phone_number_id → asistente (Gemini) → responde por el mismo número.
 */

const GRAPH = "https://graph.facebook.com/v21.0"

export interface BotConnection {
  id: string
  studioId: string
  status: string
  phoneNumberId: string
  accessToken: string
  verifyToken: string | null
  businessAccountId: string | null
}

function parseConn(row: unknown): BotConnection | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = row as any
  if (!r) return null
  const c = (r.config ?? {}) as Record<string, string>
  if (!c.phone_number_id || !c.access_token) return null
  return {
    id: r.id,
    studioId: r.studio_id,
    status: r.status,
    phoneNumberId: c.phone_number_id,
    accessToken: c.access_token,
    verifyToken: c.verify_token ?? null,
    businessAccountId: c.business_account_id ?? null,
  }
}

/** Conexión WhatsApp del bot de un studio (o null si no está conectado). */
export async function getBotConnection(studioId: string): Promise<BotConnection | null> {
  const sb = untypedService()
  const { data } = await sb
    .from("chatflow_connections")
    .select("id, studio_id, status, config")
    .eq("studio_id", studioId)
    .eq("channel", "whatsapp")
    .maybeSingle()
  return parseConn(data)
}

/** Resuelve la conexión (y por ende el studio) por el phone_number_id de Meta. */
export async function resolveConnectionByPhoneNumberId(
  phoneNumberId: string,
): Promise<BotConnection | null> {
  const sb = untypedService()
  const { data } = await sb
    .from("chatflow_connections")
    .select("id, studio_id, status, config")
    .eq("channel", "whatsapp")
    .eq("config->>phone_number_id", phoneNumberId)
    .maybeSingle()
  return parseConn(data)
}

/** Envía un texto por el número del bot (dentro de la ventana de 24h). */
export async function sendBotWhatsApp(
  conn: BotConnection,
  to: string,
  text: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const phone = normalizeWhatsAppPhone(to)
  if (!phone) return { ok: false, error: "Número inválido" }
  try {
    const res = await fetch(`${GRAPH}/${conn.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: text.slice(0, 4000) },
      }),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json().catch(() => ({}))) as any
    if (!res.ok) {
      return { ok: false, error: data?.error?.message ?? `HTTP ${res.status}` }
    }
    return { ok: true, id: data?.messages?.[0]?.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red" }
  }
}

/** Contacto + conversación WhatsApp del cliente (reutiliza la abierta). */
async function getOrCreateConversation(
  studioId: string,
  phone: string,
  displayName: string | null,
): Promise<{ conversationId: string; status: string }> {
  const sb = untypedService()

  const { data: contactRow } = await sb
    .from("chatflow_contacts")
    .upsert(
      {
        studio_id: studioId,
        channel: "whatsapp",
        external_id: phone,
        name: displayName ?? null,
        last_in_at: new Date().toISOString(),
      },
      { onConflict: "studio_id,channel,external_id" },
    )
    .select("id")
    .single()
  const contactId = (contactRow as { id: string }).id

  // Vincular con el cliente del CRM si el teléfono coincide (best-effort).
  try {
    const digits = phone.replace(/\D/g, "").slice(-10)
    const { data: cli } = await sb
      .from("clients")
      .select("id, name")
      .eq("studio_id", studioId)
      .is("deleted_at", null)
      .ilike("phone", `%${digits}%`)
      .limit(1)
      .maybeSingle()
    const client = cli as { id: string; name: string } | null
    if (client) {
      await sb
        .from("chatflow_contacts")
        .update({ client_id: client.id, name: displayName ?? client.name })
        .eq("id", contactId)
    }
  } catch {
    /* no crítico */
  }

  const { data: existing } = await sb
    .from("chatflow_conversations")
    .select("id, status")
    .eq("studio_id", studioId)
    .eq("contact_id", contactId)
    .eq("channel", "whatsapp")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const ex = existing as { id: string; status: string } | null
  if (ex) {
    await sb
      .from("chatflow_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        window_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      })
      .eq("id", ex.id)
    return { conversationId: ex.id, status: ex.status }
  }

  const { data: created } = await sb
    .from("chatflow_conversations")
    .insert({
      studio_id: studioId,
      contact_id: contactId,
      channel: "whatsapp",
      status: "open",
      window_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      last_message_at: new Date().toISOString(),
    })
    .select("id, status")
    .single()
  const cr = created as { id: string; status: string }
  return { conversationId: cr.id, status: cr.status }
}

interface ChatflowSettings {
  enabled: boolean
  handoffNotifyWhatsapp: boolean
}

async function getSettings(studioId: string): Promise<ChatflowSettings> {
  const sb = untypedService()
  const { data } = await sb
    .from("chatflow_settings")
    .select("enabled, handoff_notify_whatsapp")
    .eq("studio_id", studioId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = data as any
  return {
    enabled: s ? !!s.enabled : false,
    handoffNotifyWhatsapp: s ? !!s.handoff_notify_whatsapp : false,
  }
}

/**
 * Procesa el payload de un webhook de WhatsApp (Meta). Por cada mensaje de
 * texto entrante: resuelve el studio, corre el asistente y responde.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleInbound(payload: any): Promise<void> {
  const entries = Array.isArray(payload?.entry) ? payload.entry : []
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : []
    for (const change of changes) {
      const value = change?.value
      const phoneNumberId = value?.metadata?.phone_number_id as string | undefined
      const messages = Array.isArray(value?.messages) ? value.messages : []
      if (!phoneNumberId || messages.length === 0) continue

      const conn = await resolveConnectionByPhoneNumberId(phoneNumberId)
      if (!conn || conn.status === "disabled") continue

      const settings = await getSettings(conn.studioId)
      if (!settings.enabled) continue

      const contactName =
        value?.contacts?.[0]?.profile?.name ?? null

      for (const m of messages) {
        if (m?.type !== "text" || !m?.text?.body) continue
        const from = m.from as string
        const text = m.text.body as string

        try {
          const { conversationId, status } = await getOrCreateConversation(
            conn.studioId,
            from,
            contactName,
          )
          // Si la conversación ya está en manos de un humano, no responder
          // automáticamente — solo registrar el mensaje entrante.
          if (status === "needs_human") {
            await logInbound(conn.studioId, conversationId, text)
            continue
          }

          const { sendAssistantMessage } = await import("./assistant.service")
          const reply = await sendAssistantMessage(conn.studioId, conversationId, text)

          if (reply.reply) {
            await sendBotWhatsApp(conn, from, reply.reply)
          }

          if (reply.handoff) {
            await onHandoff(conn, from, contactName, text, settings)
          }
        } catch (e) {
          console.error("[whatsapp-bot] handleInbound error", e)
        }
      }
    }
  }
}

async function logInbound(studioId: string, conversationId: string, text: string): Promise<void> {
  const sb = untypedService()
  await sb.from("chatflow_messages").insert({
    studio_id: studioId,
    conversation_id: conversationId,
    channel: "whatsapp",
    direction: "in",
    type: "text",
    text,
  })
}

/** Avisa al estudio que un cliente necesita atención humana. */
async function onHandoff(
  conn: BotConnection,
  clientPhone: string,
  clientName: string | null,
  lastMsg: string,
  settings: ChatflowSettings,
): Promise<void> {
  const sb = untypedService()
  // 1) Notificación en el CRM
  try {
    await sb.from("notifications").insert({
      studio_id: conn.studioId,
      type: "whatsapp_handoff",
      title: "Un cliente necesita atención humana",
      body: `${clientName ?? clientPhone} en WhatsApp: "${lastMsg.slice(0, 120)}"`,
      action_url: "/chat",
      related_entity_type: "whatsapp",
      related_entity_id: null,
    })
  } catch (e) {
    console.error("[whatsapp-bot] handoff notification failed", e)
  }

  // 2) WhatsApp al número principal del estudio (transaccional), si está activo.
  if (settings.handoffNotifyWhatsapp) {
    try {
      const { data: studio } = await sb
        .from("studios")
        .select("phone")
        .eq("id", conn.studioId)
        .maybeSingle()
      const studioPhone = (studio as { phone?: string | null } | null)?.phone
      if (studioPhone) {
        const { sendTextMessage } = await import("@/server/services/whatsapp/cloud-api.service")
        await sendTextMessage(
          conn.studioId,
          studioPhone,
          `🔔 Un cliente necesita que lo atiendas en WhatsApp:\n${clientName ?? clientPhone}\n"${lastMsg.slice(0, 200)}"`,
        )
      }
    } catch (e) {
      console.error("[whatsapp-bot] handoff WA notification failed", e)
    }
  }
}
