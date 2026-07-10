import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import {
  DEFAULT_SELECTION_WA_MESSAGE,
  DEFAULT_DELIVERY_WA_MESSAGE,
  DEFAULT_PRINT_WA_MESSAGE,
  DEFAULT_PRINTS_READY_WA_MESSAGE,
} from "@/lib/share/wa-message"

/**
 * Mensaje de WhatsApp de la galería de SELECCIÓN — fuente única editable.
 * Guardado en `studio_branding.whatsapp_selection_message` (1:1 con el estudio).
 * Lectura directa (no por el RPC de branding) para no depender de sus columnas.
 */
export async function getSelectionWaTemplate(studioId: string): Promise<string> {
  const sb = untypedService()
  const { data } = await sb
    .from("studio_branding")
    .select("whatsapp_selection_message")
    .eq("studio_id", studioId)
    .maybeSingle()
  const v = (data as { whatsapp_selection_message?: string | null } | null)
    ?.whatsapp_selection_message
  return v && v.trim() ? v : DEFAULT_SELECTION_WA_MESSAGE
}

export async function setSelectionWaTemplate(
  studioId: string,
  message: string,
): Promise<void> {
  const sb = untypedService()
  // Asegura que exista la fila de branding (get-or-create) antes de actualizar.
  await sb.rpc("studio_get_or_create_branding", { p_studio_id: studioId })
  const { error } = await sb
    .from("studio_branding")
    .update({ whatsapp_selection_message: message.trim() || null })
    .eq("studio_id", studioId)
  if (error) throw error
}

/**
 * Mensaje de WhatsApp de la ENTREGA FINAL — fuente única editable.
 * Guardado en `studio_branding.whatsapp_delivery_message` (1:1 con el estudio).
 * Variables: {{cliente}}, {{galeria}}, {{link_web}} (descarga web ?entrega=1),
 * {{link_drive}} (Google Drive).
 */
export async function getDeliveryWaTemplate(studioId: string): Promise<string> {
  const sb = untypedService()
  const { data } = await sb
    .from("studio_branding")
    .select("whatsapp_delivery_message")
    .eq("studio_id", studioId)
    .maybeSingle()
  const v = (data as { whatsapp_delivery_message?: string | null } | null)
    ?.whatsapp_delivery_message
  return v && v.trim() ? v : DEFAULT_DELIVERY_WA_MESSAGE
}

export async function setDeliveryWaTemplate(
  studioId: string,
  message: string,
): Promise<void> {
  const sb = untypedService()
  await sb.rpc("studio_get_or_create_branding", { p_studio_id: studioId })
  const { error } = await sb
    .from("studio_branding")
    .update({ whatsapp_delivery_message: message.trim() || null })
    .eq("studio_id", studioId)
  if (error) throw error
}

/**
 * Mensaje de WhatsApp para invitar a elegir IMPRESIONES — fuente única editable.
 * Guardado en `studio_branding.whatsapp_print_message` (1:1 con el estudio).
 * Variables: {{cliente}}, {{galeria}}, {{link}} (galería de entrega).
 */
export async function getPrintWaTemplate(studioId: string): Promise<string> {
  const sb = untypedService()
  const { data } = await sb
    .from("studio_branding")
    .select("whatsapp_print_message")
    .eq("studio_id", studioId)
    .maybeSingle()
  const v = (data as { whatsapp_print_message?: string | null } | null)
    ?.whatsapp_print_message
  return v && v.trim() ? v : DEFAULT_PRINT_WA_MESSAGE
}

export async function setPrintWaTemplate(
  studioId: string,
  message: string,
): Promise<void> {
  const sb = untypedService()
  await sb.rpc("studio_get_or_create_branding", { p_studio_id: studioId })
  const { error } = await sb
    .from("studio_branding")
    .update({ whatsapp_print_message: message.trim() || null })
    .eq("studio_id", studioId)
  if (error) throw error
}

/**
 * Mensaje de WhatsApp para avisar que las IMPRESIONES están LISTAS para retirar
 * — fuente única editable (`studio_branding.whatsapp_prints_ready_message`).
 * Variables: {{cliente}}, {{galeria}}.
 */
export async function getPrintsReadyWaTemplate(studioId: string): Promise<string> {
  const sb = untypedService()
  const { data } = await sb
    .from("studio_branding")
    .select("whatsapp_prints_ready_message")
    .eq("studio_id", studioId)
    .maybeSingle()
  const v = (data as { whatsapp_prints_ready_message?: string | null } | null)
    ?.whatsapp_prints_ready_message
  return v && v.trim() ? v : DEFAULT_PRINTS_READY_WA_MESSAGE
}

export async function setPrintsReadyWaTemplate(
  studioId: string,
  message: string,
): Promise<void> {
  const sb = untypedService()
  await sb.rpc("studio_get_or_create_branding", { p_studio_id: studioId })
  const { error } = await sb
    .from("studio_branding")
    .update({ whatsapp_prints_ready_message: message.trim() || null })
    .eq("studio_id", studioId)
  if (error) throw error
}
