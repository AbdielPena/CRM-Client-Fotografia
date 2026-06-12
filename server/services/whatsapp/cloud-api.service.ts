import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import {
  WHATSAPP_TEMPLATE_CATALOG,
  type WhatsAppTemplateDef,
} from "@/lib/whatsapp/meta-templates"

/**
 * WhatsApp Cloud API (Meta Graph API). Credenciales por estudio en
 * studio_integrations (service='whatsapp'): phone_number_id + access_token
 * (+ business_account_id opcional).
 *
 * IMPORTANTE (regla de Meta): los mensajes PROACTIVOS (iniciados por el negocio,
 * fuera de la ventana de 24h tras un mensaje del cliente) DEBEN usar una
 * PLANTILLA aprobada por Meta (sendTemplateMessage). El texto libre
 * (sendTextMessage) solo es válido dentro de esa ventana de 24h.
 */

const SERVICE = "whatsapp"
const GRAPH = "https://graph.facebook.com/v21.0"

export interface WhatsAppConfig {
  phoneNumberId: string
  accessToken: string
  businessAccountId: string | null
  defaultLang: string
  enabled: boolean
}

export interface WhatsAppStatus {
  connected: boolean
  phoneNumberId: string | null
  businessAccountId: string | null
}

export interface SendResult {
  ok: boolean
  id?: string
  error?: string
}

export async function getWhatsAppConfig(studioId: string): Promise<WhatsAppConfig | null> {
  const sb = untypedService()
  const { data } = await sb
    .from("studio_integrations")
    .select("config, is_enabled")
    .eq("studio_id", studioId)
    .eq("service", SERVICE)
    .maybeSingle()
  if (!data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = ((data as any).config ?? {}) as Record<string, string>
  if (!c.phone_number_id || !c.access_token) return null
  return {
    phoneNumberId: c.phone_number_id,
    accessToken: c.access_token,
    businessAccountId: c.business_account_id ?? null,
    defaultLang: c.default_lang ?? "es",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    enabled: !!(data as any).is_enabled,
  }
}

export async function getWhatsAppStatus(studioId: string): Promise<WhatsAppStatus> {
  const cfg = await getWhatsAppConfig(studioId)
  return {
    connected: !!cfg?.enabled,
    phoneNumberId: cfg?.phoneNumberId ?? null,
    businessAccountId: cfg?.businessAccountId ?? null,
  }
}

export async function saveWhatsAppConfig(
  studioId: string,
  input: {
    phoneNumberId: string
    accessToken: string
    businessAccountId?: string | null
    defaultLang?: string | null
  },
): Promise<void> {
  const sb = untypedService()
  const config = {
    phone_number_id: input.phoneNumberId.trim(),
    access_token: input.accessToken.trim(),
    business_account_id: input.businessAccountId?.trim() || null,
    default_lang: (input.defaultLang || "es").trim(),
  }
  const { data: existing } = await sb
    .from("studio_integrations")
    .select("id")
    .eq("studio_id", studioId)
    .eq("service", SERVICE)
    .maybeSingle()
  if (existing) {
    await sb
      .from("studio_integrations")
      .update({ is_enabled: true, config, updated_at: new Date().toISOString() })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq("id", (existing as any).id)
  } else {
    await sb
      .from("studio_integrations")
      .insert({ studio_id: studioId, service: SERVICE, is_enabled: true, config })
  }
}

export async function disconnectWhatsApp(studioId: string): Promise<void> {
  const sb = untypedService()
  await sb
    .from("studio_integrations")
    .update({ is_enabled: false })
    .eq("studio_id", studioId)
    .eq("service", SERVICE)
}

/** Normaliza a dígitos E.164 sin '+'. Devuelve null si es muy corto. */
export function normalizeWhatsAppPhone(phone: string | null | undefined): string | null {
  const digits = (phone || "").replace(/\D/g, "")
  return digits.length >= 10 ? digits : null
}

async function apiSend(cfg: WhatsAppConfig, payload: Record<string, unknown>): Promise<SendResult> {
  try {
    const res = await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json().catch(() => ({}))) as any
    if (!res.ok) {
      const msg = data?.error?.message ?? `HTTP ${res.status}`
      console.error("[whatsapp] send fail", res.status, JSON.stringify(data?.error ?? data).slice(0, 300))
      return { ok: false, error: msg }
    }
    return { ok: true, id: data?.messages?.[0]?.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red" }
  }
}

/** Texto libre — SOLO válido dentro de la ventana de 24h de servicio. */
export async function sendTextMessage(
  studioId: string,
  to: string,
  text: string,
): Promise<SendResult> {
  const cfg = await getWhatsAppConfig(studioId)
  if (!cfg) return { ok: false, error: "WhatsApp no está configurado" }
  const phone = normalizeWhatsAppPhone(to)
  if (!phone) return { ok: false, error: "Número de WhatsApp inválido" }
  return apiSend(cfg, {
    messaging_product: "whatsapp",
    to: phone,
    type: "text",
    text: { body: text },
  })
}

/** Plantilla aprobada — para mensajes proactivos. bodyParams llena {{1}}, {{2}}… */
export async function sendTemplateMessage(
  studioId: string,
  to: string,
  templateName: string,
  langCode: string | null,
  bodyParams: string[] = [],
): Promise<SendResult> {
  const cfg = await getWhatsAppConfig(studioId)
  if (!cfg) return { ok: false, error: "WhatsApp no está configurado" }
  const phone = normalizeWhatsAppPhone(to)
  if (!phone) return { ok: false, error: "Número de WhatsApp inválido" }
  const components =
    bodyParams.length > 0
      ? [{ type: "body", parameters: bodyParams.map((t) => ({ type: "text", text: t })) }]
      : []
  return apiSend(cfg, {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: langCode || cfg.defaultLang || "es" },
      components,
    },
  })
}

/**
 * Prueba de conexión: envía la plantilla pre-aprobada "hello_world" (en_US),
 * que Meta provee por defecto. Funciona sin aprobar plantillas propias.
 */
export async function sendWhatsAppTest(studioId: string, to: string): Promise<SendResult> {
  return sendTemplateMessage(studioId, to, "hello_world", "en_US", [])
}

// ───────────────────────── Plantillas (Message Templates API) ─────────────────────────
// Crear/aprobar plantillas por código vía Graph API, sin la UI de Meta.
// Endpoint: GET/POST /{WABA_ID}/message_templates

export interface TemplateStatus {
  name: string
  /** APPROVED | PENDING | REJECTED | PAUSED | DISABLED… */
  status: string
  category?: string
  language?: string
  id?: string
}

export interface SyncTemplateResult {
  name: string
  label: string
  ok: boolean
  /** estado tras crear (PENDING) o el actual si ya existía. */
  status?: string
  /** true si ya existía y no se recreó. */
  skipped?: boolean
  error?: string
}

/** Lista las plantillas existentes en la WABA con su estado de aprobación. */
export async function listWhatsAppTemplates(
  studioId: string,
): Promise<{ ok: boolean; templates?: TemplateStatus[]; error?: string }> {
  const cfg = await getWhatsAppConfig(studioId)
  if (!cfg) return { ok: false, error: "WhatsApp no está configurado." }
  if (!cfg.businessAccountId)
    return { ok: false, error: "Falta el Business Account ID (WABA) en las credenciales." }
  try {
    const res = await fetch(
      `${GRAPH}/${cfg.businessAccountId}/message_templates?fields=name,status,category,language&limit=200`,
      { headers: { Authorization: `Bearer ${cfg.accessToken}` } },
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json().catch(() => ({}))) as any
    if (!res.ok) return { ok: false, error: data?.error?.message ?? `HTTP ${res.status}` }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const templates: TemplateStatus[] = (data?.data ?? []).map((t: any) => ({
      name: t.name,
      status: t.status,
      category: t.category,
      language: t.language,
      id: t.id,
    }))
    return { ok: true, templates }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red." }
  }
}

/** Crea una plantilla en Meta (queda en revisión / PENDING). */
async function createWhatsAppTemplate(
  cfg: WhatsAppConfig,
  def: WhatsAppTemplateDef,
): Promise<SyncTemplateResult> {
  try {
    const body = {
      name: def.name,
      language: def.language,
      category: def.category,
      components: [
        {
          type: "BODY",
          text: def.body,
          ...(def.example.length > 0 ? { example: { body_text: [def.example] } } : {}),
        },
      ],
    }
    const res = await fetch(`${GRAPH}/${cfg.businessAccountId}/message_templates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json().catch(() => ({}))) as any
    if (!res.ok) {
      const msg = data?.error?.error_user_msg ?? data?.error?.message ?? `HTTP ${res.status}`
      console.error("[whatsapp] template create fail", def.name, JSON.stringify(data?.error ?? data).slice(0, 300))
      return { name: def.name, label: def.label, ok: false, error: msg }
    }
    return { name: def.name, label: def.label, ok: true, status: data?.status ?? "PENDING" }
  } catch (e) {
    return { name: def.name, label: def.label, ok: false, error: e instanceof Error ? e.message : "Error de red." }
  }
}

/**
 * Sincroniza el catálogo de PixelOS con Meta: crea las plantillas que aún
 * no existen en la WABA (las existentes se omiten, conservando su estado).
 */
export async function syncWhatsAppTemplates(
  studioId: string,
): Promise<{ ok: boolean; error?: string; results?: SyncTemplateResult[] }> {
  const cfg = await getWhatsAppConfig(studioId)
  if (!cfg) return { ok: false, error: "WhatsApp no está configurado." }
  if (!cfg.businessAccountId)
    return {
      ok: false,
      error:
        "Falta el Business Account ID (WABA). Guárdalo en las credenciales para poder crear plantillas.",
    }

  // Plantillas ya existentes (por nombre) para no duplicar.
  const existing = await listWhatsAppTemplates(studioId)
  if (!existing.ok) return { ok: false, error: existing.error }
  const byName = new Map((existing.templates ?? []).map((t) => [t.name, t]))

  const results: SyncTemplateResult[] = []
  for (const def of WHATSAPP_TEMPLATE_CATALOG) {
    const cur = byName.get(def.name)
    if (cur) {
      results.push({ name: def.name, label: def.label, ok: true, skipped: true, status: cur.status })
      continue
    }
    results.push(await createWhatsAppTemplate(cfg, def))
  }
  return { ok: true, results }
}
