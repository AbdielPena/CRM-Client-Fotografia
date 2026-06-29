import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import { DEFAULT_SELECTION_WA_MESSAGE } from "@/lib/share/wa-message"

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
