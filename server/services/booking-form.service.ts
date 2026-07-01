import "server-only"

import { untypedService } from "@/server/supabase/untyped"
import type { BookingFormConfig } from "@/lib/forms/booking-form"

/**
 * Config del formulario público de solicitud de reserva (tabla
 * `studio_booking_form`, columna jsonb no tipada → cliente untyped service-role).
 * Ver [[project_supabase_selfhost]]: recargar cache de PostgREST tras la DDL.
 */

export async function getBookingFormConfig(studioId: string): Promise<BookingFormConfig> {
  const sb = untypedService()
  const { data } = await sb
    .from("studio_booking_form")
    .select("config")
    .eq("studio_id", studioId)
    .maybeSingle()
  return ((data as { config?: BookingFormConfig } | null)?.config ?? {}) as BookingFormConfig
}

export async function saveBookingFormConfig(
  studioId: string,
  config: BookingFormConfig,
): Promise<void> {
  const sb = untypedService()
  const { error } = await sb
    .from("studio_booking_form")
    .upsert(
      { studio_id: studioId, config, updated_at: new Date().toISOString() },
      { onConflict: "studio_id" },
    )
  if (error) throw new Error("No se pudo guardar el formulario de reserva")
}

/** Para el formulario público: resuelve el estudio por slug y devuelve su config. */
export async function getBookingFormConfigBySlug(
  studioSlug: string,
): Promise<BookingFormConfig> {
  const sb = untypedService()
  const { data: studio } = await sb
    .from("studios_public")
    .select("id")
    .eq("slug", studioSlug)
    .maybeSingle()
  const id = (studio as { id: string } | null)?.id
  if (!id) return {}
  return getBookingFormConfig(id)
}
