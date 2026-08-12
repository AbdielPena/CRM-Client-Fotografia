import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import {
  AUTOMATIONS,
  automationDef,
  type AutomationConfig,
  type AutomationKey,
} from "@/lib/email/automations"

/**
 * Lectura y escritura del ritmo de los correos automáticos, y el freno por
 * cliente.
 *
 * Dos controles distintos, a propósito:
 *
 *  - **Por flujo** (`email_automations`): cada cuánto insiste un recordatorio
 *    y cuándo se rinde. Aplica a todo el mundo.
 *  - **Por cliente** (`clients.automations_paused_at`): corta TODO lo
 *    automático para una persona. Para cuando el asunto ya se resolvió por
 *    WhatsApp y seguir mandando correos solo molesta.
 *
 * La pausa NO borra nada ni cancela la sesión: solo calla los correos.
 */

export interface AutomationRow extends AutomationConfig {
  key: AutomationKey
}

/** Config de un flujo, con los valores por defecto si aún no se ha tocado. */
function withDefaults(
  key: AutomationKey,
  row: Partial<AutomationConfig> | null,
): AutomationRow {
  const def = automationDef(key)
  const base = def?.defaults ?? {
    enabled: true,
    every_days: null,
    offset_days: null,
    max_days: null,
  }
  return {
    key,
    enabled: row?.enabled ?? base.enabled,
    // `?? base` y no `|| base`: un 0 configurado a mano es un valor válido
    // (ej. "avisar el mismo día") y no debe caer al default.
    every_days: row?.every_days ?? base.every_days,
    offset_days: row?.offset_days ?? base.offset_days,
    max_days: row?.max_days ?? base.max_days,
  }
}

/** Todos los flujos del catálogo, con lo que tenga guardado el estudio. */
export async function getAutomations(
  studioId: string,
): Promise<AutomationRow[]> {
  const sb = untypedService()
  const { data } = await sb
    .from("email_automations")
    .select("key, enabled, every_days, offset_days, max_days")
    .eq("studio_id", studioId)

  const guardadas = new Map<string, Partial<AutomationConfig>>()
  for (const r of (data ?? []) as Array<{ key: string } & AutomationConfig>) {
    guardadas.set(r.key, r)
  }
  return AUTOMATIONS.map((a) => withDefaults(a.key, guardadas.get(a.key) ?? null))
}

/**
 * Config de UN flujo. La usan los barridos del cron, así que ante cualquier
 * fallo devuelve los valores por defecto en vez de lanzar: un error de lectura
 * no debe dejar al estudio sin recordatorios.
 */
export async function getAutomation(
  studioId: string,
  key: AutomationKey,
): Promise<AutomationRow> {
  const sb = untypedService()
  const { data, error } = await sb
    .from("email_automations")
    .select("enabled, every_days, offset_days, max_days")
    .eq("studio_id", studioId)
    .eq("key", key)
    .maybeSingle()

  if (error) {
    console.error("[email-automation] no se pudo leer", key, error)
    return withDefaults(key, null)
  }
  return withDefaults(key, (data as AutomationConfig | null) ?? null)
}

export async function updateAutomation(
  studioId: string,
  key: AutomationKey,
  patch: Partial<AutomationConfig>,
): Promise<{ ok: boolean; error?: string }> {
  const def = automationDef(key)
  if (!def) return { ok: false, error: "Flujo desconocido" }

  // Solo se guardan las perillas que ese flujo declara. Así un valor suelto en
  // el formulario no puede escribir un campo que el flujo ni lee.
  const fila: Record<string, unknown> = {
    studio_id: studioId,
    key,
    enabled: patch.enabled ?? def.defaults.enabled,
    updated_at: new Date().toISOString(),
  }
  for (const f of def.fields) {
    const v = patch[f]
    fila[f] = v == null ? def.defaults[f] : v
  }

  const sb = untypedService()
  const { error } = await sb
    .from("email_automations")
    .upsert(fila, { onConflict: "studio_id,key" })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Freno por cliente
// ─────────────────────────────────────────────────────────────────────────────

export interface ClientEmailControl {
  paused: boolean
  pausedAt: string | null
  reason: string | null
  /** Correos suyos esperando salir de la cola ahora mismo. */
  pendientes: number
}

export async function getClientEmailControl(
  studioId: string,
  clientId: string,
): Promise<ClientEmailControl> {
  const sb = untypedService()
  const { data } = await sb
    .from("clients")
    .select("email, automations_paused_at, automations_paused_reason")
    .eq("studio_id", studioId)
    .eq("id", clientId)
    .maybeSingle()

  const cli = data as {
    email: string | null
    automations_paused_at: string | null
    automations_paused_reason: string | null
  } | null

  let pendientes = 0
  if (cli?.email) {
    const { count } = await sb
      .from("email_queue")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .eq("to_email", cli.email)
      .in("status", ["pending", "sending"])
    pendientes = count ?? 0
  }

  return {
    paused: !!cli?.automations_paused_at,
    pausedAt: cli?.automations_paused_at ?? null,
    reason: cli?.automations_paused_reason ?? null,
    pendientes,
  }
}

/**
 * IDs de los clientes pausados del estudio. Los barridos lo piden UNA vez por
 * corrida y filtran en memoria — preguntar cliente por cliente dentro del bucle
 * serían cientos de consultas por barrido.
 */
export async function getPausedClientIds(
  studioId: string,
): Promise<Set<string>> {
  const sb = untypedService()
  const { data, error } = await sb
    .from("clients")
    .select("id")
    .eq("studio_id", studioId)
    .not("automations_paused_at", "is", null)
  if (error) {
    console.error("[email-automation] no se pudieron leer los pausados", error)
    // Sin la lista no se puede garantizar el freno. Devolver vacío mandaría
    // correos a quien pidió que no le llegaran, así que el caller debe tratar
    // el error como "no mandar" — para eso se relanza.
    throw new Error("No se pudo comprobar qué clientes están pausados")
  }
  return new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id))
}

/**
 * Cancela lo que este cliente tenga esperando en la cola. Solo toca `pending`:
 * una fila en `sending` ya está en manos del servidor de correo y marcarla
 * cancelada no lo detiene, solo mentiría sobre lo que pasó.
 */
export async function cancelPendingEmailsForClient(
  studioId: string,
  clientId: string,
): Promise<number> {
  const sb = untypedService()
  const { data: cli } = await sb
    .from("clients")
    .select("email")
    .eq("studio_id", studioId)
    .eq("id", clientId)
    .maybeSingle()
  const email = (cli as { email: string | null } | null)?.email
  if (!email) return 0

  // `to_email` es citext → `.eq` ya compara sin distinguir mayúsculas y sin
  // que `_` o `%` actúen como comodines.
  const { data, error } = await sb
    .from("email_queue")
    .update({
      status: "cancelled",
      last_error: "cancelado por el estudio (correos pausados)",
      updated_at: new Date().toISOString(),
    })
    .eq("studio_id", studioId)
    .eq("to_email", email)
    .eq("status", "pending")
    .select("id")
  if (error) {
    console.error("[email-automation] no se pudo cancelar la cola", error)
    return 0
  }
  return (data ?? []).length
}

export async function pauseClientEmails(
  studioId: string,
  clientId: string,
  reason: string | null,
): Promise<{ ok: boolean; cancelados: number; error?: string }> {
  const sb = untypedService()
  const { data, error } = await sb
    .from("clients")
    .update({
      automations_paused_at: new Date().toISOString(),
      automations_paused_reason: reason?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("studio_id", studioId)
    .eq("id", clientId)
    .select("id")

  // Un UPDATE frenado por RLS no da error, devuelve 0 filas. Sin esta
  // comprobación la pantalla diría "pausado" y los correos seguirían saliendo.
  if (error) return { ok: false, cancelados: 0, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, cancelados: 0, error: "No se pudo pausar el cliente" }
  }

  const cancelados = await cancelPendingEmailsForClient(studioId, clientId)
  return { ok: true, cancelados }
}

export async function resumeClientEmails(
  studioId: string,
  clientId: string,
): Promise<{ ok: boolean; error?: string }> {
  const sb = untypedService()
  const { data, error } = await sb
    .from("clients")
    .update({
      automations_paused_at: null,
      automations_paused_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("studio_id", studioId)
    .eq("id", clientId)
    .select("id")
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, error: "No se pudo reanudar el cliente" }
  }
  return { ok: true }
}
